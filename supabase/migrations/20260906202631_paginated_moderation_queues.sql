-- Paginated private queues: status filtering precedes pagination and counts cover all rows.
-- Keep v1 available for older app deployments; both versions enforce moderator MFA.

create or replace function app_v2.list_shelter_reports_for_moderation_v2(
  p_status text default null,
  p_limit integer default 50,
  p_page integer default 1
)
returns jsonb
language plpgsql
stable
security definer
set search_path = app_v2, pg_temp
as $$
declare
  v_counts jsonb;
  v_total bigint;
  v_page integer;
  v_pages integer;
  v_rows jsonb;
begin
  if app_v2.current_moderator_account_id_v1(true) is null then
    raise exception 'moderator MFA required' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('open', 'reviewing', 'resolved', 'rejected') then
    raise exception 'unsupported queue status' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 250 or p_page is null or p_page < 1 then
    raise exception 'invalid queue pagination' using errcode = '22023';
  end if;

  select coalesce(jsonb_object_agg(status, quantity), '{}'::jsonb)
  into v_counts
  from (select status, count(*) as quantity from app_v2.shelter_reports group by status) counts;
  select count(*) into v_total from app_v2.shelter_reports where p_status is null or status = p_status;
  v_pages := greatest(1, ceil(v_total::numeric / p_limit)::integer);
  v_page := least(p_page, v_pages);

  with page_rows (report_id, report_status, report_type, report_message, contact_email, report_created_at, report_updated_at, resolution_note, resolution_outcome, reviewed_at, shelter_id, shelter_slug, address_line1, postal_code, city, capacity, publication_state, municipality_name) as (
  select
    report.id,
    report.status,
    report.report_type,
    report.message,
    case
      when report.status in ('open', 'reviewing')
        and report.contact_retention_until > timezone('utc', now())
      then report.contact_email
      else null
    end,
    report.created_at,
    report.updated_at,
    report.resolution_note,
    report.resolution_outcome,
    report.reviewed_at,
    shelter.id,
    shelter.slug,
    coalesce(override_row.address_line1, shelter.address_line1),
    coalesce(override_row.postal_code, shelter.postal_code),
    coalesce(override_row.city, shelter.city),
    coalesce(override_row.capacity, shelter.capacity),
    shelter.publication_state,
    municipality.name
  from app_v2.shelter_reports report
  join app_v2.shelters shelter on shelter.id = report.shelter_id
  join app_v2.municipalities municipality on municipality.id = shelter.municipality_id
  left join lateral (
    select active_override.*
    from app_v2.shelter_overrides active_override
    where active_override.shelter_id = shelter.id
      and active_override.is_active = true
      and active_override.effective_from <= timezone('utc', now())
      and (
        active_override.effective_until is null
        or active_override.effective_until > timezone('utc', now())
      )
    order by active_override.effective_from desc, active_override.created_at desc
    limit 1
  ) override_row on true
  where p_status is null or report.status = p_status
  order by
    case report.status
      when 'open' then 1
      when 'reviewing' then 2
      when 'resolved' then 3
      else 4
    end,
    report.created_at desc, report.id
  limit p_limit offset ((v_page::bigint - 1) * p_limit)
  )
  select coalesce(jsonb_agg(to_jsonb(page_rows) order by case report_status when 'open' then 1 when 'reviewing' then 2 when 'resolved' then 3 else 4 end, report_created_at desc, report_id), '[]'::jsonb)
  into v_rows from page_rows;

  return jsonb_build_object(
    'rows', v_rows, 'counts', v_counts, 'totalCount', v_total,
    'page', v_page, 'pageSize', p_limit, 'totalPages', v_pages
  );
end;
$$;

revoke all on function app_v2.list_shelter_reports_for_moderation_v2(text, integer, integer) from public, anon;
grant execute on function app_v2.list_shelter_reports_for_moderation_v2(text, integer, integer) to authenticated;

create or replace function app_v2.list_privacy_contact_cases_for_moderation_v2(
  p_status text default null,
  p_limit integer default 50,
  p_page integer default 1
)
returns jsonb
language plpgsql
stable
security definer
set search_path = app_v2, pg_temp
as $$
declare
  v_counts jsonb;
  v_total bigint;
  v_page integer;
  v_pages integer;
  v_rows jsonb;
begin
  if app_v2.current_moderator_account_id_v1(true) is null then
    raise exception 'moderator MFA required' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('open', 'reviewing', 'answered', 'closed') then
    raise exception 'unsupported queue status' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 250 or p_page is null or p_page < 1 then
    raise exception 'invalid queue pagination' using errcode = '22023';
  end if;

  select coalesce(jsonb_object_agg(status, quantity), '{}'::jsonb)
  into v_counts
  from (select status, count(*) as quantity from app_v2.privacy_contact_cases group by status) counts;
  select count(*) into v_total from app_v2.privacy_contact_cases where p_status is null or status = p_status;
  v_pages := greatest(1, ceil(v_total::numeric / p_limit)::integer);
  v_page := least(p_page, v_pages);

  with page_rows (case_id, case_reference, case_category, case_subject, case_status, case_created_at, case_updated_at, last_activity_at, response_due_at, retention_until, messages) as (
  select
    contact_case.id,
    contact_case.reference,
    contact_case.category,
    contact_case.subject,
    contact_case.status,
    contact_case.created_at,
    contact_case.updated_at,
    contact_case.last_activity_at,
    contact_case.response_due_at,
    contact_case.retention_until,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', contact_message.id,
            'authorType', contact_message.author_type,
            'message', contact_message.message,
            'createdAt', contact_message.created_at
          )
          order by contact_message.created_at, contact_message.id
        )
        from app_v2.privacy_contact_messages contact_message
        where contact_message.case_id = contact_case.id
      ),
      '[]'::jsonb
    )
  from app_v2.privacy_contact_cases contact_case
  where p_status is null or contact_case.status = p_status
  order by
    case contact_case.status
      when 'open' then 1
      when 'reviewing' then 2
      when 'answered' then 3
      else 4
    end,
    contact_case.response_due_at,
    contact_case.last_activity_at desc, contact_case.id
  limit p_limit offset ((v_page::bigint - 1) * p_limit)
  )
  select coalesce(jsonb_agg(to_jsonb(page_rows) order by case case_status when 'open' then 1 when 'reviewing' then 2 when 'answered' then 3 else 4 end, response_due_at, last_activity_at desc, case_id), '[]'::jsonb)
  into v_rows from page_rows;

  return jsonb_build_object(
    'rows', v_rows, 'counts', v_counts, 'totalCount', v_total,
    'page', v_page, 'pageSize', p_limit, 'totalPages', v_pages
  );
end;
$$;

revoke all on function app_v2.list_privacy_contact_cases_for_moderation_v2(text, integer, integer) from public, anon;
grant execute on function app_v2.list_privacy_contact_cases_for_moderation_v2(text, integer, integer) to authenticated;
