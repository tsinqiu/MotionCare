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
    signals: {
      activityCount28d: 2,
      healthDays14d: 1,
      sleepDays14d: 1,
      trainingDays14d: 1,
      weatherSamples28d: 1,
      feedbackCount: 0
    },
    ...overrides
  };
}

test('coach ML service loads with the shared feature schema', () => {
  assert.deepEqual(
    coachMlService.FEATURE_NAMES,
    featureSchema.features.map((feature) => feature.name)
  );
  assert.deepEqual(
    [
      'session_load_percentile_90d',
      'distance_percentile_90d',
      'duration_percentile_90d',
      'long_run_ratio_28d',
      'hard_session_gap_days',
      'load_spike_ratio_28d'
    ].filter((name) => !coachMlService.FEATURE_NAMES.includes(name)),
    []
  );
});

test('coach ML service builds personal percentile and rolling load features', () => {
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
  assert.equal(features.session_load_percentile_90d, 0);
  assert.equal(features.distance_percentile_90d, 0);
  assert.equal(features.duration_percentile_90d, 0);
  assert.equal(features.long_run_ratio_28d, 0.5);
  assert.equal(features.hard_session_gap_days, 3);
  assert.equal(features.load_spike_ratio_28d, 0.563);
});

test('coach ML service classifies perceived effort by personal percentile instead of fixed load', () => {
  assert.equal(
    coachMlService.__private.classifyRelativePerceivedEffort({
      load_1d: 150,
      hard_minutes_7d: 60,
      session_load_percentile_90d: 70
    }),
    'moderate'
  );
  assert.equal(
    coachMlService.__private.classifyRelativePerceivedEffort({
      load_1d: 150,
      hard_minutes_7d: 60,
      session_load_percentile_90d: 92
    }),
    'hard'
  );
});

test('coach ML service rules protect high heat and poor recovery', () => {
  const features = coachMlService.buildFeatureSet(
    { trainingLoad: [{ atl: 720, ctl: 540, tsb: -180 }] },
    sampleContext()
  );
  const prediction = coachMlService.rulePrediction(features);

  assert.equal(features.weather_risk_level, 2);
  assert.equal(prediction.provider, 'rules');
  assert.equal(prediction.fallback, true);
  assert.equal(prediction.riskLevel, 'red');
  assert.equal(prediction.loadAction, 'rest');
  assert.equal(prediction.primaryRecommendation, 'rest');
  assert.ok(prediction.topFactors.includes('体感温度较高'));
});

test('coach ML service predict falls back to rules when local model is missing', async () => {
  const originalCoachModelPath = config.ml.coachModelPath;
  config.ml.coachModelPath = '__missing_coach_model__.joblib';
  let prediction;
  try {
    prediction = await coachMlService.predict({
      overview: { trainingLoad: [{ atl: 720, ctl: 540, tsb: -180 }] },
      context: sampleContext({ userId: 707 })
    });
  } finally {
    config.ml.coachModelPath = originalCoachModelPath;
  }

  assert.equal(prediction.provider, 'rules');
  assert.equal(prediction.fallback, true);
  assert.equal(prediction.riskLevel, 'red');
  assert.equal(prediction.loadAction, 'rest');
});

test('coach ML service does not let local model relax red rule risk', () => {
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

test('coach ML service cache key changes when data signals change', () => {
  const base = sampleContext();
  const changed = sampleContext({
    signals: {
      ...base.signals,
      feedbackCount: 2
    }
  });

  const firstKey = coachMlService.__private.modelCacheKey(base);
  const secondKey = coachMlService.__private.modelCacheKey(changed);

  assert.notEqual(firstKey, secondKey);
});
