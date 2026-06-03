create database if not exists bloomberg
  default character set utf8mb4
  default collate utf8mb4_unicode_ci;

use bloomberg;

create table if not exists market_data_sources (
  id bigint primary key,
  name varchar(255) not null,
  provider varchar(255) not null,
  official_url text not null,
  api_endpoint text null,
  update_frequency varchar(64) not null,
  expected_lag_days int not null default 0,
  is_manual tinyint(1) not null default 0,
  limitation_note text null,
  created_at datetime null,
  updated_at datetime null,
  unique key market_data_sources_name_uq (name),
  key market_data_sources_provider_idx (provider)
) character set utf8mb4 collate utf8mb4_unicode_ci;

create table if not exists market_time_series_observations (
  id bigint primary key,
  source_id bigint not null,
  series_code varchar(255) not null,
  observation_date date not null,
  value decimal(30, 10) null,
  unit varchar(64) null,
  metadata json null,
  created_at datetime null,
  unique key market_time_series_source_series_date_uq (source_id, series_code, observation_date),
  key market_time_series_source_series_date_idx (source_id, series_code, observation_date),
  constraint market_time_series_source_fk
    foreign key (source_id) references market_data_sources(id)
    on delete cascade
) character set utf8mb4 collate utf8mb4_unicode_ci;

create table if not exists market_ingestion_runs (
  id bigint primary key,
  source_id bigint not null,
  started_at datetime null,
  finished_at datetime null,
  status varchar(32) not null,
  rows_fetched int not null default 0,
  latest_observation_date date null,
  error_message text null,
  raw_response_hash varchar(128) null,
  created_at datetime null,
  key market_ingestion_runs_source_started_idx (source_id, started_at),
  constraint market_ingestion_runs_source_fk
    foreign key (source_id) references market_data_sources(id)
    on delete cascade
) character set utf8mb4 collate utf8mb4_unicode_ci;

create table if not exists market_freshness_status (
  id bigint primary key,
  source_id bigint not null,
  latest_observation_date date null,
  last_successful_fetch datetime null,
  freshness_status varchar(32) not null default 'unknown',
  days_since_latest int null,
  expected_frequency varchar(64) null,
  checked_at datetime null,
  warning text null,
  unique key market_freshness_status_source_uq (source_id),
  key market_freshness_status_status_idx (freshness_status),
  constraint market_freshness_status_source_fk
    foreign key (source_id) references market_data_sources(id)
    on delete cascade
) character set utf8mb4 collate utf8mb4_unicode_ci;

create table if not exists market_ai_analysis_runs (
  id bigint primary key,
  analysis_type varchar(255) not null,
  model_name varchar(255) not null,
  input_snapshot json null,
  freshness_snapshot json null,
  output_text longtext null,
  warnings json null,
  created_at datetime null,
  key market_ai_analysis_runs_type_created_idx (analysis_type, created_at)
) character set utf8mb4 collate utf8mb4_unicode_ci;
