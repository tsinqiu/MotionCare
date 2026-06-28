# MotionCare Database

This directory contains the MySQL schema, migration SQL, and Garmin import scripts.

## Core Tables

- `Users`
- `Activities`
- `ActivitySummaries`
- `ActivityZones`
- `Laps`
- `TrackPoints`
- `DailyHealthSummaries`
- `SleepSummaries`
- `RestingHeartRates`
- `BodyWeights`
- `DailyStressSummaries`

The old debug/lineage tables were removed: `SourceFiles`, `ActivitySourceFiles`,
`Sessions`, `Events`, `Metrics`, and `FitMessages`. `ActivitySummaries` is now the
single activity summary table; raw Garmin/FIT payloads can still be kept in
`raw_json`.

## Fresh Setup

```powershell
python database\scripts\import_fit_files.py
```

Then run in MySQL:

```sql
source database/sql/01_schema.sql;
source database/sql/02_import_data.sql;
source database/sql/03_queries.sql;
source database/sql/04_auth_manual_upload.sql;
source database/sql/05_performance_indexes.sql;
source database/sql/06_extension_modules.sql;
source database/sql/07_profile_follow_explore_uploads.sql;
```

## Existing Database Migration

Run this once on an existing database:

```sql
source database/sql/09_simplify_garmin_health_tables.sql;
```

It copies missing FIT session summaries into `ActivitySummaries`, creates the new
Garmin health tables, and drops the redundant old tables.

## Garmin Sync Scripts

Install Python dependencies:

```bash
python -m pip install -r database/requirements.txt
```

Activity download:

```bash
python database/scripts/download_garmin_connect.py --start-date 2026-06-01 --end-date 2026-06-08
```

Health-only download:

```bash
python database/scripts/download_garmin_connect.py --health-only --start-date 2026-06-01 --end-date 2026-06-08
```

Convert downloaded health JSON to SQL:

```bash
python database/scripts/import_garmin_health.py --health-dir database/data/garmin_sync/user-1/job-1/health --user-id 1 --out health_import.sql
```

Garmin passwords are not stored in MySQL. Login tokens stay under
`database/.garmin_tokens/`, which should remain local only.
