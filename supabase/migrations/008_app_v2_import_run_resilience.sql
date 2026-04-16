alter table app_v2.import_runs
add column if not exists pages_fetched integer not null default 0,
add column if not exists last_successful_page integer,
add column if not exists last_successful_cursor text,
add column if not exists resumed_from_import_run_id uuid references app_v2.import_runs(id) on delete set null,
add column if not exists missing_transitions_applied boolean not null default false,
add column if not exists missing_transitions_skipped_reason text;

create index if not exists app_v2_import_runs_source_status_started_at_idx
on app_v2.import_runs (source_name, status, started_at desc);

create index if not exists app_v2_import_runs_resumed_from_idx
on app_v2.import_runs (resumed_from_import_run_id)
where resumed_from_import_run_id is not null;
