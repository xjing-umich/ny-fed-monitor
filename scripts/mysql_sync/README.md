# Supabase to MySQL Market Data Sync

Standalone Python sync tool for copying Supabase-backed market monitor tables into a MySQL database named `bloomberg`.

This tool is not part of the Next.js app and should run on a machine that can reach the private MySQL host `192.168.119.53`. Do not assume Vercel can access that internal address.

## 1. Install dependencies

```bash
cd scripts/mysql_sync
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 2. Configure `.env`

```bash
cp .env.example .env
```

Fill in:

```bash
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key

DB_HOST=192.168.119.53
DB_PORT=3306
DB_USER=your_mysql_user
DB_PASSWORD=your_mysql_password
DB_CHARSET=utf8mb4
DB_NAME_bloomberg=bloomberg
MONITOR_INTERVAL=60
```

Aliases also supported:

```bash
MYSQL_DB_HOST
MYSQL_DB_PORT
MYSQL_DB_USER
MYSQL_DB_PASSWORD
MYSQL_DB_NAME
MYSQL_DB_CHARSET
```

The script never prints Supabase service keys or MySQL passwords.

## 3. Create MySQL schema

```bash
python sync_supabase_to_mysql.py --create-schema --dry-run
```

Or apply manually:

```bash
mysql -h 192.168.119.53 -P 3306 -u <user> -p < create_mysql_schema.sql
```

## 4. Dry run

Fetch Supabase rows and log counts without writing to MySQL:

```bash
python sync_supabase_to_mysql.py --dry-run
```

Single table dry run:

```bash
python sync_supabase_to_mysql.py --dry-run --table market_time_series_observations
```

## 5. Full sync

```bash
python sync_supabase_to_mysql.py
```

Single table:

```bash
python sync_supabase_to_mysql.py --table market_freshness_status
```

## 6. Loop mode

Run continuously every `MONITOR_INTERVAL` seconds:

```bash
python sync_supabase_to_mysql.py --loop
```

Create schema first, then loop:

```bash
python sync_supabase_to_mysql.py --create-schema --loop
```

## 7. Why this runs outside Vercel

The MySQL host is `192.168.119.53`, a private/internal IP. Vercel generally cannot reach private LAN addresses unless you provide a dedicated networking bridge. Run this script on a local machine, VM, bastion host, or internal server that has network access to that MySQL host.

## 8. Verify data in MySQL

```sql
use bloomberg;

select count(*) from market_data_sources;
select count(*) from market_time_series_observations;
select count(*) from market_ingestion_runs;
select count(*) from market_freshness_status;
select count(*) from market_ai_analysis_runs;

select source_id, series_code, max(observation_date)
from market_time_series_observations
group by source_id, series_code
order by source_id, series_code;
```

## Synced tables

- `market_data_sources`
- `market_time_series_observations`
- `market_ingestion_runs`
- `market_freshness_status`
- `market_ai_analysis_runs`

Rows are upserted with MySQL `ON DUPLICATE KEY UPDATE`. JSON/JSONB fields are serialized with `json.dumps(..., ensure_ascii=False)`.
