from __future__ import annotations

import argparse
import json
import pickle
import sys
from pathlib import Path

import joblib
import numpy as np


SCHEMA_PATH = Path(__file__).resolve().parent / "feature_schema.json"
FEATURE_SCHEMA = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
DEFAULT_RECOMMENDATION_TYPES = {
    "rest": ["rest", "sleep_focus"],
    "reduce": ["easy_aerobic", "mobility"],
    "maintain": ["easy_aerobic", "normal_training"],
    "progress": ["normal_training"],
}
RISK_FROM_ACTION = {
    "rest": "red",
    "reduce": "orange",
    "maintain": "yellow",
    "progress": "green",
}


def load_payload() -> dict[str, object]:
    raw = sys.stdin.read() or "{}"
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as error:
        raise ValueError(f"invalid JSON payload: {error.msg}") from error
    if not isinstance(payload, dict):
        raise ValueError("prediction payload must be a JSON object")
    return payload


def numeric_feature(payload: dict[str, object], name: str) -> float:
    if name not in payload:
        raise ValueError(f"missing required feature: {name}")
    try:
        value = float(payload[name])
    except (TypeError, ValueError) as error:
        raise ValueError(f"invalid numeric feature: {name}") from error
    if not np.isfinite(value):
        raise ValueError(f"invalid numeric feature: {name}")
    return value


def predict_label(model, values: np.ndarray) -> tuple[str, float]:
    label = str(model.predict(values)[0])
    confidence = 0.6
    if hasattr(model, "predict_proba"):
        probabilities = model.predict_proba(values)[0]
        classes = list(model.classes_)
        if label in classes:
            confidence = float(probabilities[classes.index(label)])
    return label, confidence


def readiness_score(readiness_level: str, load_action: str, weather_risk: str) -> int:
    base = {"high": 82, "medium": 64, "low": 42}.get(readiness_level, 60)
    if load_action == "rest":
        base -= 8
    elif load_action == "progress":
        base += 5
    if weather_risk == "high":
        base -= 8
    elif weather_risk == "medium":
        base -= 4
    return max(0, min(100, int(round(base))))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    args = parser.parse_args()

    try:
        payload = load_payload()
        bundle = joblib.load(Path(args.model))
        feature_names = bundle.get("featureNames") or [item["name"] for item in FEATURE_SCHEMA["features"]]
        values = np.array([[numeric_feature(payload, name) for name in feature_names]], dtype=float)
        models = bundle["models"]

        readiness_level, readiness_confidence = predict_label(models["readinessLevel"], values)
        load_action, load_confidence = predict_label(models["loadAction"], values)
        primary_recommendation, recommendation_confidence = predict_label(models["primaryRecommendation"], values)
        weather_level = "high" if float(payload.get("weather_risk_level", 0)) >= 2 else "medium" if float(payload.get("weather_risk_level", 0)) >= 1 else "low"
    except (
        KeyError,
        ValueError,
        TypeError,
        AttributeError,
        FileNotFoundError,
        OSError,
        pickle.UnpicklingError,
    ) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1) from error
    except Exception as error:
        print(f"unexpected coach prediction error: {error}", file=sys.stderr)
        raise SystemExit(1) from error

    risk_level = RISK_FROM_ACTION.get(load_action, "yellow")
    result = {
        "readinessScore": readiness_score(readiness_level, load_action, weather_level),
        "readinessLevel": readiness_level,
        "recoveryRisk": "high" if readiness_level == "low" else "medium" if readiness_level == "medium" else "low",
        "riskLevel": risk_level,
        "loadAction": load_action,
        "trainingModifier": "reduce_intensity" if weather_level == "high" else "normal",
        "weatherRisk": weather_level,
        "primaryRecommendation": primary_recommendation,
        "recommendationTypes": DEFAULT_RECOMMENDATION_TYPES.get(load_action, [primary_recommendation]),
        "dataCompleteness": {
            "sleepCoverage14d": round(float(payload.get("sleep_coverage_14d", 0)), 3),
            "weatherCoverage14d": round(float(payload.get("weather_coverage_14d", 0)), 3),
            "hrvCoverage14d": round(float(payload.get("hrv_coverage_14d", 0)), 3),
            "trainingStatusCoverage14d": round(float(payload.get("training_status_coverage_14d", 0)), 3),
            "score": round(float(payload.get("data_completeness_score", 0)), 1),
        },
        "confidence": round(float(np.mean([readiness_confidence, load_confidence, recommendation_confidence])), 4),
        "modelVersion": bundle.get("modelVersion", "coach-v1"),
    }
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
