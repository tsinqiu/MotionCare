from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

import joblib
import mysql.connector
import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.inspection import permutation_importance
from sklearn.metrics import accuracy_score, confusion_matrix
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline


MODEL_VERSION = "coach-v1"
SCHEMA_PATH = Path(__file__).resolve().parent / "feature_schema.json"
FEATURE_SCHEMA = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
FEATURE_NAMES = [item["name"] for item in FEATURE_SCHEMA["features"]]
WINDOWS = [1, 3, 7, 14, 28]
SOURCE_WEIGHTS = {
    "user_feedback": 5.0,
    "delayed_objective": 3.0,
    "rule_pseudo": 1.0,
}


def read_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        text = line.strip()
        if not text or text.startswith("#") or "=" not in text:
            continue
        key, value = text.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def connect(env_path: Path):
    env = read_env(env_path)
    return mysql.connector.connect(
        host=env.get("DB_HOST", "127.0.0.1"),
        port=int(env.get("DB_PORT", "3306")),
        database=env.get("DB_NAME", "MotionAnalysis"),
        user=env.get("DB_USER", "root"),
        password=env.get("DB_PASSWORD", ""),
    )


def parse_date(value) -> date | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    return datetime.fromisoformat(str(value)[:10]).date()


def fetch_rows(connection, sql: str) -> list[dict[str, object]]:
    cursor = connection.cursor(dictionary=True)
    cursor.execute(sql)
    rows = cursor.fetchall()
    cursor.close()
    return rows


def table_exists(connection, table_name: str) -> bool:
    cursor = connection.cursor()
    cursor.execute("SHOW TABLES LIKE %s", (table_name,))
    exists = cursor.fetchone() is not None
    cursor.close()
    return exists


def weather_condition_risk(condition: object) -> int:
    text = str(condition or "").lower()
    if any(token in text for token in ["雷", "暴", "storm", "thunder", "snow", "冰", "雪"]):
        return 2
    if any(token in text for token in ["雨", "rain", "shower", "wind", "风"]):
        return 1
    return 0


def weather_risk(feels_like: float, humidity: float, condition_risk: int) -> int:
    score = condition_risk
    if feels_like >= 35:
        score += 2
    elif feels_like >= 30 and humidity >= 70:
        score += 1
    if score >= 2:
        return 2
    if score >= 1:
        return 1
    return 0


def coverage(days: list[date], latest_day: date, window: int) -> float:
    start = latest_day - timedelta(days=window - 1)
    return len({day for day in days if start <= day <= latest_day}) / window


def build_daily_features(connection) -> list[dict[str, object]]:
    activities = fetch_rows(
        connection,
        """
        SELECT
          DATE(a.local_start_time) AS local_date,
          js.distance_m AS distance_m,
          js.duration_s AS duration_s,
          js.activity_training_load AS activity_training_load,
          js.avg_heart_rate_bpm AS avg_heart_rate_bpm,
          a.temperature_c,
          a.humidity_percent,
          a.feels_like_c,
          a.weather_condition,
          a.perceived_effort
        FROM Activities a
        LEFT JOIN ActivitySummaries js ON js.activity_id = a.id
        WHERE a.local_start_time IS NOT NULL
        """,
    )
    sleep = {parse_date(row["sleep_date"]): row for row in fetch_rows(
        connection,
        """
        SELECT sleep_date, duration_s, deep_sleep_s, rem_sleep_s, sleep_score, avg_hrv, avg_sleep_stress
        FROM SleepSummaries
        """,
    ) if parse_date(row["sleep_date"])}
    health = {parse_date(row["summary_date"]): row for row in fetch_rows(
        connection,
        """
        SELECT summary_date, resting_heart_rate_bpm, avg_stress_level, max_body_battery, body_battery_drained
        FROM DailyHealthSummaries
        """,
    ) if parse_date(row["summary_date"])}
    training = {parse_date(row["snapshot_date"]): row for row in fetch_rows(
        connection,
        """
        SELECT snapshot_date, acute_training_load, chronic_training_load, acute_chronic_workload_ratio
        FROM TrainingStatusSnapshots
        """,
    ) if parse_date(row["snapshot_date"])}
    morning_feedback = {}
    if table_exists(connection, "MorningReadinessFeedback"):
        morning_feedback = {parse_date(row["feedback_date"]): row for row in fetch_rows(
            connection,
            """
            SELECT feedback_date, readiness_score, muscle_soreness, mental_state, training_willingness
            FROM MorningReadinessFeedback
            """,
        ) if parse_date(row["feedback_date"])}
    advice_feedback: dict[date, list[dict[str, object]]] = defaultdict(list)
    if table_exists(connection, "AiCoachFeedback"):
        for row in fetch_rows(
            connection,
            """
            SELECT suggestion_date, suggestion_type, feedback, ml_risk_level, ml_load_action, ml_weather_risk
            FROM AiCoachFeedback
            WHERE suggestion_date IS NOT NULL
            """,
        ):
            feedback_day = parse_date(row["suggestion_date"])
            if feedback_day:
                advice_feedback[feedback_day].append(row)

    by_day: dict[date, list[dict[str, object]]] = defaultdict(list)
    all_dates: set[date] = set()
    for row in activities:
        day = parse_date(row["local_date"])
        if not day:
            continue
        by_day[day].append(row)
        all_dates.add(day)
    all_dates.update(sleep.keys())
    all_dates.update(health.keys())
    all_dates.update(training.keys())
    if not all_dates:
        return []

    min_day = min(all_dates)
    max_day = max(all_dates)
    days = [min_day + timedelta(days=offset) for offset in range((max_day - min_day).days + 1)]
    result: list[dict[str, object]] = []

    for day in days:
        features: dict[str, object] = {"feature_date": day.isoformat()}
        for window in WINDOWS:
            start = day - timedelta(days=window - 1)
            rows = [item for current_day, day_rows in by_day.items() if start <= current_day <= day for item in day_rows]
            features[f"distance_{window}d"] = sum(float(row.get("distance_m") or 0) for row in rows) / 1000
            features[f"duration_{window}d"] = sum(float(row.get("duration_s") or 0) for row in rows) / 3600
            features[f"load_{window}d"] = sum(float(row.get("activity_training_load") or 0) for row in rows)

        rows7d = [item for current_day, day_rows in by_day.items() if day - timedelta(days=6) <= current_day <= day for item in day_rows]
        active_days_7d = len([current_day for current_day in by_day if day - timedelta(days=6) <= current_day <= day])
        features["hard_minutes_7d"] = sum(
            float(row.get("duration_s") or 0) / 60
            for row in rows7d
            if float(row.get("activity_training_load") or 0) >= 120 or float(row.get("avg_heart_rate_bpm") or 0) >= 155
        )
        features["rest_days_7d"] = max(0, 7 - active_days_7d)

        train_row = training.get(day, {})
        features["atl"] = float(train_row.get("acute_training_load") or 0)
        features["ctl"] = float(train_row.get("chronic_training_load") or 0)
        features["tsb"] = features["ctl"] - features["atl"]
        features["acwr_7_28"] = float(train_row.get("acute_chronic_workload_ratio") or (
            features["load_7d"] / (features["load_28d"] / 4) if features["load_28d"] else 0
        ))

        sleep_row = sleep.get(day, {})
        features["sleep_score"] = float(sleep_row.get("sleep_score") or 0)
        features["sleep_duration_h"] = float(sleep_row.get("duration_s") or 0) / 3600
        features["deep_sleep_minutes"] = float(sleep_row.get("deep_sleep_s") or 0) / 60
        features["rem_sleep_minutes"] = float(sleep_row.get("rem_sleep_s") or 0) / 60
        features["avg_hrv"] = float(sleep_row.get("avg_hrv") or 0)
        sleep_3d = [sleep.get(day - timedelta(days=offset), {}) for offset in range(3)]
        features["sleep_debt_3d"] = sum(max(0, 7 - float(row.get("duration_s") or 0) / 3600) for row in sleep_3d)
        hrv_values = [float(row.get("avg_hrv") or 0) for current_day, row in sleep.items() if day - timedelta(days=13) <= current_day <= day and row.get("avg_hrv")]
        hrv_baseline = sum(hrv_values) / len(hrv_values) if hrv_values else 0
        features["hrv_delta_pct"] = ((features["avg_hrv"] - hrv_baseline) / hrv_baseline * 100) if hrv_baseline else 0

        health_row = health.get(day, {})
        features["resting_hr"] = float(health_row.get("resting_heart_rate_bpm") or 0)
        resting_values = [float(row.get("resting_heart_rate_bpm") or 0) for current_day, row in health.items() if day - timedelta(days=13) <= current_day <= day and row.get("resting_heart_rate_bpm")]
        resting_baseline = sum(resting_values) / len(resting_values) if resting_values else 0
        features["resting_hr_delta"] = features["resting_hr"] - resting_baseline if resting_baseline else 0
        features["avg_stress"] = float(health_row.get("avg_stress_level") or sleep_row.get("avg_sleep_stress") or 0)
        features["body_battery_morning"] = float(health_row.get("max_body_battery") or 0)
        features["body_battery_drained"] = float(health_row.get("body_battery_drained") or 0)

        weather_rows = [row for offset in range(7) for row in by_day.get(day - timedelta(days=offset), []) if row.get("temperature_c") is not None or row.get("weather_condition")]
        latest_weather = weather_rows[0] if weather_rows else {}
        features["temperature_c"] = float(latest_weather.get("temperature_c") or 0)
        features["humidity_percent"] = float(latest_weather.get("humidity_percent") or 0)
        features["feels_like_c"] = float(latest_weather.get("feels_like_c") or features["temperature_c"] or 0)
        features["weather_condition_risk"] = weather_condition_risk(latest_weather.get("weather_condition"))
        features["weather_risk_level"] = weather_risk(features["feels_like_c"], features["humidity_percent"], features["weather_condition_risk"])
        features["heat_humidity_flag"] = 1 if features["feels_like_c"] >= 30 and features["humidity_percent"] >= 70 else 0
        sleep_days = [current_day for current_day, row in sleep.items() if row]
        weather_days = [current_day for current_day, rows in by_day.items() if any(row.get("temperature_c") is not None or row.get("weather_condition") for row in rows)]
        hrv_days = [current_day for current_day, row in sleep.items() if row.get("avg_hrv")]
        training_days = [current_day for current_day, row in training.items() if row]
        features["sleep_coverage_14d"] = coverage(sleep_days, day, 14)
        features["weather_coverage_14d"] = coverage(weather_days, day, 14)
        features["hrv_coverage_14d"] = coverage(hrv_days, day, 14)
        features["training_status_coverage_14d"] = coverage(training_days, day, 14)
        features["data_completeness_score"] = (
            features["sleep_coverage_14d"]
            + features["weather_coverage_14d"]
            + features["hrv_coverage_14d"]
            + features["training_status_coverage_14d"]
        ) / 4 * 100
        day_rows = by_day.get(day, [])
        perceived_values = [
            float(row["perceived_effort"])
            for row in day_rows
            if row.get("perceived_effort") is not None
        ]
        features["_perceived_effort_avg"] = sum(perceived_values) / len(perceived_values) if perceived_values else None
        features["_perceived_effort_count"] = len(perceived_values)
        features["_morning_feedback"] = morning_feedback.get(day)
        features["_advice_feedback"] = advice_feedback.get(day, [])
        features["_next_health"] = health.get(day + timedelta(days=1))
        features["_next_sleep"] = sleep.get(day + timedelta(days=1))
        result.append(features)
    return result


def make_labels(row: dict[str, object]) -> dict[str, str]:
    score = 0
    reasons_weather = int(row["weather_risk_level"])
    if float(row["tsb"]) < -25:
        score += 3
    elif float(row["tsb"]) < -10:
        score += 1
    if float(row["acwr_7_28"]) >= 1.5:
        score += 2
    elif float(row["acwr_7_28"]) >= 1.3:
        score += 1
    if 0 < float(row["sleep_score"]) < 60:
        score += 2
    elif 0 < float(row["sleep_duration_h"]) < 6:
        score += 1
    if float(row["hrv_delta_pct"]) <= -15:
        score += 1
    if float(row["avg_stress"]) >= 50:
        score += 1
    score += reasons_weather

    readiness = "low" if score >= 5 else "medium" if score >= 2 else "high"
    load_action = "rest" if score >= 6 else "reduce" if score >= 3 else "progress" if float(row["tsb"]) > 8 and float(row["acwr_7_28"]) <= 1.2 and reasons_weather == 0 else "maintain"
    primary = "rest" if load_action == "rest" else "sleep_focus" if 0 < float(row["sleep_score"]) < 60 else "hydration" if reasons_weather >= 2 else "normal_training" if load_action == "progress" else "easy_aerobic"
    return {
        "readinessLevel": readiness,
        "loadAction": load_action,
        "primaryRecommendation": primary,
    }


def readiness_from_morning_feedback(feedback: dict[str, object] | None) -> str | None:
    if not feedback:
        return None
    score = int(feedback.get("readiness_score") or 0)
    soreness = str(feedback.get("muscle_soreness") or "")
    mental = str(feedback.get("mental_state") or "")
    willingness = str(feedback.get("training_willingness") or "")
    penalty = 0
    if soreness == "obvious":
        penalty += 1
    if mental == "poor":
        penalty += 1
    if willingness == "rest":
        penalty += 1
    adjusted = score - penalty
    if adjusted <= 2:
        return "low"
    if adjusted == 3:
        return "medium"
    return "high"


def delayed_recovery_label(row: dict[str, object]) -> str | None:
    next_sleep = row.get("_next_sleep") or {}
    next_health = row.get("_next_health") or {}
    if not next_sleep and not next_health:
        return None

    bad_signals = 0
    next_sleep_score = float(next_sleep.get("sleep_score") or 0)
    if next_sleep_score and float(row.get("sleep_score") or 0) and next_sleep_score <= float(row.get("sleep_score") or 0) - 10:
        bad_signals += 1
    next_hrv = float(next_sleep.get("avg_hrv") or 0)
    if next_hrv and float(row.get("avg_hrv") or 0) and next_hrv <= float(row.get("avg_hrv") or 0) * 0.85:
        bad_signals += 1
    next_resting_hr = float(next_health.get("resting_heart_rate_bpm") or 0)
    if next_resting_hr and float(row.get("resting_hr") or 0) and next_resting_hr >= float(row.get("resting_hr") or 0) + 5:
        bad_signals += 1
    next_stress = float(next_health.get("avg_stress_level") or 0)
    if next_stress >= 50:
        bad_signals += 1
    next_body_drain = float(next_health.get("body_battery_drained") or 0)
    if next_body_drain >= 60:
        bad_signals += 1

    if bad_signals >= 2:
        return "low"
    if bad_signals == 1:
        return "medium"
    if next_sleep or next_health:
        return "high"
    return None


def perceived_effort_label(row: dict[str, object]) -> tuple[str, str]:
    effort = row.get("_perceived_effort_avg")
    if effort is not None:
        effort = float(effort)
        if effort <= 3:
            return "easy", "user_feedback"
        if effort <= 6:
            return "moderate", "user_feedback"
        return "hard", "user_feedback"
    if float(row.get("load_1d") or 0) >= 150 or float(row.get("hard_minutes_7d") or 0) >= 45:
        return "hard", "rule_pseudo"
    if float(row.get("load_1d") or 0) >= 50:
        return "moderate", "rule_pseudo"
    return "easy", "rule_pseudo"


def advice_feedback_label(row: dict[str, object]) -> tuple[str, str]:
    feedback_rows = row.get("_advice_feedback") or []
    for item in feedback_rows:
        feedback = str(item.get("feedback") or "")
        if feedback in {"helpful", "too_conservative", "too_aggressive", "not_matching_body"}:
            return feedback, "user_feedback"
    return "helpful", "rule_pseudo"


def load_action_from_feedback(row: dict[str, object], rule_load_action: str) -> tuple[str | None, str | None]:
    feedback_rows = row.get("_advice_feedback") or []
    for item in feedback_rows:
        feedback = str(item.get("feedback") or "")
        suggestion_type = str(item.get("suggestion_type") or "")
        if suggestion_type not in {"daily_brief", "training_load", "chat"}:
            continue
        if feedback == "too_aggressive":
            return "reduce", "user_feedback"
        if feedback == "too_conservative":
            return "progress", "user_feedback"
        if feedback == "not_matching_body":
            return "maintain", "user_feedback"
        if feedback == "helpful":
            return rule_load_action, "user_feedback"
    delayed = delayed_recovery_label(row)
    if delayed == "low":
        return "reduce", "delayed_objective"
    if delayed == "medium" and rule_load_action == "progress":
        return "maintain", "delayed_objective"
    return None, None


def build_label_bundle(row: dict[str, object]) -> dict[str, dict[str, object]]:
    rules = make_labels(row)
    bundle: dict[str, dict[str, object]] = {}

    readiness = readiness_from_morning_feedback(row.get("_morning_feedback"))
    readiness_source = "user_feedback" if readiness else None
    if not readiness:
        readiness = delayed_recovery_label(row)
        readiness_source = "delayed_objective" if readiness else None
    if not readiness:
        readiness = rules["readinessLevel"]
        readiness_source = "rule_pseudo"
    bundle["readinessLevel"] = {
        "label": readiness,
        "source": readiness_source,
        "weight": SOURCE_WEIGHTS[readiness_source],
    }

    load_action, load_source = load_action_from_feedback(row, rules["loadAction"])
    if not load_action:
        load_action = rules["loadAction"]
        load_source = "rule_pseudo"
    bundle["loadAction"] = {
        "label": load_action,
        "source": load_source,
        "weight": SOURCE_WEIGHTS[load_source],
    }

    effort_label, effort_source = perceived_effort_label(row)
    bundle["perceivedEffortLevel"] = {
        "label": effort_label,
        "source": effort_source,
        "weight": SOURCE_WEIGHTS[effort_source],
    }

    advice_label, advice_source = advice_feedback_label(row)
    bundle["adviceFeedbackClass"] = {
        "label": advice_label,
        "source": advice_source,
        "weight": SOURCE_WEIGHTS[advice_source],
    }

    bundle["primaryRecommendation"] = {
        "label": rules["primaryRecommendation"],
        "source": "rule_pseudo",
        "weight": SOURCE_WEIGHTS["rule_pseudo"],
    }
    return bundle


def label_source_summary(source_by_name: dict[str, list[str]]) -> dict[str, object]:
    summary = {}
    for target, sources in source_by_name.items():
        counts = Counter(sources)
        total = sum(counts.values())
        real_count = counts.get("user_feedback", 0) + counts.get("delayed_objective", 0)
        pseudo_count = counts.get("rule_pseudo", 0)
        summary[target] = {
            "counts": dict(counts),
            "realLabelRatio": real_count / total if total else 0,
            "pseudoLabelRatio": pseudo_count / total if total else 0,
            "dominantSource": counts.most_common(1)[0][0] if counts else "none",
        }
    return summary


def train_classifier(features: np.ndarray, labels: np.ndarray, sample_weights: np.ndarray):
    pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
            ("classifier", HistGradientBoostingClassifier(random_state=42, max_iter=160, learning_rate=0.08)),
        ]
    )
    report = {
        "testAccuracy": None,
        "baselineAccuracy": None,
        "confusionMatrix": None,
        "featureImportance": [],
        "classDistribution": {label: int(count) for label, count in zip(*np.unique(labels, return_counts=True))},
        "warnings": [],
        "sampleWeight": {
            "min": float(np.min(sample_weights)) if len(sample_weights) else None,
            "max": float(np.max(sample_weights)) if len(sample_weights) else None,
            "mean": float(np.mean(sample_weights)) if len(sample_weights) else None,
        },
    }
    majority_count = max(report["classDistribution"].values()) if report["classDistribution"] else 0
    report["baselineAccuracy"] = float(majority_count / len(labels)) if len(labels) else None
    if len(report["classDistribution"]) < 2:
        report["warnings"].append("only one class present; model cannot learn class boundaries")
    if report["classDistribution"] and min(report["classDistribution"].values()) < 5:
        report["warnings"].append("minority class has fewer than 5 samples")

    if len(set(labels)) > 1 and min(np.bincount(np.unique(labels, return_inverse=True)[1])) >= 2 and len(labels) >= 20:
        x_train, x_test, y_train, y_test, weights_train, weights_test = train_test_split(
            features,
            labels,
            sample_weights,
            test_size=0.2,
            random_state=42,
            stratify=labels,
        )
        pipeline.fit(x_train, y_train, classifier__sample_weight=weights_train)
        y_pred = pipeline.predict(x_test)
        report["testAccuracy"] = float(accuracy_score(y_test, y_pred))
        classes = list(pipeline.named_steps["classifier"].classes_)
        report["confusionMatrix"] = {
            "labels": classes,
            "matrix": confusion_matrix(y_test, y_pred, labels=classes).astype(int).tolist(),
        }
        try:
            importance = permutation_importance(
                pipeline,
                x_test,
                y_test,
                n_repeats=5,
                random_state=42,
                scoring="accuracy",
            )
            ranked = sorted(
                zip(FEATURE_NAMES, importance.importances_mean),
                key=lambda item: abs(float(item[1])),
                reverse=True,
            )
            report["featureImportance"] = [
                {"feature": name, "importance": float(value)}
                for name, value in ranked[:12]
            ]
        except Exception as error:
            report["warnings"].append(f"feature importance unavailable: {error}")
    else:
        pipeline.fit(features, labels, classifier__sample_weight=sample_weights)
    return pipeline, report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--env", default=str(Path(__file__).resolve().parents[1] / ".env"))
    parser.add_argument("--out", default=str(Path(__file__).resolve().parent / "models" / "coach_model.joblib"))
    args = parser.parse_args()

    connection = connect(Path(args.env))
    try:
        rows = build_daily_features(connection)
    finally:
        connection.close()

    rows = [row for row in rows if any(float(row[name] or 0) for name in FEATURE_NAMES)]
    if len(rows) < 20:
        raise SystemExit(f"Need at least 20 daily feature rows, got {len(rows)}")

    features = np.array([[float(row[name] or 0) for name in FEATURE_NAMES] for row in rows], dtype=float)
    labels_by_name: dict[str, list[str]] = defaultdict(list)
    weights_by_name: dict[str, list[float]] = defaultdict(list)
    sources_by_name: dict[str, list[str]] = defaultdict(list)
    for row in rows:
        label_bundle = build_label_bundle(row)
        for name, value in label_bundle.items():
            labels_by_name[name].append(str(value["label"]))
            weights_by_name[name].append(float(value["weight"]))
            sources_by_name[name].append(str(value["source"]))

    models = {}
    reports = {}
    classes = {}
    for name, labels in labels_by_name.items():
        model, report = train_classifier(features, np.array(labels), np.array(weights_by_name[name], dtype=float))
        models[name] = model
        reports[name] = report
        classes[name] = list(model.named_steps["classifier"].classes_)

    source_summary = label_source_summary(sources_by_name)
    aggregate_sources = Counter(source for sources in sources_by_name.values() for source in sources)
    aggregate_total = sum(aggregate_sources.values())
    real_total = aggregate_sources.get("user_feedback", 0) + aggregate_sources.get("delayed_objective", 0)
    pseudo_total = aggregate_sources.get("rule_pseudo", 0)
    perceived_effort_real = sources_by_name.get("perceivedEffortLevel", []).count("user_feedback")
    label_source_summary_payload = {
        "byTarget": source_summary,
        "aggregate": dict(aggregate_sources),
        "realLabelRatio": real_total / aggregate_total if aggregate_total else 0,
        "pseudoLabelRatio": pseudo_total / aggregate_total if aggregate_total else 0,
        "perceivedEffortCoverage": perceived_effort_real / len(rows) if rows else 0,
        "sampleWeights": SOURCE_WEIGHTS,
    }

    output_path = Path(args.out)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    bundle = {
        "modelVersion": MODEL_VERSION,
        "featureNames": FEATURE_NAMES,
        "models": models,
        "sampleCount": len(rows),
        "classes": classes,
        "testAccuracy": {name: report["testAccuracy"] for name, report in reports.items()},
        "labelSourceSummary": label_source_summary_payload,
    }
    joblib.dump(bundle, output_path)

    metadata = {key: value for key, value in bundle.items() if key != "models"}
    metadata_path = output_path.with_name("coach_model_metadata.json")
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    output_path.with_name("coach_feature_columns.json").write_text(json.dumps(FEATURE_NAMES, ensure_ascii=False, indent=2), encoding="utf-8")
    output_path.with_name("coach_training_report.json").write_text(json.dumps({
        "modelVersion": MODEL_VERSION,
        "sampleCount": len(rows),
        "features": FEATURE_SCHEMA,
        "labelSources": label_source_summary_payload,
        "sampleWeights": SOURCE_WEIGHTS,
        "realLabelRatio": label_source_summary_payload["realLabelRatio"],
        "pseudoLabelRatio": label_source_summary_payload["pseudoLabelRatio"],
        "perceivedEffortCoverage": label_source_summary_payload["perceivedEffortCoverage"],
        "reports": reports,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(metadata, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
