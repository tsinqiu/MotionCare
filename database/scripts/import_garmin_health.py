from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path
from typing import Any


def sql_string(value):
    if value is None:
        return "NULL"
    return "'" + str(value).replace("\\", "\\\\").replace("'", "''") + "'"


def sql_number(value):
    if value is None:
        return "NULL"
    try:
        return str(float(value))
    except (TypeError, ValueError):
        return "NULL"


def sql_int(value):
    if value is None:
        return "NULL"
    try:
        return str(int(float(value)))
    except (TypeError, ValueError):
        return "NULL"


def sql_json(value):
    return sql_string(json.dumps(value, ensure_ascii=False, separators=(",", ":")))


def sql_datetime(value):
    if value is None:
        return "NULL"
    if isinstance(value, (int, float)):
        return sql_string(datetime.fromtimestamp(value / 1000 if value > 10_000_000_000 else value).strftime("%Y-%m-%d %H:%M:%S"))
    text = str(value).replace("T", " ").replace("Z", "")
    return sql_string(text[:23])


def to_epoch_seconds(value):
    if value is None:
        return 0
    if isinstance(value, (int, float)):
        return value / 1000 if value > 10_000_000_000 else value
    text = str(value).replace("T", " ").replace("Z", "")
    try:
        return datetime.strptime(text[:19], "%Y-%m-%d %H:%M:%S").timestamp()
    except (ValueError, TypeError):
        return 0


def nested(data: Any, *path: str):
    current = data
    for key in path:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def first_key(data: Any, *keys: str):
    if isinstance(data, dict):
        for key in keys:
            value = data.get(key)
            if value is not None:
                return value
        for value in data.values():
            found = first_key(value, *keys)
            if found is not None:
                return found
    if isinstance(data, list):
        for item in data:
            found = first_key(item, *keys)
            if found is not None:
                return found
    return None


def first_present(data: Any, *keys: str):
    if not isinstance(data, dict):
        return None
    for key in keys:
        if key in data and data[key] is not None:
            return data[key]
    return None


def scalar(value: Any, *keys: str):
    if isinstance(value, dict):
        found = first_key(value, *keys) if keys else first_key(value, "value", "amount", "seconds")
        return found
    return value


def first_record(data: Any):
    if isinstance(data, list):
        return data[0] if data else {}
    if not isinstance(data, dict):
        return {}
    for key in ("dateWeightList", "weightList", "measurements", "items"):
        value = data.get(key)
        if isinstance(value, list) and value:
            return value[0]
    return data


def upsert(table: str, columns: list[str], values: list[str], update_columns: list[str]):
    return (
        f"INSERT INTO {table} ({', '.join(columns)}) VALUES ({', '.join(values)}) "
        + "ON DUPLICATE KEY UPDATE "
        + ", ".join(f"{column} = VALUES({column})" for column in update_columns)
        + ";"
    )


def build_daily_sql(user_id: int, day: str, payload: dict[str, Any]):
    daily = payload.get("daily") or {}
    columns = [
        "user_id", "summary_date", "steps", "distance_m", "calories", "active_calories",
        "floors_climbed", "moderate_intensity_minutes",
        "vigorous_intensity_minutes", "avg_stress_level", "max_stress_level",
        "body_battery_charged", "body_battery_drained", "min_body_battery",
        "max_body_battery", "resting_heart_rate_bpm",
        "avg_waking_respiration_value", "lowest_respiration_value", "highest_respiration_value",
        "stress_duration_s", "rest_stress_duration_s", "activity_stress_duration_s",
        "low_stress_duration_s", "medium_stress_duration_s", "high_stress_duration_s",
        "sleeping_seconds", "raw_json",
    ]
    values = [
        sql_int(user_id),
        sql_string(day),
        sql_int(first_key(daily, "totalSteps", "steps")),
        sql_number(first_key(daily, "totalDistanceMeters", "totalDistance", "distance")),
        sql_number(first_key(daily, "totalKilocalories", "calories")),
        sql_number(first_key(daily, "activeKilocalories", "activeCalories")),
        sql_number(first_key(daily, "floorsAscended", "floorsClimbed")),
        sql_int(first_key(daily, "moderateIntensityMinutes")),
        sql_int(first_key(daily, "vigorousIntensityMinutes")),
        sql_number(first_key(daily, "averageStressLevel", "avgStressLevel")),
        sql_number(first_key(daily, "maxStressLevel")),
        sql_int(first_key(daily, "bodyBatteryChargedValue", "bodyBatteryCharged")),
        sql_int(first_key(daily, "bodyBatteryDrainedValue", "bodyBatteryDrained")),
        sql_int(first_key(daily, "bodyBatteryLowestValue", "minBodyBattery")),
        sql_int(first_key(daily, "bodyBatteryHighestValue", "maxBodyBattery")),
        sql_int(first_key(daily, "restingHeartRate")),
        sql_number(first_key(daily, "avgWakingRespirationValue")),
        sql_number(first_key(daily, "lowestRespirationValue")),
        sql_number(first_key(daily, "highestRespirationValue")),
        sql_int(first_key(daily, "stressDuration")),
        sql_int(first_key(daily, "restStressDuration")),
        sql_int(first_key(daily, "activityStressDuration")),
        sql_int(first_key(daily, "lowStressDuration")),
        sql_int(first_key(daily, "mediumStressDuration")),
        sql_int(first_key(daily, "highStressDuration")),
        sql_int(first_key(daily, "sleepingSeconds")),
        sql_json(daily),
    ]
    return upsert("DailyHealthSummaries", columns, values, columns[2:])


def build_sleep_sql(user_id: int, day: str, payload: dict[str, Any]):
    sleep = payload.get("sleep") or {}
    dto = nested(sleep, "dailySleepDTO") or sleep
    score = first_key(sleep, "overall", "sleepScore", "sleepScores")
    if isinstance(score, dict):
        score = first_key(score, "value", "score")
    avg_hrv = nested(sleep, "avgOvernightHrv")
    if avg_hrv is None:
        avg_hrv = nested(sleep, "dailySleepDTO", "avgOvernightHrv")
    columns = [
        "user_id", "sleep_date", "sleep_start", "sleep_end", "duration_s",
        "deep_sleep_s", "light_sleep_s", "rem_sleep_s", "awake_s", "sleep_score",
        "avg_hrv", "hrv_status", "avg_heart_rate_during_sleep", "avg_sleep_stress",
        "avg_respiration_value", "lowest_respiration_value", "highest_respiration_value",
        "raw_json",
    ]
    hrv_status = str(sleep.get("hrvStatus")) if sleep.get("hrvStatus") is not None else None
    values = [
        sql_int(user_id),
        sql_string(day),
        sql_datetime(first_key(dto, "sleepStartTimestampGMT", "sleepStartTimestampLocal", "sleepStartTime")),
        sql_datetime(first_key(dto, "sleepEndTimestampGMT", "sleepEndTimestampLocal", "sleepEndTime")),
        sql_int(first_key(dto, "sleepTimeSeconds", "durationInSeconds", "duration")),
        sql_int(first_key(dto, "deepSleepSeconds")),
        sql_int(first_key(dto, "lightSleepSeconds")),
        sql_int(first_key(dto, "remSleepSeconds")),
        sql_int(first_key(dto, "awakeSleepSeconds", "awakeSeconds")),
        sql_int(score),
        sql_number(avg_hrv),
        sql_string(hrv_status),
        sql_int(first_key(dto, "avgHeartRate")),
        sql_number(first_key(dto, "avgSleepStress")),
        sql_number(first_key(dto, "averageRespirationValue")),
        sql_number(first_key(dto, "lowestRespirationValue")),
        sql_number(first_key(dto, "highestRespirationValue")),
        sql_json(sleep),
    ]
    return upsert("SleepSummaries", columns, values, columns[2:])


def parse_pair_array(data: Any) -> list[list]:
    rows = []
    values = data.get("heartRateValues") if isinstance(data, dict) else data
    if isinstance(values, list):
        for item in values:
            if isinstance(item, list) and len(item) >= 2 and item[1] is not None:
                rows.append([item[0], item[1]])
    return rows


def parse_obj_array(data: Any, ts_key: str = "startGMT", val_key: str = "value") -> list[list]:
    items = data if isinstance(data, list) else []
    rows = []
    for item in items:
        if isinstance(item, dict):
            ts = item.get(ts_key)
            val = item.get(val_key)
            if ts is not None and val is not None:
                rows.append([ts, val])
    return rows


def parse_readings(data: Any, time_keys=("startGMT", "startTimeGMT", "timestampGMT", "timestamp"), value_keys=("value",)):
    rows = []
    items = data if isinstance(data, list) else []
    for item in items:
        if isinstance(item, dict):
            ts = first_present(item, *time_keys)
            val = first_present(item, *value_keys)
            if ts is not None and val is not None:
                rows.append([ts, val])
        elif isinstance(item, list) and len(item) >= 2 and item[1] is not None:
            rows.append([item[0], item[1]])
    return rows


def collect_time_series(user_id: int, day: str, payload: dict[str, Any]) -> dict[str, list[str]]:
    batches: dict[str, list[str]] = {}
    sleep = payload.get("sleep") or {}

    def add_batch(table: str, columns: list[str], row: list[str]):
        if table not in batches:
            batches[table] = [", ".join(columns)]
        batches[table].append("(" + ", ".join(row) + ")")

    heart_rates = payload.get("heart_rates") or {}
    for ts, bpm in parse_pair_array(heart_rates):
        add_batch("HeartRateSamples",
            ["user_id", "sample_time_utc", "heart_rate_bpm", "source"],
            [sql_int(user_id), sql_datetime(ts), sql_int(bpm), "'monitoring'"])

    sleep_hr = sleep.get("sleepHeartRate") or []
    for ts, bpm in parse_readings(sleep_hr, value_keys=("value", "heartRate", "heartRateBpm")):
        add_batch("HeartRateSamples",
            ["user_id", "sample_time_utc", "heart_rate_bpm", "source"],
            [sql_int(user_id), sql_datetime(ts), sql_int(bpm), "'sleep'"])

    stress = payload.get("stress") or {}
    for ts, level in parse_pair_array(stress.get("stressValuesArray") if isinstance(stress, dict) else stress):
        add_batch("StressSamples",
            ["user_id", "sample_time_utc", "stress_level", "source"],
            [sql_int(user_id), sql_datetime(ts), sql_int(level), "'monitoring'"])

    sleep_stress = sleep.get("sleepStress") or {}
    for ts, level in parse_readings(sleep_stress if isinstance(sleep_stress, list) else [], value_keys=("value", "stressLevel")):
        add_batch("StressSamples",
            ["user_id", "sample_time_utc", "stress_level", "source"],
            [sql_int(user_id), sql_datetime(ts), sql_int(level), "'sleep'"])

    steps = payload.get("steps") or []
    if isinstance(steps, dict):
        steps = (
            steps.get("stepDTOs")
            or steps.get("stepsData")
            or steps.get("dailyStepDTOList")
            or steps.get("activitySteps")
            or []
        )
    if isinstance(steps, list):
        for entry in steps:
            if isinstance(entry, dict):
                start = first_present(entry, "startGMT", "startTimestamp", "startTimeGMT", "startTime")
                end = first_present(entry, "endGMT", "endTimestamp", "endTimeGMT", "endTime")
                s = first_present(entry, "steps", "stepCount") or 0
                level = first_present(entry, "activityLevel", "primaryActivityLevel", "activityLevelConstant")
                if start:
                    add_batch("StepSamples",
                        ["user_id", "segment_start_utc", "segment_end_utc", "steps", "activity_level"],
                        [sql_int(user_id), sql_datetime(start), sql_datetime(end), sql_int(s), sql_string(level)])

    intensity = payload.get("intensity_minutes") or {}
    im_values = intensity.get("imValuesArray") if isinstance(intensity, dict) else intensity
    if isinstance(im_values, list):
        for item in im_values:
            if isinstance(item, list) and len(item) >= 3:
                ts = item[0]
                moderate = item[1] if isinstance(item[1], (int, float)) else None
                vigorous = item[2] if isinstance(item[2], (int, float)) else None
                if moderate is not None or vigorous is not None:
                    add_batch("IntensityMinuteSamples",
                        ["user_id", "sample_time_utc", "moderate_minutes", "vigorous_minutes"],
                        [sql_int(user_id), sql_datetime(ts), sql_number(moderate), sql_number(vigorous)])
            elif isinstance(item, dict):
                ts = first_present(item, "startGMT", "startTimeGMT", "timestampGMT", "timestamp")
                moderate = first_present(item, "moderateMinutes", "moderateIntensityMinutes", "moderate")
                vigorous = first_present(item, "vigorousMinutes", "vigorousIntensityMinutes", "vigorous")
                if ts and (moderate is not None or vigorous is not None):
                    add_batch("IntensityMinuteSamples",
                        ["user_id", "sample_time_utc", "moderate_minutes", "vigorous_minutes"],
                        [sql_int(user_id), sql_datetime(ts), sql_number(moderate), sql_number(vigorous)])

    sleep_levels = sleep.get("sleepLevels") or []
    if isinstance(sleep_levels, list):
        stage_map = {0: "deep", 1: "light", 2: "rem", 3: "awake", -1: "unknown", 4: "unknown"}
        for entry in sleep_levels:
            if isinstance(entry, dict):
                act = entry.get("activityLevel")
                if act is not None:
                    stage = stage_map.get(int(act), "unknown")
                    start_ts = first_present(entry, "startGMT", "startTimeGMT", "start")
                    end_ts = first_present(entry, "endGMT", "endTimeGMT", "end")
                    if start_ts and end_ts:
                        start_dt = sql_datetime(start_ts)
                        end_dt = sql_datetime(end_ts)
                        dur = sql_int((to_epoch_seconds(end_ts) - to_epoch_seconds(start_ts)))
                        add_batch("SleepStageSamples",
                            ["user_id", "sleep_date", "stage_start_utc", "stage_end_utc", "stage_type", "duration_s"],
                            [sql_int(user_id), sql_string(day), start_dt, end_dt,
                             sql_string(stage), dur])

    for source_key, source_val in [("sleepMovement", "sleepMovement"), ("sleepRestlessMoments", "sleepRestlessMoments")]:
        entries = sleep.get(source_key) or []
        if isinstance(entries, list):
            for entry in entries:
                if isinstance(entry, dict):
                    start_ts = first_present(entry, "startGMT", "startTimeGMT", "start")
                    end_ts = first_present(entry, "endGMT", "endTimeGMT", "end")
                    level = first_present(entry, "activityLevel", "value", "intensity", "movementLevel")
                    if start_ts and level is not None:
                        add_batch("SleepMovementSamples",
                            ["user_id", "sleep_date", "segment_start_utc", "segment_end_utc", "movement_level", "source"],
                            [sql_int(user_id), sql_string(day),
                             sql_datetime(start_ts),
                             sql_datetime(end_ts),
                             sql_number(level), sql_string(source_val)])

    hrv_rows = []
    hrv_rows.extend(parse_readings(sleep.get("hrvData") or [], value_keys=("value", "hrv", "hrvValue")))
    hrv_payload = payload.get("hrv") or {}
    if isinstance(hrv_payload, dict):
        hrv_rows.extend(parse_readings(hrv_payload.get("hrvReadings") or [], value_keys=("value", "hrv", "hrvValue")))
    for ts, val in hrv_rows:
        add_batch("HrvSamples",
            ["user_id", "sample_time_utc", "sleep_date", "hrv"],
            [sql_int(user_id), sql_datetime(ts), sql_string(day), sql_number(val)])

    training_status = payload.get("training_status") or {}
    training_value = scalar(
        first_present(training_status, "mostRecentTrainingStatus", "trainingStatus"),
        "trainingStatusFeedbackPhrase", "trainingStatus", "status", "value",
    )
    vo2max = scalar(first_present(training_status, "mostRecentVO2Max", "vO2MaxValue", "vo2max"), "value", "vo2MaxValue", "vO2MaxValue")
    load_balance = scalar(
        first_present(training_status, "mostRecentTrainingLoadBalance", "trainingLoadBalance", "loadBalance"),
        "trainingBalanceFeedbackPhrase", "loadBalance", "status", "value",
    )
    acute_load = first_key(training_status, "dailyTrainingLoadAcute")
    chronic_load = first_key(training_status, "dailyTrainingLoadChronic")
    acwr_ratio = first_key(training_status, "dailyAcuteChronicWorkloadRatio")
    acwr_status = first_key(training_status, "acwrStatus")
    acwr_percent = first_key(training_status, "acwrPercent")
    optimal_min = first_key(training_status, "minTrainingLoadChronic")
    optimal_max = first_key(training_status, "maxTrainingLoadChronic")
    low_aerobic = first_key(training_status, "monthlyLoadAerobicLow")
    low_aerobic_min = first_key(training_status, "monthlyLoadAerobicLowTargetMin")
    low_aerobic_max = first_key(training_status, "monthlyLoadAerobicLowTargetMax")
    high_aerobic = first_key(training_status, "monthlyLoadAerobicHigh")
    high_aerobic_min = first_key(training_status, "monthlyLoadAerobicHighTargetMin")
    high_aerobic_max = first_key(training_status, "monthlyLoadAerobicHighTargetMax")
    anaerobic = first_key(training_status, "monthlyLoadAnaerobic")
    anaerobic_min = first_key(training_status, "monthlyLoadAnaerobicTargetMin")
    anaerobic_max = first_key(training_status, "monthlyLoadAnaerobicTargetMax")
    status_date = first_key(training_status, "calendarDate", "date") or day
    if isinstance(training_status, dict) and (training_value or vo2max or load_balance):
        add_batch("TrainingStatusSnapshots",
            [
                "user_id", "snapshot_date", "vo2max", "training_status", "load_balance",
                "acute_training_load", "chronic_training_load", "acute_chronic_workload_ratio",
                "acwr_status", "acwr_percent", "optimal_load_min", "optimal_load_max",
                "low_aerobic_load", "low_aerobic_target_min", "low_aerobic_target_max",
                "high_aerobic_load", "high_aerobic_target_min", "high_aerobic_target_max",
                "anaerobic_load", "anaerobic_target_min", "anaerobic_target_max", "raw_json",
            ],
            [sql_int(user_id), sql_string(str(status_date)[:10]),
             sql_number(vo2max),
             sql_string(training_value),
             sql_string(load_balance),
             sql_number(acute_load),
             sql_number(chronic_load),
             sql_number(acwr_ratio),
             sql_string(acwr_status),
             sql_number(acwr_percent),
             sql_number(optimal_min),
             sql_number(optimal_max),
             sql_number(low_aerobic),
             sql_number(low_aerobic_min),
             sql_number(low_aerobic_max),
             sql_number(high_aerobic),
             sql_number(high_aerobic_min),
             sql_number(high_aerobic_max),
             sql_number(anaerobic),
             sql_number(anaerobic_min),
             sql_number(anaerobic_max),
             sql_json(training_status)])

    race_preds = payload.get("race_predictions") or {}
    pred_list = race_preds if isinstance(race_preds, list) else [race_preds]
    for entry in pred_list:
        pred_date = first_present(entry, "predictionDate", "calendarDate", "date") if isinstance(entry, dict) else None
        if isinstance(entry, dict) and pred_date:
            add_batch("RacePredictions",
                ["user_id", "prediction_date", "time_5k_s", "time_10k_s", "time_half_marathon_s", "time_marathon_s", "raw_json"],
                [sql_int(user_id), sql_string(str(pred_date)[:10]),
                 sql_int(first_present(entry, "5k", "time5K", "time5k")),
                 sql_int(first_present(entry, "10k", "time10K", "time10k")),
                 sql_int(first_present(entry, "halfMarathon", "timeHalfMarathon")),
                 sql_int(first_present(entry, "marathon", "timeMarathon")),
                 sql_json(entry)])

    lt = payload.get("lactate_threshold") or {}
    lt_hr = scalar(first_key(lt, "heartRateBpm", "heartRate", "heartRateInBeatsPerMinute"), "value")
    lt_cycling_hr = scalar(first_key(lt, "heartRateCycling"), "value")
    lt_speed = scalar(first_key(lt, "speedMps", "speed", "thresholdSpeed"), "value")
    lt_power = scalar(first_key(lt, "functionalThresholdPower", "powerWatts", "watts", "power"), "value", "functionalThresholdPower")
    lt_power_to_weight = scalar(first_key(lt, "powerToWeight"), "value")
    lt_date = first_key(lt, "calendarDate", "date") or day
    if isinstance(lt, dict) and (lt_hr or lt_speed or lt_power):
        add_batch("LactateThresholds",
            ["user_id", "threshold_date", "heart_rate_bpm", "cycling_heart_rate_bpm", "speed_mps", "power_w", "power_to_weight", "raw_json"],
            [sql_int(user_id), sql_string(str(lt_date)[:10]),
             sql_int(lt_hr),
             sql_int(lt_cycling_hr),
             sql_number(lt_speed),
             sql_int(lt_power),
             sql_number(lt_power_to_weight),
             sql_json(lt)])

    ftp = payload.get("cycling_ftp") or {}
    ftp_w = first_present(ftp, "functionalThresholdPower", "ftp", "thresholdPower")
    ftp_date = first_present(ftp, "calendarDate", "date") or day
    if isinstance(ftp, dict) and ftp_w:
        add_batch("CyclingFtpSnapshots",
            ["user_id", "snapshot_date", "ftp_w", "sport", "source", "raw_json"],
            [sql_int(user_id), sql_string(str(ftp_date)[:10]),
             sql_int(ftp_w),
             sql_string(ftp.get("sport") or "cycling"),
             sql_string(ftp.get("biometricSourceType") or ftp.get("source") or "garmin"),
             sql_json(ftp)])

    return batches


def build_sql(health_dir: Path, user_id: int):
    day_count = len(list(health_dir.glob("*.json")))
    lines = ["USE MotionAnalysis;"]
    batch_rows: dict[str, list[str]] = {}
    batch_cols: dict[str, str] = {}
    status_lines: list[str] = []

    for index, path in enumerate(sorted(health_dir.glob("*.json")), start=1):
        day = path.stem
        payload = json.loads(path.read_text(encoding="utf-8-sig"))
        status_lines.append(f"SELECT 'Importing Garmin health {day} ({index}/{day_count})' AS status;")
        lines.append(build_daily_sql(user_id, day, payload))
        lines.append(build_sleep_sql(user_id, day, payload))
        for table, rows in collect_time_series(user_id, day, payload).items():
            if table not in batch_rows:
                batch_rows[table] = []
                batch_cols[table] = rows[0]
            batch_rows[table].extend(rows[1:])

    lines = status_lines + lines
    for table in batch_rows:
        rows = batch_rows[table]
        if not rows:
            continue
        columns = [column.strip() for column in batch_cols[table].split(",")]
        key_columns = {
            "user_id", "sample_time_utc", "segment_start_utc", "stage_start_utc",
            "source", "snapshot_date", "prediction_date", "threshold_date",
        }
        update_columns = [column for column in columns if column not in key_columns]
        prefix = f"INSERT INTO {table} ({batch_cols[table]}) VALUES\n"
        sql = prefix + ",\n".join(rows)
        if update_columns:
            sql += "\nON DUPLICATE KEY UPDATE " + ", ".join(f"{column} = VALUES({column})" for column in update_columns)
        sql += ";"
        lines.append(sql)
    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser(description="Convert downloaded Garmin daily health JSON files into MySQL import SQL.")
    parser.add_argument("--health-dir", required=True)
    parser.add_argument("--user-id", required=True, type=int)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    health_dir = Path(args.health_dir)
    if not list(health_dir.glob("*.json")):
        raise SystemExit(f"No health JSON files found in {health_dir}")
    Path(args.out).write_text(build_sql(health_dir, args.user_id), encoding="utf-8")


if __name__ == "__main__":
    main()
