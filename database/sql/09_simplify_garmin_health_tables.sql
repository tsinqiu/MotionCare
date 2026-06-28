USE MotionAnalysis;

CREATE TABLE IF NOT EXISTS DailyHealthSummaries (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    summary_date DATE NOT NULL,
    steps INT NULL,
    distance_m DOUBLE NULL,
    calories DOUBLE NULL,
    active_calories DOUBLE NULL,
    floors_climbed DOUBLE NULL,
    intensity_minutes INT NULL,
    moderate_intensity_minutes INT NULL,
    vigorous_intensity_minutes INT NULL,
    avg_stress_level DOUBLE NULL,
    max_stress_level DOUBLE NULL,
    body_battery_charged INT NULL,
    body_battery_drained INT NULL,
    min_body_battery INT NULL,
    max_body_battery INT NULL,
    raw_json JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT UQ_DailyHealthSummaries_user_date UNIQUE (user_id, summary_date),
    CONSTRAINT FK_DailyHealthSummaries_user FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS SleepSummaries (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    sleep_date DATE NOT NULL,
    sleep_start DATETIME(3) NULL,
    sleep_end DATETIME(3) NULL,
    duration_s INT NULL,
    deep_sleep_s INT NULL,
    light_sleep_s INT NULL,
    rem_sleep_s INT NULL,
    awake_s INT NULL,
    sleep_score INT NULL,
    raw_json JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT UQ_SleepSummaries_user_date UNIQUE (user_id, sleep_date),
    CONSTRAINT FK_SleepSummaries_user FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS RestingHeartRates (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    rhr_date DATE NOT NULL,
    resting_heart_rate_bpm INT NULL,
    raw_json JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT UQ_RestingHeartRates_user_date UNIQUE (user_id, rhr_date),
    CONSTRAINT FK_RestingHeartRates_user FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS BodyWeights (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    measurement_date DATE NOT NULL,
    weight_kg DOUBLE NULL,
    bmi DOUBLE NULL,
    body_fat_percent DOUBLE NULL,
    muscle_mass_kg DOUBLE NULL,
    raw_json JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT UQ_BodyWeights_user_date UNIQUE (user_id, measurement_date),
    CONSTRAINT FK_BodyWeights_user FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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

SET @has_sessions = (
    SELECT COUNT(*)
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Sessions'
);
SET @migrate_sessions_sql = IF(
    @has_sessions > 0,
    'INSERT INTO ActivitySummaries (
        activity_id, duration_s, moving_duration_s, elapsed_duration_s, distance_m, calories,
        avg_speed_mps, max_speed_mps, avg_heart_rate_bpm, max_heart_rate_bpm,
        avg_cadence_spm, max_cadence_spm, avg_power_w, max_power_w, normalized_power_w,
        elevation_gain_m, elevation_loss_m, raw_json
    )
    SELECT
        s.activity_id, s.total_timer_time_s, s.total_moving_time_s, s.total_elapsed_time_s,
        s.total_distance_m, s.total_calories, s.avg_speed_mps, s.max_speed_mps,
        s.avg_heart_rate_bpm, s.max_heart_rate_bpm, s.avg_cadence, s.max_cadence,
        s.avg_power_w, s.max_power_w, s.normalized_power_w, s.total_ascent_m,
        s.total_descent_m, s.raw_json
    FROM Sessions s
    LEFT JOIN ActivitySummaries js ON js.activity_id = s.activity_id
    WHERE js.activity_id IS NULL',
    'SELECT 1'
);
PREPARE migrate_sessions_stmt FROM @migrate_sessions_sql;
EXECUTE migrate_sessions_stmt;
DEALLOCATE PREPARE migrate_sessions_stmt;

DROP TABLE IF EXISTS FitMessages;
DROP TABLE IF EXISTS Metrics;
DROP TABLE IF EXISTS Events;
DROP TABLE IF EXISTS ActivitySourceFiles;
DROP TABLE IF EXISTS SourceFiles;
DROP TABLE IF EXISTS Sessions;
