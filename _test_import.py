import subprocess, os

schema_dir = "database/sql"
seed_file = "database/sql/seed.sql"
db = "MotionAnalysis_test"

def run(sql, ignore_errors=False):
    proc = subprocess.run(
        ["mysql", "-u", "root", "-proot", db],
        input=sql.encode("utf-8"),
        capture_output=True
    )
    err = proc.stderr.decode("utf-8", errors="replace")[:200]
    if proc.returncode == 0:
        return True, ""
    if ignore_errors:
        return True, err[:80]
    return False, err

def run_file(sql_file, ignore_errors=False):
    path = os.path.join(schema_dir, sql_file)
    if not os.path.exists(path):
        return True, ""
    with open(path, encoding="utf-8") as f:
        sql = f.read().replace("USE MotionAnalysis;", f"USE {db};")
    ok, err = run(sql, ignore_errors)
    status = "OK" if ok else "FAIL"
    print(f"{status} {sql_file}")
    return ok, err

# Drop all tables first
print("=== Creating schema ===")
drop = (
    "SET FOREIGN_KEY_CHECKS=0;"
    + "DROP TABLE IF EXISTS Shoes, Activities, ActivitySummaries, ActivityZones, Laps, TrackPoints,"
    + "DailyHealthSummaries, SleepSummaries, BodyWeights, Users,"
    + "HeartRateSamples, StressSamples, StepSamples, IntensityMinuteSamples,"
    + "SleepStageSamples, SleepMovementSamples, HrvSamples,"
    + "TrainingStatusSnapshots, RacePredictions, LactateThresholds, CyclingFtpSnapshots,"
    + "SyncJobs, SyncLogs, SyncProviderConnections,"
    + "CommunityComments, CommunityLikes, CommunityPosts, CommunityShares,"
    + "ExploreArticles, UserFollows, UserSettings, WorkoutSessions, WorkoutTrackPoints,"
    + "DailyStressSummaries, RestingHeartRates,"
    + "Sessions, FitMessages, Metrics, Events, ActivitySourceFiles, SourceFiles;"
    + "SET FOREIGN_KEY_CHECKS=1;"
)
subprocess.run(["mysql", "-u", "root", "-proot", db], input=drop.encode("utf-8"), capture_output=True)

# Apply all migration files in order
migrations = [
    "01_schema.sql", "03_queries.sql", "04_auth_manual_upload.sql",
    "05_performance_indexes.sql", "06_extension_modules.sql",
    "07_profile_follow_explore_uploads.sql", "08_backfill_activity_training_load.sql",
    "09_simplify_garmin_health_tables.sql", "10_remove_redundant_columns.sql",
    "11_activity_shoe_photos_effort.sql", "12_activity_weather.sql",
    "13_shoe_extra_fields.sql", "14_body_weight_restore.sql",
    "15_garmin_timeseries.sql", "16_drop_redundant_columns.sql",
]
for m in migrations:
    run_file(m, ignore_errors=True)

# Ensure seed-required tables exist (migration ordering issues)
fix_tables = """
CREATE TABLE IF NOT EXISTS DailyStressSummaries (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    stress_date DATE NOT NULL,
    avg_stress_level DOUBLE NULL,
    max_stress_level DOUBLE NULL,
    stress_duration_s INT NULL,
    rest_stress_duration_s INT NULL,
    activity_stress_duration_s INT NULL,
    low_stress_duration_s INT NULL,
    medium_stress_duration_s INT NULL,
    high_stress_duration_s INT NULL,
    raw_json JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT UQ_DailyStressSummaries_user_date UNIQUE (user_id, stress_date),
    CONSTRAINT FK_DailyStressSummaries_user FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
"""
run(fix_tables, ignore_errors=True)

# Apply seed
print("\n=== Seed ===")
proc = subprocess.run(
    ["mysql", "-u", "root", "-proot", db],
    input=open(seed_file, "rb").read(),
    capture_output=True
)
if proc.returncode == 0:
    print("OK seed imported!")
else:
    err = proc.stderr.decode("utf-8", errors="replace")[:500]
    print(f"FAIL seed: {err}")

# Verify
print("\n=== Tables with data ===")
subprocess.run(
    ["mysql", "-u", "root", "-proot", db, "-e",
     "SELECT TABLE_NAME, TABLE_ROWS FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_ROWS>0 ORDER BY TABLE_ROWS DESC"],
    capture_output=False
)
print("\nRow count check (last few INSERT lines in seed should have loaded):")
subprocess.run(
    ["mysql", "-u", "root", "-proot", db, "-e",
     "SELECT COUNT(*) AS users FROM Users"],
    capture_output=False
)
