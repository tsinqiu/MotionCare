USE MotionAnalysis;
SET FOREIGN_KEY_CHECKS = 0;

SET @has_hrv_status := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'SleepSummaries'
    AND COLUMN_NAME = 'hrv_status'
);
SET @add_hrv_status := IF(
  @has_hrv_status = 0,
  'ALTER TABLE SleepSummaries ADD COLUMN hrv_status VARCHAR(40) NULL AFTER avg_hrv',
  'SELECT 1'
);
PREPARE add_hrv_status_stmt FROM @add_hrv_status;
EXECUTE add_hrv_status_stmt;
DEALLOCATE PREPARE add_hrv_status_stmt;

CREATE TABLE IF NOT EXISTS HeartRateSamples (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    sample_time_utc DATETIME(3) NOT NULL,
    heart_rate_bpm INT NULL,
    source VARCHAR(40) NOT NULL DEFAULT 'monitoring',
    raw_json JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT UQ_HeartRateSamples_user_time_source UNIQUE (user_id, sample_time_utc, source),
    CONSTRAINT FK_HeartRateSamples_user FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
    KEY IX_HeartRateSamples_user_time (user_id, sample_time_utc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS StressSamples (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    sample_time_utc DATETIME(3) NOT NULL,
    stress_level INT NULL,
    source VARCHAR(40) NOT NULL DEFAULT 'monitoring',
    raw_json JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT UQ_StressSamples_user_time_source UNIQUE (user_id, sample_time_utc, source),
    CONSTRAINT FK_StressSamples_user FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
    KEY IX_StressSamples_user_time (user_id, sample_time_utc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS StepSamples (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    segment_start_utc DATETIME(3) NOT NULL,
    segment_end_utc DATETIME(3) NULL,
    steps INT NOT NULL DEFAULT 0,
    activity_level VARCHAR(80) NULL,
    raw_json JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT UQ_StepSamples_user_start UNIQUE (user_id, segment_start_utc),
    CONSTRAINT FK_StepSamples_user FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
    KEY IX_StepSamples_user_time (user_id, segment_start_utc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS IntensityMinuteSamples (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    sample_time_utc DATETIME(3) NOT NULL,
    moderate_minutes DOUBLE NULL,
    vigorous_minutes DOUBLE NULL,
    source VARCHAR(40) NOT NULL DEFAULT 'garmin',
    raw_json JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT UQ_IntensityMinuteSamples_user_time UNIQUE (user_id, sample_time_utc),
    CONSTRAINT FK_IntensityMinuteSamples_user FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
    KEY IX_IntensityMinuteSamples_user_time (user_id, sample_time_utc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS SleepStageSamples (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    sleep_date DATE NOT NULL,
    stage_start_utc DATETIME(3) NOT NULL,
    stage_end_utc DATETIME(3) NOT NULL,
    stage_type VARCHAR(40) NOT NULL,
    duration_s INT NULL,
    raw_json JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT UQ_SleepStageSamples_user_start UNIQUE (user_id, stage_start_utc),
    CONSTRAINT FK_SleepStageSamples_user FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
    KEY IX_SleepStageSamples_user_date (user_id, sleep_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS SleepMovementSamples (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    sleep_date DATE NOT NULL,
    segment_start_utc DATETIME(3) NOT NULL,
    segment_end_utc DATETIME(3) NULL,
    movement_level INT NULL,
    source VARCHAR(40) NOT NULL DEFAULT 'sleepMovement',
    raw_json JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT UQ_SleepMovementSamples_user_start_source UNIQUE (user_id, segment_start_utc, source),
    CONSTRAINT FK_SleepMovementSamples_user FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
    KEY IX_SleepMovementSamples_user_date (user_id, sleep_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS HrvSamples (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    sample_time_utc DATETIME(3) NOT NULL,
    sleep_date DATE NULL,
    hrv DOUBLE NULL,
    source VARCHAR(40) NOT NULL DEFAULT 'sleep',
    raw_json JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT UQ_HrvSamples_user_time_source UNIQUE (user_id, sample_time_utc, source),
    CONSTRAINT FK_HrvSamples_user FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
    KEY IX_HrvSamples_user_date (user_id, sleep_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS TrainingStatusSnapshots (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    snapshot_date DATE NOT NULL,
    vo2max DOUBLE NULL,
    training_status VARCHAR(80) NULL,
    load_balance VARCHAR(80) NULL,
    raw_json JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT UQ_TrainingStatusSnapshots_user_date UNIQUE (user_id, snapshot_date),
    CONSTRAINT FK_TrainingStatusSnapshots_user FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS RacePredictions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    prediction_date DATE NOT NULL,
    time_5k_s INT NULL,
    time_10k_s INT NULL,
    time_half_marathon_s INT NULL,
    time_marathon_s INT NULL,
    raw_json JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT UQ_RacePredictions_user_date UNIQUE (user_id, prediction_date),
    CONSTRAINT FK_RacePredictions_user FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS LactateThresholds (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    threshold_date DATE NOT NULL,
    heart_rate_bpm INT NULL,
    speed_mps DOUBLE NULL,
    power_w INT NULL,
    raw_json JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT UQ_LactateThresholds_user_date UNIQUE (user_id, threshold_date),
    CONSTRAINT FK_LactateThresholds_user FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS CyclingFtpSnapshots (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    snapshot_date DATE NOT NULL,
    ftp_w INT NULL,
    sport VARCHAR(40) NULL,
    source VARCHAR(80) NULL,
    raw_json JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT UQ_CyclingFtpSnapshots_user_date UNIQUE (user_id, snapshot_date),
    CONSTRAINT FK_CyclingFtpSnapshots_user FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;
