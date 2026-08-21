create index if not exists app_v2_dataset_publications_previous_idx
on app_v2.dataset_publications (previous_publication_id)
where previous_publication_id is not null;

create index if not exists app_v2_dataset_publications_rollback_of_idx
on app_v2.dataset_publications (rollback_of_publication_id)
where rollback_of_publication_id is not null;

create index if not exists app_v2_import_runs_publication_id_idx
on app_v2.import_runs (publication_id)
where publication_id is not null;
