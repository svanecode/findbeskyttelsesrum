create policy app_v2_public_data_revisions_service_only
on app_v2.public_data_revisions
for all
to service_role
using (true)
with check (true);

create index app_v2_public_data_revisions_publication_id_idx
on app_v2.public_data_revisions (publication_id)
where publication_id is not null;

comment on index app_v2.app_v2_public_data_revisions_publication_id_idx is
'Covers the publication foreign key used by revision-ledger integrity checks.';
