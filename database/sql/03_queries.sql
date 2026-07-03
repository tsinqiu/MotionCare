USE MotionAnalysis;

-- Activity list with the single unified summary table.
SELECT
    a.id,
    a.garmin_activity_id,
    a.activity_name,
    a.activity_type,
    a.local_start_time,
    ROUND(js.distance_m / 1000, 2) AS distance_km,
    js.duration_s,
    js.moving_duration_s,
    js.activity_training_load,
    js.aerobic_training_effect,
    js.anaerobic_training_effect,
    js.training_effect_label,
    js.vo2max,
    js.body_battery_delta
FROM Activities a
LEFT JOIN ActivitySummaries js ON js.activity_id = a.id
ORDER BY a.local_start_time DESC;

-- Activity totals by type.
SELECT
    a.activity_type,
    COUNT(*) AS activity_count,
    ROUND(SUM(js.distance_m) / 1000, 2) AS total_distance_km,
    ROUND(SUM(js.duration_s) / 60, 1) AS total_duration_min,
    ROUND(SUM(js.moving_duration_s) / 60, 1) AS total_moving_min,
    ROUND(AVG(js.avg_heart_rate_bpm), 1) AS avg_heart_rate_bpm,
    ROUND(SUM(js.activity_training_load), 1) AS total_training_load
FROM Activities a
LEFT JOIN ActivitySummaries js ON js.activity_id = a.id
GROUP BY a.activity_type
ORDER BY activity_count DESC;

-- Latest activity detail.
SET @activity_id = (SELECT id FROM Activities ORDER BY local_start_time DESC LIMIT 1);

SELECT
    a.id,
    a.garmin_activity_id,
    a.activity_name,
    a.activity_type,
    a.local_start_time,
    a.location_name,
    js.elapsed_duration_s,
    js.duration_s,
    js.moving_duration_s,
    js.distance_m,
    js.calories,
    js.avg_heart_rate_bpm,
    js.max_heart_rate_bpm,
    js.avg_cadence_spm,
    js.avg_power_w,
    js.max_power_w,
    js.normalized_power_w,
    js.activity_training_load,
    js.aerobic_training_effect,
    js.anaerobic_training_effect,
    js.training_effect_label,
    js.vo2max,
    js.body_battery_delta,
    js.water_estimated_ml
FROM Activities a
LEFT JOIN ActivitySummaries js ON js.activity_id = a.id
WHERE a.id = @activity_id;

-- Latest daily health rows.
SELECT * FROM DailyHealthSummaries ORDER BY summary_date DESC LIMIT 14;
SELECT * FROM SleepSummaries ORDER BY sleep_date DESC LIMIT 14;
SELECT * FROM RestingHeartRates ORDER BY rhr_date DESC LIMIT 14;
SELECT * FROM BodyWeights ORDER BY measurement_date DESC LIMIT 14;
SELECT * FROM DailyStressSummaries ORDER BY stress_date DESC LIMIT 14;

-- Activity zones.
SELECT
    zone_type,
    zone_index,
    duration_s,
    ROUND(duration_s / 60, 2) AS duration_min,
    source_field
FROM ActivityZones
WHERE activity_id = @activity_id
ORDER BY zone_type, zone_index;

-- Laps.
SELECT
    lap_index,
    start_time_utc,
    total_distance_m,
    total_timer_time_s,
    avg_speed_mps,
    avg_heart_rate_bpm,
    avg_power_w
FROM Laps
WHERE activity_id = @activity_id
ORDER BY lap_index;

-- Track points.
SELECT
    sample_index,
    sample_time_utc,
    latitude,
    longitude,
    altitude_m,
    distance_m,
    speed_mps,
    heart_rate_bpm,
    cadence,
    power_w
FROM TrackPoints
WHERE activity_id = @activity_id
ORDER BY sample_index;

-- Table row counts.
SELECT
    table_name,
    table_rows
FROM information_schema.tables
WHERE table_schema = DATABASE()
ORDER BY table_rows DESC;

-- Indexes.
SELECT
    table_name,
    index_name,
    non_unique,
    GROUP_CONCAT(column_name ORDER BY seq_in_index) AS columns_in_index
FROM information_schema.statistics
WHERE table_schema = DATABASE()
GROUP BY table_name, index_name, non_unique
ORDER BY table_name, index_name;
