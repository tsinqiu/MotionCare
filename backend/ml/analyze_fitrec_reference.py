from __future__ import annotations

import argparse
import gzip
import json
from collections import defaultdict
from pathlib import Path
from statistics import mean


def open_text(path: Path):
    if path.suffix == ".gz":
        return gzip.open(path, "rt", encoding="utf-8")
    return path.open("r", encoding="utf-8")


def iter_records(path: Path):
    with open_text(path) as handle:
        for line in handle:
            text = line.strip()
            if not text:
                continue
            try:
                yield json.loads(text)
            except json.JSONDecodeError:
                continue


def first_number(record: dict, keys: list[str]) -> float | None:
    for key in keys:
        value = record.get(key)
        if isinstance(value, list):
            values = [float(item) for item in value if isinstance(item, (int, float))]
            return mean(values) if values else None
        try:
            number_value = float(value)
        except (TypeError, ValueError):
            continue
        if number_value > 0:
            return number_value
    return None


def quantile(values: list[float], q: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = (len(ordered) - 1) * q
    lower = int(index)
    upper = min(lower + 1, len(ordered) - 1)
    if lower == upper:
        return ordered[lower]
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (index - lower)


def sport_name(record: dict) -> str:
    return str(
        record.get("sport")
        or record.get("sport_type")
        or record.get("activity_type")
        or record.get("type")
        or ""
    ).lower()


def user_id(record: dict) -> str:
    return str(record.get("userId") or record.get("user_id") or record.get("user") or "unknown")


def normalized_run(record: dict) -> dict | None:
    if "run" not in sport_name(record):
        return None
    distance_m = first_number(record, ["distance", "distance_m", "distanceM"])
    duration_s = first_number(record, ["duration", "duration_s", "durationS", "elapsed_time"])
    avg_hr = first_number(record, ["avg_heart_rate", "avgHeartRate", "heart_rate", "heartRate"])
    speed_mps = first_number(record, ["speed", "avg_speed", "avgSpeedMps"])
    if not distance_m or not duration_s:
        return None
    if distance_m < 1000 or duration_s < 300:
        return None
    pace_min_km = duration_s / 60 / (distance_m / 1000)
    if pace_min_km <= 0 or pace_min_km > 12:
        return None
    return {
        "userId": user_id(record),
        "distanceKm": distance_m / 1000,
        "durationMinutes": duration_s / 60,
        "paceMinKm": pace_min_km,
        "avgHeartRate": avg_hr,
        "speedMps": speed_mps,
    }


def build_report(records: list[dict], min_activities: int, max_avg_pace_min_km: float) -> dict:
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
        user_summaries.append({
            "userId": current_user,
            "activityCount": len(rows),
            "avgPaceMinKm": round(avg_pace, 3),
            "medianDistanceKm": round(quantile([row["distanceKm"] for row in rows], 0.5) or 0, 3),
            "p80DistanceKm": round(quantile([row["distanceKm"] for row in rows], 0.8) or 0, 3),
            "p80DurationMinutes": round(quantile([row["durationMinutes"] for row in rows], 0.8) or 0, 3),
            "avgHeartRate": round(mean([row["avgHeartRate"] for row in rows if row["avgHeartRate"]]), 1)
            if any(row["avgHeartRate"] for row in rows)
            else None,
        })

    similar_user_ids = {item["userId"] for item in user_summaries}
    similar_runs = [row for row in records if row["userId"] in similar_user_ids]
    return {
        "source": "FitRec/Endomondo offline reference, academic use only",
        "filters": {
            "sport": "running",
            "minActivitiesPerUser": min_activities,
            "maxAvgPaceMinKm": max_avg_pace_min_km,
        },
        "counts": {
            "runningActivities": len(records),
            "similarUsers": len(user_summaries),
            "similarUserActivities": len(similar_runs),
        },
        "similarActivityDistribution": {
            "paceMinKm": {
                "p20": quantile([row["paceMinKm"] for row in similar_runs], 0.2),
                "p50": quantile([row["paceMinKm"] for row in similar_runs], 0.5),
                "p80": quantile([row["paceMinKm"] for row in similar_runs], 0.8),
            },
            "distanceKm": {
                "p20": quantile([row["distanceKm"] for row in similar_runs], 0.2),
                "p50": quantile([row["distanceKm"] for row in similar_runs], 0.5),
                "p80": quantile([row["distanceKm"] for row in similar_runs], 0.8),
            },
            "durationMinutes": {
                "p20": quantile([row["durationMinutes"] for row in similar_runs], 0.2),
                "p50": quantile([row["durationMinutes"] for row in similar_runs], 0.5),
                "p80": quantile([row["durationMinutes"] for row in similar_runs], 0.8),
            },
        },
        "topSimilarUsers": sorted(user_summaries, key=lambda item: (-item["activityCount"], item["avgPaceMinKm"]))[:20],
        "notes": [
            "This report is for academic comparison only and is not used by online inference.",
            "Do not redistribute the original FitRec/Endomondo data with the project.",
            "Final coach decisions still prioritize user feedback and next-day recovery labels.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Build an offline similar-runner reference report from FitRec/Endomondo JSONL data.")
    parser.add_argument("--input", required=True, help="Path to FitRec/Endomondo JSONL or JSONL.GZ file")
    parser.add_argument("--out", default="fitrec_reference_report.json", help="Output report path")
    parser.add_argument("--min-activities", type=int, default=20)
    parser.add_argument("--max-avg-pace-min-km", type=float, default=5.0)
    args = parser.parse_args()

    records = [record for record in (normalized_run(item) for item in iter_records(Path(args.input))) if record]
    report = build_report(records, args.min_activities, args.max_avg_pace_min_km)
    output_path = Path(args.out)
    output_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "output": str(output_path),
        "runningActivities": report["counts"]["runningActivities"],
        "similarUsers": report["counts"]["similarUsers"],
        "similarUserActivities": report["counts"]["similarUserActivities"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
