CREATE DATABASE IF NOT EXISTS MotionAnalysis
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_0900_ai_ci;

USE MotionAnalysis;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS DailyStressSummaries;

DROP TABLE IF EXISTS RestingHeartRates;
DROP TABLE IF EXISTS SleepSummaries;
DROP TABLE IF EXISTS DailyHealthSummaries;
DROP TABLE IF EXISTS ActivityZones;
DROP TABLE IF EXISTS ActivitySummaries;
DROP TABLE IF EXISTS TrackPoints;
DROP TABLE IF EXISTS Laps;
DROP TABLE IF EXISTS Activities;
DROP TABLE IF EXISTS Users;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE Users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(80) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'user') NOT NULL DEFAULT 'user',
    status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
    bio VARCHAR(50) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT UQ_Users_email UNIQUE (email),
    CONSTRAINT UQ_Users_username UNIQUE (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Shoes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    name VARCHAR(120) NOT NULL,
    brand VARCHAR(80) NULL,
    model VARCHAR(120) NULL,
    purchase_date DATE NULL,
    distance_km DOUBLE NOT NULL DEFAULT 0,
    is_retired BOOLEAN NOT NULL DEFAULT FALSE,
    photo_path VARCHAR(1000) NULL,
    photo_original_name VARCHAR(260) NULL,
    photo_mime_type VARCHAR(120) NULL,
    photo_size_bytes BIGINT NULL,
    target_distance_km DOUBLE NULL,
    initial_distance_km DOUBLE NOT NULL DEFAULT 0,
    price DOUBLE NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT FK_Shoes_user FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Activities (
    id INT AUTO_INCREMENT PRIMARY KEY,
    activity_key VARCHAR(120) NOT NULL,
    garmin_activity_id VARCHAR(80) NULL,
    activity_name VARCHAR(200) NULL,
    activity_type VARCHAR(80) NULL,
    sport_code INT NULL,
    sub_sport_code INT NULL,
    start_time_utc DATETIME(3) NULL,
    local_start_time DATETIME(3) NULL,
    location_name VARCHAR(200) NULL,
    start_latitude DOUBLE NULL,
    start_longitude DOUBLE NULL,
    end_latitude DOUBLE NULL,
    end_longitude DOUBLE NULL,
    owner_user_id INT NULL,
    data_source VARCHAR(40) NOT NULL DEFAULT 'garmin_import',
    is_manual BOOLEAN NOT NULL DEFAULT FALSE,
    match_status VARCHAR(40) NOT NULL DEFAULT 'imported',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT UQ_Activities_activity_key UNIQUE (activity_key),
    CONSTRAINT UQ_Activities_garmin_activity_id UNIQUE (garmin_activity_id),
    shoe_id INT NULL,
    perceived_effort TINYINT NULL,
    photo_path VARCHAR(1000) NULL,
    photo_original_name VARCHAR(260) NULL,
    photo_mime_type VARCHAR(120) NULL,
    photo_size_bytes BIGINT NULL,
    weather_condition VARCHAR(80) NULL,
    temperature_c DOUBLE NULL,
    humidity_percent TINYINT NULL,
    feels_like_c DOUBLE NULL,
    weather_source VARCHAR(40) NULL,
    weather_updated_at TIMESTAMP NULL,
    CONSTRAINT FK_Activities_owner_user
        FOREIGN KEY (owner_user_id) REFERENCES Users(id) ON DELETE SET NULL,
    CONSTRAINT FK_Activities_shoe
        FOREIGN KEY (shoe_id) REFERENCES Shoes(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE ActivitySummaries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    activity_id INT NOT NULL,
    duration_s DOUBLE NULL,
    moving_duration_s DOUBLE NULL,
    elapsed_duration_s DOUBLE NULL,
    distance_m DOUBLE NULL,
    calories DOUBLE NULL,
    avg_speed_mps DOUBLE NULL,
    max_speed_mps DOUBLE NULL,
    avg_heart_rate_bpm INT NULL,
    max_heart_rate_bpm INT NULL,
    avg_cadence_spm DOUBLE NULL,
    max_cadence_spm DOUBLE NULL,
    avg_power_w INT NULL,
    max_power_w INT NULL,
    normalized_power_w INT NULL,
    aerobic_training_effect DOUBLE NULL,
    anaerobic_training_effect DOUBLE NULL,
    aerobic_training_effect_message VARCHAR(160) NULL,
    anaerobic_training_effect_message VARCHAR(160) NULL,
    training_effect_label VARCHAR(120) NULL,
    activity_training_load DOUBLE NULL,
    vo2max DOUBLE NULL,
    body_battery_delta INT NULL,
    avg_stride_length_cm DOUBLE NULL,
    elevation_gain_m DOUBLE NULL,
    elevation_loss_m DOUBLE NULL,
    min_elevation_m DOUBLE NULL,
    max_elevation_m DOUBLE NULL,
    manufacturer VARCHAR(100) NULL,
    raw_json JSON NULL,
    CONSTRAINT UQ_ActivitySummaries_activity UNIQUE (activity_id),
    CONSTRAINT FK_ActivitySummaries_Activities
        FOREIGN KEY (activity_id) REFERENCES Activities(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE ActivityZones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    activity_id INT NOT NULL,
    zone_type VARCHAR(40) NOT NULL,
    zone_index INT NOT NULL,
    duration_s DOUBLE NOT NULL,
    source_field VARCHAR(80) NULL,
    CONSTRAINT UQ_ActivityZones_activity_type_index UNIQUE (activity_id, zone_type, zone_index),
    CONSTRAINT FK_ActivityZones_Activities
        FOREIGN KEY (activity_id) REFERENCES Activities(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Laps (
    id INT AUTO_INCREMENT PRIMARY KEY,
    activity_id INT NOT NULL,
    lap_index INT NOT NULL,
    start_time_utc DATETIME(3) NULL,
    total_elapsed_time_s DOUBLE NULL,
    total_timer_time_s DOUBLE NULL,
    total_distance_m DOUBLE NULL,
    avg_speed_mps DOUBLE NULL,
    max_speed_mps DOUBLE NULL,
    avg_heart_rate_bpm INT NULL,
    max_heart_rate_bpm INT NULL,
    avg_cadence DOUBLE NULL,
    max_cadence DOUBLE NULL,
    avg_power_w INT NULL,
    max_power_w INT NULL,
    raw_json JSON NULL,
    CONSTRAINT FK_Laps_Activities
        FOREIGN KEY (activity_id) REFERENCES Activities(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE TrackPoints (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    activity_id INT NOT NULL,
    sample_index INT NOT NULL,
    sample_time_utc DATETIME(3) NULL,
    latitude DOUBLE NULL,
    longitude DOUBLE NULL,
    altitude_m DOUBLE NULL,
    distance_m DOUBLE NULL,
    speed_mps DOUBLE NULL,
    heart_rate_bpm INT NULL,
    cadence DOUBLE NULL,
    power_w INT NULL,
    accumulated_power_w INT NULL,
    vertical_oscillation_mm DOUBLE NULL,
    stance_time_ms DOUBLE NULL,
    CONSTRAINT FK_TrackPoints_Activities
        FOREIGN KEY (activity_id) REFERENCES Activities(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE DailyHealthSummaries (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    summary_date DATE NOT NULL,
    steps INT NULL,
    distance_m DOUBLE NULL,
    calories DOUBLE NULL,
    active_calories DOUBLE NULL,
    floors_climbed DOUBLE NULL,
    moderate_intensity_minutes INT NULL,
    vigorous_intensity_minutes INT NULL,
    avg_stress_level DOUBLE NULL,
    max_stress_level DOUBLE NULL,
    body_battery_charged INT NULL,
    body_battery_drained INT NULL,
    min_body_battery INT NULL,
    max_body_battery INT NULL,
    resting_heart_rate_bpm INT NULL,
    avg_waking_respiration_value DOUBLE NULL,
    lowest_respiration_value DOUBLE NULL,
    highest_respiration_value DOUBLE NULL,
    stress_duration_s INT NULL,
    rest_stress_duration_s INT NULL,
    activity_stress_duration_s INT NULL,
    low_stress_duration_s INT NULL,
    medium_stress_duration_s INT NULL,
    high_stress_duration_s INT NULL,
    sleeping_seconds INT NULL,
    raw_json JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT UQ_DailyHealthSummaries_user_date UNIQUE (user_id, summary_date),
    CONSTRAINT FK_DailyHealthSummaries_user
        FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE SleepSummaries (
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
    avg_hrv DOUBLE NULL,
    avg_heart_rate_during_sleep INT NULL,
    avg_sleep_stress DOUBLE NULL,
    avg_respiration_value DOUBLE NULL,
    lowest_respiration_value DOUBLE NULL,
    highest_respiration_value DOUBLE NULL,
    raw_json JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT UQ_SleepSummaries_user_date UNIQUE (user_id, sleep_date),
    CONSTRAINT FK_SleepSummaries_user
        FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX IX_Activities_type_start ON Activities(activity_type, start_time_utc);
CREATE INDEX IX_Activities_local_start ON Activities(local_start_time);
CREATE INDEX IX_Activities_owner_source ON Activities(owner_user_id, data_source);
CREATE INDEX IX_ActivitySummaries_load ON ActivitySummaries(activity_training_load);
CREATE INDEX IX_ActivityZones_activity_type ON ActivityZones(activity_id, zone_type);
CREATE UNIQUE INDEX IX_Laps_activity_index ON Laps(activity_id, lap_index);
CREATE UNIQUE INDEX IX_TrackPoints_activity_index ON TrackPoints(activity_id, sample_index);
CREATE INDEX IX_TrackPoints_activity_time ON TrackPoints(activity_id, sample_time_utc);
CREATE INDEX IX_TrackPoints_activity_distance ON TrackPoints(activity_id, distance_m);
CREATE INDEX IX_DailyHealthSummaries_user_date ON DailyHealthSummaries(user_id, summary_date);
CREATE INDEX IX_SleepSummaries_user_date ON SleepSummaries(user_id, sleep_date);

