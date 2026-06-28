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
    columns = [
        "user_id", "sleep_date", "sleep_start", "sleep_end", "duration_s",
        "deep_sleep_s", "light_sleep_s", "rem_sleep_s", "awake_s", "sleep_score",
        "avg_hrv", "avg_heart_rate_during_sleep", "avg_sleep_stress",
        "avg_respiration_value", "lowest_respiration_value", "highest_respiration_value",
        "raw_json",
    ]
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
        sql_number(first_key(dto, "avgOvernightHrv")),
        sql_int(first_key(dto, "avgHeartRate")),
        sql_number(first_key(dto, "avgSleepStress")),
        sql_number(first_key(dto, "averageRespirationValue")),
        sql_number(first_key(dto, "lowestRespirationValue")),
        sql_number(first_key(dto, "highestRespirationValue")),
        sql_json(sleep),
    ]
    return upsert("SleepSummaries", columns, values, columns[2:])


def build_sql(health_dir: Path, user_id: int):
    lines = ["USE MotionAnalysis;"]
    for path in sorted(health_dir.glob("*.json")):
        day = path.stem
        payload = json.loads(path.read_text(encoding="utf-8-sig"))
        lines.append(f"SELECT 'Importing Garmin health {day}' AS status;")
        lines.append(build_daily_sql(user_id, day, payload))
        lines.append(build_sleep_sql(user_id, day, payload))
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
