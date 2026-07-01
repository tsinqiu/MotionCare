const test = require('node:test');
const assert = require('node:assert/strict');

const config = require('../src/config');
const coachMlService = require('../src/services/coachMlService');
const featureSchema = require('../ml/feature_schema.json');

function sampleContext(overrides = {}) {
  return {
    latestDate: '2026-06-29',
    activities: [
      {
        localDate: '2026-06-29',
        distanceM: 5000,
        durationS: 1800,
        avgHeartRateBpm: 145,
        activityTrainingLoad: 90,
        weatherCondition: '多云',
        temperatureC: 31,
        humidityPercent: 75,
        feelsLikeC: 35
      },
      {
        localDate: '2026-06-26',
        distanceM: 10000,
        durationS: 3600,
        avgHeartRateBpm: 162,
        activityTrainingLoad: 160
      }
    ],
    sleepRows: [{
      sleepDate: '2026-06-29',
      durationS: 19800,
      deepSleepS: 3600,
      remSleepS: 4200,
      sleepScore: 55,
      avgHrv: 38,
      avgSleepStress: 35
    }],
    healthRows: [{
      summaryDate: '2026-06-29',
      avgStressLevel: 55,
      restingHeartRateBpm: 60,
      maxBodyBattery: 70,
      bodyBatteryDrained: 65
    }],
    trainingRows: [{
      snapshotDate: '2026-06-29',
      acuteTrainingLoad: 720,
      chronicTrainingLoad: 540,
      acuteChronicWorkloadRatio: 1.45
    }],
    latestWeather: {
      weatherCondition: '多云',
      temperatureC: 31,
      humidityPercent: 75,
      feelsLikeC: 35
    },
    ...overrides
  };
}

test('coachMlService builds daily rolling features from RAG context', () => {
  const features = coachMlService.buildFeatureSet(
    { trainingLoad: [{ atl: 720, ctl: 540, tsb: -180 }] },
    sampleContext()
  );

  assert.equal(features.distance_1d, 5);
  assert.equal(features.distance_7d, 15);
  assert.equal(features.load_7d, 250);
  assert.equal(features.hard_minutes_7d, 60);
  assert.equal(features.sleep_score, 55);
  assert.equal(features.weather_risk_level, 2);
  assert.equal(features.heat_humidity_flag, 1);
  assert.equal(features.sleep_coverage_14d, 0.071);
  assert.equal(features.weather_coverage_14d, 0.143);
  assert.equal(features.hrv_coverage_14d, 0.071);
  assert.equal(features.training_status_coverage_14d, 0.071);
});

test('coachMlService feature names match shared feature schema', () => {
  assert.deepEqual(
    coachMlService.FEATURE_NAMES,
    featureSchema.features.map((feature) => feature.name)
  );
});

test('coachMlService rules downgrade high heat and poor recovery', () => {
  const features = coachMlService.buildFeatureSet(
    { trainingLoad: [{ atl: 720, ctl: 540, tsb: -180 }] },
    sampleContext()
  );
  const prediction = coachMlService.rulePrediction(features);

  assert.equal(prediction.riskLevel, 'red');
  assert.equal(prediction.loadAction, 'rest');
  assert.equal(prediction.weatherRisk, 'high');
  assert.equal(prediction.primaryRecommendation, 'rest');
  assert.ok(prediction.topFactors.includes('体感温度较高'));
  assert.equal(prediction.dataCompleteness.score, 8.9);
});

test('coachMlService predict falls back to rules when local model is missing', async () => {
  const originalCoachModelPath = config.ml.coachModelPath;
  config.ml.coachModelPath = '__missing_coach_model__.joblib';
  let prediction;
  try {
    prediction = await coachMlService.predict({
      overview: { trainingLoad: [{ atl: 720, ctl: 540, tsb: -180 }] },
      context: sampleContext()
    });
  } finally {
    config.ml.coachModelPath = originalCoachModelPath;
  }

  assert.equal(prediction.provider, 'rules');
  assert.equal(prediction.fallback, true);
  assert.equal(prediction.modelVersion, 'coach-v1');
});

test('coachMlService does not let local model relax red rule risk', () => {
  const fallback = {
    readinessScore: 20,
    readinessLevel: 'low',
    recoveryRisk: 'high',
    riskLevel: 'red',
    loadAction: 'rest',
    trainingModifier: 'avoid_hard_session',
    weatherRisk: 'high',
    primaryRecommendation: 'rest',
    recommendationTypes: ['rest'],
    topFactors: ['TSB 显著偏低'],
    confidence: 0.62,
    modelVersion: 'coach-v1',
    provider: 'rules',
    fallback: true
  };
  const prediction = coachMlService.__private.normalizeModelPrediction({
    readinessScore: 80,
    readinessLevel: 'high',
    recoveryRisk: 'low',
    riskLevel: 'green',
    loadAction: 'progress',
    trainingModifier: 'normal',
    weatherRisk: 'low',
    primaryRecommendation: 'normal_training',
    recommendationTypes: ['normal_training'],
    confidence: 0.9
  }, fallback);

  assert.equal(prediction.riskLevel, 'red');
  assert.equal(prediction.loadAction, 'rest');
  assert.equal(prediction.primaryRecommendation, 'rest');
  assert.equal(prediction.trainingModifier, 'avoid_hard_session');
});

test('coachMlService health reports coach model governance fields', async () => {
  const health = await coachMlService.getHealth();

  assert.equal(typeof health.modelAvailable, 'boolean');
  assert.equal(typeof health.scriptAvailable, 'boolean');
  assert.equal(health.modelVersion, 'coach-v1');
  assert.equal(health.featureCount, coachMlService.FEATURE_NAMES.length);
  assert.equal(health.fallbackRules, true);
});
