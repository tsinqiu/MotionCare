const fs = require('node:fs');
const { spawn } = require('node:child_process');
const path = require('node:path');
const config = require('../config');

const MODEL_VERSION = 'coach-v1';
const FEATURE_SCHEMA_PATH = path.resolve(__dirname, '..', '..', 'ml', 'feature_schema.json');
const FEATURE_SCHEMA = JSON.parse(fs.readFileSync(FEATURE_SCHEMA_PATH, 'utf8'));
const FEATURE_NAMES = FEATURE_SCHEMA.features.map((feature) => feature.name);
const predictionCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

const RISK_ORDER = { green: 0, yellow: 1, orange: 2, red: 3 };
const WEATHER_RISK_ORDER = { low: 0, medium: 1, high: 2 };
const DEFAULT_LABEL_SOURCE_SUMMARY = {
  aggregate: { rule_pseudo: 1 },
  realLabelRatio: 0,
  pseudoLabelRatio: 1,
  perceivedEffortCoverage: 0,
  sampleWeights: { user_feedback: 5, delayed_objective: 3, rule_pseudo: 1 }
};

function toNumber(value, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function nullableNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function round(value, digits = 1) {
  const numberValue = nullableNumber(value);
  if (numberValue === null) return null;
  const factor = 10 ** digits;
  return Math.round(numberValue * factor) / factor;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function dateOnly(value) {
  const text = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function daysBetween(latestDate, value) {
  const latest = dateOnly(latestDate);
  const current = dateOnly(value);
  if (!latest || !current) return null;
  const latestMs = Date.parse(`${latest}T00:00:00Z`);
  const currentMs = Date.parse(`${current}T00:00:00Z`);
  if (!Number.isFinite(latestMs) || !Number.isFinite(currentMs)) return null;
  return Math.floor((latestMs - currentMs) / 86400000);
}

function latestByDate(rows, dateKey) {
  return (rows || [])
    .filter(Boolean)
    .slice()
    .sort((a, b) => String(b[dateKey] || '').localeCompare(String(a[dateKey] || '')))[0] || null;
}

function valuesInWindow(rows, latestDate, dateKey, days) {
  return (rows || []).filter((row) => {
    const diff = daysBetween(latestDate, row?.[dateKey]);
    return diff !== null && diff >= 0 && diff < days;
  });
}

function sumBy(rows, mapper) {
  return rows.reduce((sum, row) => sum + toNumber(mapper(row), 0), 0);
}

function avgBy(rows, mapper) {
  const values = rows.map(mapper).map(nullableNumber).filter((value) => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function coverage(rows, latestDate, dateKey, days, predicate = () => true) {
  const coveredDays = new Set(
    valuesInWindow(rows, latestDate, dateKey, days)
      .filter(predicate)
      .map((row) => dateOnly(row?.[dateKey]))
      .filter(Boolean)
  );
  return round(coveredDays.size / days, 3) || 0;
}

function buildDataCompleteness(context = {}) {
  const latestDate = context.latestDate || new Date().toISOString().slice(0, 10);
  const activities = context.activities || [];
  const sleepRows = context.sleepRows || [];
  const trainingRows = context.trainingRows || [];
  const sleepCoverage14d = coverage(sleepRows, latestDate, 'sleepDate', 14);
  const weatherCoverage14d = coverage(activities, latestDate, 'localDate', 14, (activity) =>
    activity.weatherCondition || activity.temperatureC !== null || activity.humidityPercent !== null || activity.feelsLikeC !== null
  );
  const hrvCoverage14d = coverage(sleepRows, latestDate, 'sleepDate', 14, (row) => nullableNumber(row.avgHrv) !== null);
  const trainingStatusCoverage14d = coverage(trainingRows, latestDate, 'snapshotDate', 14);
  const score = round(((sleepCoverage14d + weatherCoverage14d + hrvCoverage14d + trainingStatusCoverage14d) / 4) * 100, 1) || 0;

  return {
    sleepCoverage14d,
    weatherCoverage14d,
    hrvCoverage14d,
    trainingStatusCoverage14d,
    score
  };
}

function weatherConditionRisk(condition) {
  const text = String(condition || '').toLowerCase();
  if (/雷|暴|storm|thunder|snow|冰|雪/.test(text)) return 2;
  if (/雨|rain|shower|wind|风/.test(text)) return 1;
  return 0;
}

function assessWeather(features) {
  const feelsLike = nullableNumber(features.feels_like_c);
  const humidity = nullableNumber(features.humidity_percent);
  const conditionRisk = toNumber(features.weather_condition_risk, 0);
  let score = conditionRisk;
  const reasons = [];

  if (feelsLike !== null && feelsLike >= 35) {
    score += 2;
    reasons.push('体感温度较高');
  } else if (feelsLike !== null && feelsLike >= 30 && humidity !== null && humidity >= 70) {
    score += 1;
    reasons.push('高温高湿');
  }

  if (conditionRisk >= 2) {
    reasons.push('雷雨或恶劣天气');
  } else if (conditionRisk >= 1) {
    reasons.push('降雨或大风');
  }

  const level = score >= 2 ? 'high' : score >= 1 ? 'medium' : 'low';
  return { level, score, reasons };
}

function buildFeatureSet(overview = {}, context = {}) {
  const latestDate = context.latestDate || new Date().toISOString().slice(0, 10);
  const activities = context.activities || [];
  const sleepRows = context.sleepRows || [];
  const healthRows = context.healthRows || [];
  const trainingRows = context.trainingRows || [];
  const latestSleep = latestByDate(sleepRows, 'sleepDate') || {};
  const latestHealth = latestByDate(healthRows, 'summaryDate') || {};
  const latestTraining = latestByDate(trainingRows, 'snapshotDate') || {};
  const latestWeather = context.latestWeather || activities.find((activity) =>
    activity.weatherCondition || activity.temperatureC !== null || activity.humidityPercent !== null || activity.feelsLikeC !== null
  ) || {};
  const latestLoad = overview.trainingLoad?.at(-1) || {};
  const features = {};

  for (const days of [1, 3, 7, 14, 28]) {
    const rows = valuesInWindow(activities, latestDate, 'localDate', days);
    features[`distance_${days}d`] = round(sumBy(rows, (row) => row.distanceM) / 1000, 3) || 0;
    features[`duration_${days}d`] = round(sumBy(rows, (row) => row.durationS) / 3600, 3) || 0;
    features[`load_${days}d`] = round(sumBy(rows, (row) => row.activityTrainingLoad), 2) || 0;
  }

  const rows7d = valuesInWindow(activities, latestDate, 'localDate', 7);
  const activeDays7d = new Set(rows7d.map((row) => dateOnly(row.localDate)).filter(Boolean)).size;
  features.hard_minutes_7d = round(sumBy(rows7d.filter((row) =>
    toNumber(row.activityTrainingLoad, 0) >= 120 || toNumber(row.avgHeartRateBpm, 0) >= 155
  ), (row) => row.durationS) / 60, 1) || 0;
  features.rest_days_7d = clamp(7 - activeDays7d, 0, 7);

  features.atl = round(latestLoad.atl ?? latestTraining.acuteTrainingLoad, 2) || 0;
  features.ctl = round(latestLoad.ctl ?? latestTraining.chronicTrainingLoad, 2) || 0;
  features.tsb = round(latestLoad.tsb ?? (features.ctl - features.atl), 2) || 0;
  features.acwr_7_28 = round(
    latestTraining.acuteChronicWorkloadRatio
      ?? (features.load_28d > 0 ? features.load_7d / (features.load_28d / 4) : 0),
    3
  ) || 0;

  features.sleep_score = round(latestSleep.sleepScore, 1) || 0;
  features.sleep_duration_h = round(toNumber(latestSleep.durationS, 0) / 3600, 2) || 0;
  features.deep_sleep_minutes = round(toNumber(latestSleep.deepSleepS, 0) / 60, 1) || 0;
  features.rem_sleep_minutes = round(toNumber(latestSleep.remSleepS, 0) / 60, 1) || 0;
  const sleep3d = valuesInWindow(sleepRows, latestDate, 'sleepDate', 3);
  features.sleep_debt_3d = round(sumBy(sleep3d, (row) => Math.max(0, 7 - toNumber(row.durationS, 0) / 3600)), 2) || 0;
  features.avg_hrv = round(latestSleep.avgHrv, 1) || 0;
  const hrvBaseline = avgBy(sleepRows, (row) => row.avgHrv);
  features.hrv_delta_pct = hrvBaseline > 0 ? round(((features.avg_hrv - hrvBaseline) / hrvBaseline) * 100, 2) : 0;

  features.resting_hr = round(latestHealth.restingHeartRateBpm, 1) || 0;
  const restingHrBaseline = avgBy(healthRows, (row) => row.restingHeartRateBpm);
  features.resting_hr_delta = restingHrBaseline > 0 ? round(features.resting_hr - restingHrBaseline, 2) : 0;
  features.avg_stress = round(latestHealth.avgStressLevel ?? latestSleep.avgSleepStress, 1) || 0;
  features.body_battery_morning = round(latestHealth.maxBodyBattery, 1) || 0;
  features.body_battery_drained = round(latestHealth.bodyBatteryDrained, 1) || 0;

  features.temperature_c = round(latestWeather.temperatureC, 1) || 0;
  features.humidity_percent = round(latestWeather.humidityPercent, 1) || 0;
  features.feels_like_c = round(latestWeather.feelsLikeC, 1) || features.temperature_c;
  features.weather_condition_risk = weatherConditionRisk(latestWeather.weatherCondition);
  const weather = assessWeather(features);
  features.weather_risk_level = WEATHER_RISK_ORDER[weather.level];
  features.heat_humidity_flag = features.feels_like_c >= 30 && features.humidity_percent >= 70 ? 1 : 0;
  const completeness = buildDataCompleteness(context);
  features.sleep_coverage_14d = completeness.sleepCoverage14d;
  features.weather_coverage_14d = completeness.weatherCoverage14d;
  features.hrv_coverage_14d = completeness.hrvCoverage14d;
  features.training_status_coverage_14d = completeness.trainingStatusCoverage14d;
  features.data_completeness_score = completeness.score;

  return FEATURE_SCHEMA.features.reduce((result, feature) => {
    result[feature.name] = toNumber(features[feature.name], feature.default || 0);
    return result;
  }, {});
}

function riskMax(left, right) {
  return RISK_ORDER[right] > RISK_ORDER[left] ? right : left;
}

function rulePrediction(features) {
  const weather = assessWeather(features);
  const reasons = [];
  let score = 0;
  const dataCompleteness = {
    sleepCoverage14d: round(features.sleep_coverage_14d, 3) || 0,
    weatherCoverage14d: round(features.weather_coverage_14d, 3) || 0,
    hrvCoverage14d: round(features.hrv_coverage_14d, 3) || 0,
    trainingStatusCoverage14d: round(features.training_status_coverage_14d, 3) || 0,
    score: round(features.data_completeness_score, 1) || 0
  };

  if (features.tsb < -25) {
    score += 3;
    reasons.push('TSB 显著偏低');
  } else if (features.tsb < -10) {
    score += 1;
    reasons.push('TSB 偏低');
  }

  if (features.acwr_7_28 >= 1.5) {
    score += 2;
    reasons.push('近期负荷增长过快');
  } else if (features.acwr_7_28 >= 1.3) {
    score += 1;
    reasons.push('近期负荷上升');
  }

  if (features.sleep_score > 0 && features.sleep_score < 60) {
    score += 2;
    reasons.push('睡眠评分偏低');
  } else if (features.sleep_duration_h > 0 && features.sleep_duration_h < 6) {
    score += 1;
    reasons.push('睡眠时长不足');
  }

  if (features.hrv_delta_pct <= -15) {
    score += 1;
    reasons.push('HRV 低于近期基线');
  }
  if (features.resting_hr_delta >= 5) {
    score += 1;
    reasons.push('静息心率高于近期基线');
  }
  if (features.avg_stress >= 50) {
    score += 1;
    reasons.push('压力水平偏高');
  }
  if (features.body_battery_drained >= 60) {
    score += 1;
    reasons.push('Body Battery 消耗较大');
  }

  score += weather.score;
  reasons.push(...weather.reasons);

  let riskLevel = score >= 6 ? 'red' : score >= 3 ? 'orange' : score >= 1 ? 'yellow' : 'green';
  const readinessScore = clamp(Math.round(100 - score * 12 - Math.min(features.sleep_debt_3d * 4, 16)), 0, 100);
  const readinessLevel = readinessScore >= 75 ? 'high' : readinessScore >= 55 ? 'medium' : 'low';

  let loadAction = 'maintain';
  if (riskLevel === 'red') loadAction = 'rest';
  else if (riskLevel === 'orange') loadAction = 'reduce';
  else if (features.tsb > 8 && features.acwr_7_28 <= 1.2 && weather.level === 'low') loadAction = 'progress';

  if (weather.level === 'high' && loadAction === 'progress') loadAction = 'maintain';
  if (weather.level === 'high' && loadAction === 'maintain') loadAction = 'reduce';

  const trainingModifier = weather.level === 'high'
    ? (features.weather_condition_risk >= 1 ? 'indoor_preferred' : 'reduce_intensity')
    : riskLevel === 'red'
      ? 'avoid_hard_session'
      : 'normal';
  const primaryRecommendation = loadAction === 'rest'
    ? 'rest'
    : features.sleep_score > 0 && features.sleep_score < 60
      ? 'sleep_focus'
      : weather.level === 'high'
        ? 'hydration'
        : loadAction === 'progress'
          ? 'normal_training'
          : 'easy_aerobic';
  const recommendationTypes = [
    primaryRecommendation,
    weather.level === 'high' ? 'hydration' : null,
    features.sleep_score > 0 && features.sleep_score < 65 ? 'sleep_focus' : null,
    loadAction === 'reduce' ? 'mobility' : null
  ].filter(Boolean);

  riskLevel = weather.level === 'high' ? riskMax(riskLevel, 'yellow') : riskLevel;

  const topFactors = [
    ...(weather.level === 'high' ? weather.reasons : []),
    ...reasons
  ];

  return {
    readinessScore,
    readinessLevel,
    recoveryRisk: readinessLevel === 'low' ? 'high' : readinessLevel === 'medium' ? 'medium' : 'low',
    riskLevel,
    loadAction,
    trainingModifier,
    weatherRisk: weather.level,
    primaryRecommendation,
    recommendationTypes: [...new Set(recommendationTypes)],
    topFactors: [...new Set(topFactors)].slice(0, 5),
    dataCompleteness,
    confidence: 0.62,
    modelVersion: MODEL_VERSION,
    provider: 'rules',
    fallback: true,
    rulesBaseline: {
      readinessLevel,
      riskLevel,
      loadAction,
      weatherRisk: weather.level,
      primaryRecommendation
    },
    learnedSignals: null,
    labelSourceSummary: DEFAULT_LABEL_SOURCE_SUMMARY
  };
}

function normalizeModelPrediction(rawPrediction, fallbackPrediction) {
  const prediction = rawPrediction && typeof rawPrediction === 'object' ? rawPrediction : {};
  const allowed = {
    readinessLevel: ['low', 'medium', 'high'],
    recoveryRisk: ['low', 'medium', 'high'],
    riskLevel: ['green', 'yellow', 'orange', 'red'],
    loadAction: ['rest', 'reduce', 'maintain', 'progress'],
    trainingModifier: ['normal', 'reduce_intensity', 'indoor_preferred', 'avoid_hard_session'],
    weatherRisk: ['low', 'medium', 'high'],
    primaryRecommendation: ['rest', 'easy_aerobic', 'normal_training', 'interval', 'strength', 'mobility', 'sleep_focus', 'hydration']
  };
  const learnedSignals = {
    readinessLevel: prediction.readinessLevel || null,
    loadAction: prediction.loadAction || null,
    primaryRecommendation: prediction.primaryRecommendation || null,
    perceivedEffortLevel: prediction.perceivedEffortLevel || null,
    adviceFeedbackClass: prediction.adviceFeedbackClass || null,
    confidence: round(prediction.confidence, 4) ?? null
  };

  const merged = {
    ...fallbackPrediction,
    readinessScore: clamp(Math.round(toNumber(prediction.readinessScore, fallbackPrediction.readinessScore)), 0, 100),
    readinessLevel: allowed.readinessLevel.includes(prediction.readinessLevel) ? prediction.readinessLevel : fallbackPrediction.readinessLevel,
    recoveryRisk: allowed.recoveryRisk.includes(prediction.recoveryRisk) ? prediction.recoveryRisk : fallbackPrediction.recoveryRisk,
    riskLevel: allowed.riskLevel.includes(prediction.riskLevel)
      ? riskMax(fallbackPrediction.riskLevel, prediction.riskLevel)
      : fallbackPrediction.riskLevel,
    loadAction: allowed.loadAction.includes(prediction.loadAction) ? prediction.loadAction : fallbackPrediction.loadAction,
    trainingModifier: allowed.trainingModifier.includes(prediction.trainingModifier) ? prediction.trainingModifier : fallbackPrediction.trainingModifier,
    weatherRisk: allowed.weatherRisk.includes(prediction.weatherRisk) ? prediction.weatherRisk : fallbackPrediction.weatherRisk,
    primaryRecommendation: allowed.primaryRecommendation.includes(prediction.primaryRecommendation)
      ? prediction.primaryRecommendation
      : fallbackPrediction.primaryRecommendation,
    recommendationTypes: Array.isArray(prediction.recommendationTypes) && prediction.recommendationTypes.length
      ? prediction.recommendationTypes.filter((item) => allowed.primaryRecommendation.includes(item)).slice(0, 5)
      : fallbackPrediction.recommendationTypes,
    topFactors: fallbackPrediction.topFactors,
    dataCompleteness: fallbackPrediction.dataCompleteness,
    confidence: round(prediction.confidence, 4) ?? fallbackPrediction.confidence,
    modelVersion: prediction.modelVersion || MODEL_VERSION,
    provider: 'local_model',
    fallback: false,
    perceivedEffortLevel: prediction.perceivedEffortLevel || null,
    adviceFeedbackClass: prediction.adviceFeedbackClass || null,
    rulesBaseline: fallbackPrediction.rulesBaseline,
    learnedSignals,
    labelSourceSummary: prediction.labelSourceSummary || fallbackPrediction.labelSourceSummary || DEFAULT_LABEL_SOURCE_SUMMARY
  };

  if (fallbackPrediction.riskLevel === 'red') {
    merged.loadAction = 'rest';
    merged.primaryRecommendation = 'rest';
    merged.recommendationTypes = ['rest', 'sleep_focus'];
    merged.trainingModifier = 'avoid_hard_session';
  } else if (fallbackPrediction.riskLevel === 'orange' && ['maintain', 'progress'].includes(merged.loadAction)) {
    merged.loadAction = 'reduce';
    merged.primaryRecommendation = merged.primaryRecommendation === 'normal_training' ? 'easy_aerobic' : merged.primaryRecommendation;
    merged.recommendationTypes = [...new Set(['easy_aerobic', 'mobility', ...merged.recommendationTypes])].slice(0, 5);
  }

  if (fallbackPrediction.weatherRisk === 'high') {
    merged.weatherRisk = 'high';
    if (merged.loadAction === 'progress') merged.loadAction = 'maintain';
    if (merged.trainingModifier === 'normal') merged.trainingModifier = 'reduce_intensity';
    if (!merged.recommendationTypes.includes('hydration')) {
      merged.recommendationTypes = [...merged.recommendationTypes, 'hydration'].slice(0, 5);
    }
  }

  return merged;
}

function runPythonPrediction(features) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(config.ml.coachModelPath) || !fs.existsSync(config.ml.coachPredictScriptPath)) {
      reject(new Error('coach model is not available'));
      return;
    }

    const child = spawn(
      config.ml.pythonPath,
      [config.ml.coachPredictScriptPath, '--model', config.ml.coachModelPath],
      {
        cwd: process.cwd(),
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        windowsHide: true
      }
    );

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('coach prediction timed out'));
    }, config.ml.timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.trim() || 'coach prediction failed'));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(error);
      }
    });

    child.stdin.end(JSON.stringify(features));
  });
}

function modelCacheKey(context = {}) {
  let modelMtime = 'missing';
  try {
    modelMtime = fs.statSync(config.ml.coachModelPath).mtimeMs;
  } catch (_error) {
    modelMtime = 'missing';
  }
  return [
    context.userId || 'anonymous',
    context.latestDate || 'unknown',
    modelMtime
  ].join(':');
}

function getCachedPrediction(cacheKey) {
  const cached = predictionCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() - cached.createdAt > CACHE_TTL_MS) {
    predictionCache.delete(cacheKey);
    return null;
  }
  return cached.value;
}

function setCachedPrediction(cacheKey, value) {
  predictionCache.set(cacheKey, { createdAt: Date.now(), value });
  if (predictionCache.size > 100) {
    const firstKey = predictionCache.keys().next().value;
    predictionCache.delete(firstKey);
  }
}

async function predict({ overview = {}, context = {} } = {}) {
  const cacheKey = modelCacheKey(context);
  const cached = getCachedPrediction(cacheKey);
  if (cached) return cached;

  const features = buildFeatureSet(overview, context);
  const fallbackPrediction = rulePrediction(features);
  let prediction;

  try {
    const modelPrediction = await runPythonPrediction(features);
    prediction = normalizeModelPrediction(modelPrediction, fallbackPrediction);
  } catch (_error) {
    prediction = fallbackPrediction;
  }

  setCachedPrediction(cacheKey, prediction);
  return prediction;
}

function summarizePrediction(prediction) {
  if (!prediction) return JSON.stringify({ available: false });
  return JSON.stringify({
    available: true,
    readinessScore: prediction.readinessScore,
    readinessLevel: prediction.readinessLevel,
    recoveryRisk: prediction.recoveryRisk,
    riskLevel: prediction.riskLevel,
    loadAction: prediction.loadAction,
    trainingModifier: prediction.trainingModifier,
    weatherRisk: prediction.weatherRisk,
    primaryRecommendation: prediction.primaryRecommendation,
    recommendationTypes: prediction.recommendationTypes || [],
    topFactors: prediction.topFactors || [],
    confidence: prediction.confidence,
    modelVersion: prediction.modelVersion,
    provider: prediction.provider,
    fallback: prediction.fallback,
    dataCompleteness: prediction.dataCompleteness,
    rulesBaseline: prediction.rulesBaseline || null,
    learnedSignals: prediction.learnedSignals || null,
    labelSourceSummary: prediction.labelSourceSummary || DEFAULT_LABEL_SOURCE_SUMMARY
  });
}

async function getHealth() {
  const modelAvailable = fs.existsSync(config.ml.coachModelPath);
  const scriptAvailable = fs.existsSync(config.ml.coachPredictScriptPath);
  const metadataPath = path.join(path.dirname(config.ml.coachModelPath), 'coach_model_metadata.json');
  let metadata = {};
  try {
    metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  } catch (_error) {
    metadata = {};
  }
  let trainedAt = null;
  try {
    trainedAt = fs.statSync(config.ml.coachModelPath).mtime.toISOString();
  } catch (_error) {
    trainedAt = null;
  }

  return {
    status: modelAvailable && scriptAvailable ? 'ok' : 'fallback',
    modelAvailable,
    scriptAvailable,
    modelVersion: metadata.modelVersion || MODEL_VERSION,
    sampleCount: metadata.sampleCount || 0,
    labelSourceSummary: metadata.labelSourceSummary || DEFAULT_LABEL_SOURCE_SUMMARY,
    trainedAt,
    fallbackRules: true,
    featureCount: FEATURE_NAMES.length,
    cacheSize: predictionCache.size
  };
}

module.exports = {
  MODEL_VERSION,
  FEATURE_NAMES,
  buildFeatureSet,
  rulePrediction,
  predict,
  summarizePrediction,
  getHealth,
  __private: {
    assessWeather,
    buildDataCompleteness,
    normalizeModelPrediction
  }
};
