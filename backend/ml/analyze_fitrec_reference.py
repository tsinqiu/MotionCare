from __future__ import annotations

import argparse
import ast
import gzip
import json
import math
from collections import Counter, defaultdict
from pathlib import Path
from statistics import mean
from typing import Iterable


EARTH_RADIUS_KM = 6371.0088


def open_text(path: Path):
    if path.suffix == ".gz":
        return gzip.open(path, "rt", encoding="utf-8", errors="replace")
    return path.open("r", encoding="utf-8", errors="replace")


def iter_records(path: Path, max_records: int | None = None) -> Iterable[dict]:
    with open_text(path) as handle:
        for index, line in enumerate(handle):
            if max_records is not None and index >= max_records:
                break
            text = line.strip()
            if not text:
                continue
            try:
                payload = ast.literal_eval(text)
            except (SyntaxError, ValueError):
                continue
            if isinstance(payload, dict):
                yield payload


def finite_numbers(values) -> list[float]:
    if not isinstance(values, list):
        return []
    result = []
    for value in values:
        try:
            number_value = float(value)
        except (TypeError, ValueError):
            continue
        if math.isfinite(number_value):
            result.append(number_value)
    return result


def quantile(values: list[float], q: float) -> float | None:
    numeric_values = sorted(value for value in values if math.isfinite(value))
    if not numeric_values:
        return None
    index = (len(numeric_values) - 1) * q
    lower = math.floor(index)
    upper = math.ceil(index)
    if lower == upper:
        return numeric_values[lower]
    return numeric_values[lower] + (numeric_values[upper] - numeric_values[lower]) * (index - lower)


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon / 2) ** 2
    )
    return 2 * EARTH_RADIUS_KM * math.asin(min(1, math.sqrt(a)))


def gps_distance_km(record: dict) -> float | None:
    latitudes = finite_numbers(record.get("latitude"))
    longitudes = finite_numbers(record.get("longitude"))
    if len(latitudes) < 2 or len(latitudes) != len(longitudes):
        return None
    total = 0.0
    for index in range(1, len(latitudes)):
        step = haversine_km(latitudes[index - 1], longitudes[index - 1], latitudes[index], longitudes[index])
        if step <= 2:
            total += step
    return total if total > 0 else None


def duration_seconds(record: dict) -> float | None:
    timestamps = finite_numbers(record.get("timestamp"))
    if len(timestamps) < 2:
        return None
    duration = max(timestamps) - min(timestamps)
    return duration if duration > 0 else None


def ascent_m(record: dict) -> float | None:
    altitudes = finite_numbers(record.get("altitude"))
    if len(altitudes) < 2:
        return None
    gain = 0.0
    for index in range(1, len(altitudes)):
        delta = altitudes[index] - altitudes[index - 1]
        if 0 < delta <= 30:
            gain += delta
    return gain


def sport_name(record: dict) -> str:
    return str(record.get("sport") or "").lower()


def user_id(record: dict) -> str:
    return str(record.get("userId") or record.get("user_id") or "unknown")


def normalized_run(record: dict) -> tuple[dict | None, str | None]:
    if sport_name(record) != "run":
        return None, "non_run"
    duration_s = duration_seconds(record)
    distance_km = gps_distance_km(record)
    heart_rates = [value for value in finite_numbers(record.get("heart_rate")) if 30 <= value <= 240]
    if duration_s is None:
        return None, "missing_duration"
    if distance_km is None:
        return None, "missing_gps_distance"
    if distance_km < 1 or duration_s < 300:
        return None, "too_short"
    if distance_km > 100 or duration_s > 8 * 3600:
        return None, "too_long"
    pace_min_km = duration_s / 60 / distance_km
    if pace_min_km < 2.5 or pace_min_km > 12:
        return None, "pace_outlier"
    avg_hr = mean(heart_rates) if heart_rates else None
    return {
        "userId": user_id(record),
        "distanceKm": distance_km,
        "durationMinutes": duration_s / 60,
        "paceMinKm": pace_min_km,
        "avgHeartRate": avg_hr,
        "maxHeartRate": max(heart_rates) if heart_rates else None,
        "ascentM": ascent_m(record),
        "gender": record.get("gender") or "unknown",
    }, None


def distribution(values: list[float]) -> dict[str, float | None]:
    return {
        "p10": quantile(values, 0.1),
        "p20": quantile(values, 0.2),
        "p50": quantile(values, 0.5),
        "p80": quantile(values, 0.8),
        "p90": quantile(values, 0.9),
    }


def rounded_distribution(values: list[float], digits: int = 3) -> dict[str, float | None]:
    return {
        key: round(value, digits) if value is not None else None
        for key, value in distribution(values).items()
    }


def build_report(records: list[dict], quality_counts: Counter, min_activities: int, max_avg_pace_min_km: float, max_records: int | None) -> dict:
    by_user: dict[str, list[dict]] = defaultdict(list)
    for record in records:
        by_user[record["userId"]].append(record)

    user_summaries = []
    for current_user, rows in by_user.items():
        if len(rows) < min_activities:
            continue
        avg_pace = mean(row["paceMinKm"] for row in rows)
        if avg_pace > max_avg_pace_min_km:
            continue
        hr_values = [row["avgHeartRate"] for row in rows if row["avgHeartRate"] is not None]
        user_summaries.append({
            "userId": current_user,
            "activityCount": len(rows),
            "avgPaceMinKm": round(avg_pace, 3),
            "medianDistanceKm": round(quantile([row["distanceKm"] for row in rows], 0.5) or 0, 3),
            "p80DistanceKm": round(quantile([row["distanceKm"] for row in rows], 0.8) or 0, 3),
            "p80DurationMinutes": round(quantile([row["durationMinutes"] for row in rows], 0.8) or 0, 3),
            "avgHeartRate": round(mean(hr_values), 1) if hr_values else None,
        })

    similar_user_ids = {item["userId"] for item in user_summaries}
    similar_runs = [row for row in records if row["userId"] in similar_user_ids]
    reference_rows = similar_runs or records
    hr_values = [row["avgHeartRate"] for row in reference_rows if row["avgHeartRate"] is not None]
    max_hr_values = [row["maxHeartRate"] for row in reference_rows if row["maxHeartRate"] is not None]
    ascent_values = [row["ascentM"] for row in reference_rows if row["ascentM"] is not None]

    return {
        "source": "FitRec/Endomondo HR offline reference, academic use only",
        "format": "Python literal records from endomondoHR.json.gz parsed with ast.literal_eval",
        "sampled": max_records is not None,
        "maxRecords": max_records,
        "filters": {
            "sport": "run",
            "minActivitiesPerUser": min_activities,
            "maxAvgPaceMinKm": max_avg_pace_min_km,
            "distanceKm": [1, 100],
            "durationMinutes": [5, 480],
            "paceMinKm": [2.5, 12],
        },
        "counts": {
            "validRunningActivities": len(records),
            "uniqueRunningUsers": len(by_user),
            "similarUsers": len(user_summaries),
            "similarUserActivities": len(similar_runs),
            "referenceActivities": len(reference_rows),
        },
        "quality": dict(quality_counts),
        "similarActivityDistribution": {
            "paceMinKm": rounded_distribution([row["paceMinKm"] for row in reference_rows]),
            "distanceKm": rounded_distribution([row["distanceKm"] for row in reference_rows]),
            "durationMinutes": rounded_distribution([row["durationMinutes"] for row in reference_rows]),
            "avgHeartRate": rounded_distribution(hr_values, 1),
            "maxHeartRate": rounded_distribution(max_hr_values, 1),
            "ascentM": rounded_distribution(ascent_values, 1),
        },
        "topSimilarUsers": sorted(user_summaries, key=lambda item: (-item["activityCount"], item["avgPaceMinKm"]))[:20],
        "notes": [
            "This aggregate report is for cold-start calibration and academic comparison only.",
            "Do not redistribute the original FitRec/Endomondo data with the project.",
            "Final coach decisions still prioritize local Garmin-derived data, user feedback, recovery labels, and safety rules.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Build an offline similar-runner reference report from FitRec/Endomondo HR data.")
    parser.add_argument("--input", required=True, help="Path to endomondoHR.json.gz")
    parser.add_argument(
        "--out",
        default=str(Path(__file__).resolve().parent / "reference" / "fitrec_reference_report.json"),
        help="Output aggregate reference report path",
    )
    parser.add_argument("--min-activities", type=int, default=20)
    parser.add_argument("--max-avg-pace-min-km", type=float, default=6.0)
    parser.add_argument("--max-records", type=int, default=None, help="Optional cap for smoke tests or sampled reports")
    args = parser.parse_args()

    records = []
    quality_counts: Counter = Counter()
    for raw_record in iter_records(Path(args.input), args.max_records):
        normalized, reason = normalized_run(raw_record)
        if normalized is None:
            quality_counts[reason or "invalid"] += 1
            continue
        quality_counts["valid_run"] += 1
        records.append(normalized)

    report = build_report(records, quality_counts, args.min_activities, args.max_avg_pace_min_km, args.max_records)
    output_path = Path(args.out)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "output": str(output_path),
        "validRunningActivities": report["counts"]["validRunningActivities"],
        "similarUsers": report["counts"]["similarUsers"],
        "referenceActivities": report["counts"]["referenceActivities"],
        "sampled": report["sampled"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
