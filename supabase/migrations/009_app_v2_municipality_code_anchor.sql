alter table app_v2.municipalities
add column if not exists code text;

update app_v2.municipalities
set code = substring(slug from 'kommune-(\d{4})')
where code is null
  and slug ~ '^kommune-\d{4}$';

update app_v2.municipalities
set code = substring(name from 'Municipality (\d{4})')
where code is null
  and name ~ '^Municipality \d{4}$';

create index if not exists app_v2_municipalities_code_idx
on app_v2.municipalities (code)
where code is not null;
