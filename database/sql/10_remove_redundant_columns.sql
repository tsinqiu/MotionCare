USE MotionAnalysis;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS RestingHeartRates;
DROP TABLE IF EXISTS DailyStressSummaries;
DROP TABLE IF EXISTS BodyWeights;

CREATE TABLE IF NOT EXISTS Shoes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    name VARCHAR(120) NOT NULL,
    brand VARCHAR(80) NULL,
    model VARCHAR(120) NULL,
    purchase_date DATE NULL,
    distance_km DOUBLE NOT NULL DEFAULT 0,
    is_retired BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT FK_Shoes_user FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE Activities ADD COLUMN shoe_id INT NULL AFTER owner_user_id;
ALTER TABLE Activities DROP COLUMN raw_json;

ALTER TABLE ActivitySummaries
  DROP COLUMN garmin_activity_id,
  DROP COLUMN intensity_factor,
  DROP COLUMN training_stress_score,
  DROP COLUMN max_20min_power_w,
  DROP COLUMN water_estimated_ml,
  DROP COLUMN moderate_intensity_minutes,
  DROP COLUMN vigorous_intensity_minutes,
  DROP COLUMN avg_vertical_oscillation_cm,
  DROP COLUMN avg_ground_contact_time_ms,
  DROP COLUMN avg_vertical_ratio,
  DROP COLUMN avg_respiration_rate,
  DROP COLUMN max_respiration_rate,
  DROP COLUMN min_respiration_rate,
  DROP COLUMN original_file_url;

ALTER TABLE DailyHealthSummaries
  DROP COLUMN intensity_minutes,
  ADD COLUMN resting_heart_rate_bpm INT NULL AFTER max_body_battery,
  ADD COLUMN avg_waking_respiration_value DOUBLE NULL AFTER resting_heart_rate_bpm,
  ADD COLUMN lowest_respiration_value DOUBLE NULL AFTER avg_waking_respiration_value,
  ADD COLUMN highest_respiration_value DOUBLE NULL AFTER lowest_respiration_value,
  ADD COLUMN stress_duration_s INT NULL AFTER highest_respiration_value,
  ADD COLUMN rest_stress_duration_s INT NULL AFTER stress_duration_s,
  ADD COLUMN activity_stress_duration_s INT NULL AFTER rest_stress_duration_s,
  ADD COLUMN low_stress_duration_s INT NULL AFTER activity_stress_duration_s,
  ADD COLUMN medium_stress_duration_s INT NULL AFTER low_stress_duration_s,
  ADD COLUMN high_stress_duration_s INT NULL AFTER medium_stress_duration_s,
  ADD COLUMN sleeping_seconds INT NULL AFTER high_stress_duration_s;

ALTER TABLE SleepSummaries
  ADD COLUMN avg_hrv DOUBLE NULL AFTER sleep_score,
  ADD COLUMN avg_heart_rate_during_sleep INT NULL AFTER avg_hrv,
  ADD COLUMN avg_sleep_stress DOUBLE NULL AFTER avg_heart_rate_during_sleep,
  ADD COLUMN avg_respiration_value DOUBLE NULL AFTER avg_sleep_stress,
  ADD COLUMN lowest_respiration_value DOUBLE NULL AFTER avg_respiration_value,
  ADD COLUMN highest_respiration_value DOUBLE NULL AFTER lowest_respiration_value;

SET FOREIGN_KEY_CHECKS = 1;
