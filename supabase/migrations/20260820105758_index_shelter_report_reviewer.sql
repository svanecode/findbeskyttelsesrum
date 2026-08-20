-- Cover the moderator ownership foreign key used by queue filters and cleanup.
create index if not exists app_v2_shelter_reports_reviewed_by_idx
  on app_v2.shelter_reports (reviewed_by)
  where reviewed_by is not null;
