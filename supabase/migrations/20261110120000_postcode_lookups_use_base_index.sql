-- Lookups of the public registrations in one postcode scanned every shelter.
--
-- app_v2.shelter_public_v2 filters on coalesce(override.postal_code,
-- shelter.postal_code) and looks up the active override row by row, so a
-- "postal_code = '8210'" filter on the view cannot use an index: 46 ms and a
-- sequential scan of ~23,600 rows with ~12,000 override lookups per call
-- (review of 10 November 2026, M1).
--
-- These functions first narrow the candidates by the base table's postal_code
-- (and by active overrides that set the postcode), and only then join the
-- candidates to the public view by id. The view still decides what is public
-- and which postcode and address apply, so the result is the same rows the
-- view would give for "postal_code = p_postal_code".

create index if not exists app_v2_shelters_postal_code_idx
on app_v2.shelters (postal_code)
where import_state = 'active' and publication_state = 'published';

comment on index app_v2.app_v2_shelters_postal_code_idx is
'Narrows public postcode lookups (public_shelters_in_postcode_v1, public_plain_path_owner_ids_v1) before the public view is applied.';

-- Candidate ids for a postcode: the shelter's own postcode, plus shelters
-- whose active override sets it (the view lets an override win). The index
-- above only holds active, published rows, so repeat its predicate here.
create or replace function app_v2.public_shelters_in_postcode_v1(p_postal_code text)
returns table (
  id uuid,
  slug text,
  address_line1 text,
  postal_code text,
  city text,
  capacity integer
)
language sql
stable
security definer
set search_path = ''
as $$
  -- The candidates are passed as an array, not joined: a join lets the planner
  -- start from the whole view (hash join, 75 ms), while "id = any(array)" makes
  -- it fetch only the candidate shelters by primary key (under 1 ms).
  select
    public_shelter.id,
    public_shelter.slug,
    public_shelter.address_line1,
    public_shelter.postal_code,
    public_shelter.city,
    public_shelter.capacity
  from app_v2.shelter_public_v2 public_shelter
  where public_shelter.id = any (array(
      select shelter.id
      from app_v2.shelters shelter
      where shelter.postal_code = p_postal_code
        and shelter.import_state = 'active'
        and shelter.publication_state = 'published'
      union
      select override_row.shelter_id
      from app_v2.shelter_overrides override_row
      where override_row.is_active = true
        and override_row.postal_code = p_postal_code
    ))
    and public_shelter.postal_code = p_postal_code
  order by public_shelter.id;
$$;

revoke all on function app_v2.public_shelters_in_postcode_v1(text) from public, anon, authenticated;
grant execute on function app_v2.public_shelters_in_postcode_v1(text) to anon, authenticated, service_role;

comment on function app_v2.public_shelters_in_postcode_v1(text) is
'Public registrations in one postcode (same rows as shelter_public_v2 filtered on postal_code), found through the base-table postcode index. Ordered by id for stable paging.';

-- The owners of the plain readable path. With a postcode the search now starts
-- from public_shelters_in_postcode_v1; without one (the sitemap) it is the
-- full read it always was. plpgsql, so the two branches get their own plans.
create or replace function app_v2.public_plain_path_owner_ids_v1(p_postal_code text default null)
returns setof uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_postal_code is null then
    return query
    select public_shelter.id
    from app_v2.shelter_public_v2 public_shelter
    inner join app_v2.shelter_path_aliases alias
      on alias.shelter_id = public_shelter.id
     and alias.valid_to is null
     and alias.path_slug = app_v2.readable_shelter_base_slug_v1(
       public_shelter.address_line1, public_shelter.postal_code, public_shelter.city)
    order by public_shelter.id;
  else
    return query
    select in_postcode.id
    from app_v2.public_shelters_in_postcode_v1(p_postal_code) in_postcode
    inner join app_v2.shelter_path_aliases alias
      on alias.shelter_id = in_postcode.id
     and alias.valid_to is null
     and alias.path_slug = app_v2.readable_shelter_base_slug_v1(
       in_postcode.address_line1, in_postcode.postal_code, in_postcode.city)
    order by in_postcode.id;
  end if;
end;
$$;

revoke all on function app_v2.public_plain_path_owner_ids_v1(text) from public, anon, authenticated;
grant execute on function app_v2.public_plain_path_owner_ids_v1(text) to anon, authenticated, service_role;
