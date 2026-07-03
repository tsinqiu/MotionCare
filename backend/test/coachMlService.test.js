const test = require('node:test');
const assert = require('node:assert/strict');

let coachMlService;
let featureSchema;

try {
  coachMlService = require('../src/services/coachMlService');
} catch (_error) {
  coachMlService = null;
}

try {
  featureSchema = require('../ml/feature_schema.json');
} catch (_error) {
  featureSchema = null;
}

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

test('coach ML service loads with the shared feature schema', () => {
  assert.ok(coachMlService, 'coachMlService should be available in dev backend');
  assert.ok(featureSchema, 'feature_schema.json should be available in dev backend');
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

test('coach ML service builds the ml branch historical load features', () => {
  assert.ok(coachMlService, 'coachMlService should be available in dev backend');

  const features = coachMlService.buildFeatureSet(
    { trainingLoad: [{ atl: 720, ctl: 540, tsb: -180 }] },
    sampleContext()
  );
  const prediction = coachMlService.rulePrediction(features);

  assert.equal(features.long_run_ratio_28d, 0.5);
  assert.equal(features.hard_session_gap_days, 3);
  assert.equal(features.load_spike_ratio_28d, 0.563);
  assert.notEqual(features.session_load_percentile_90d, undefined);
  assert.notEqual(features.distance_percentile_90d, undefined);
  assert.notEqual(features.duration_percentile_90d, undefined);
  assert.match(prediction.perceivedEffortLevel, /^(easy|moderate|hard)$/);
});

test('coach ML service rules protect high heat and poor recovery when no coach model exists', async () => {
  assert.ok(coachMlService, 'coachMlService should be available in dev backend');

  const features = coachMlService.buildFeatureSet(
    { trainingLoad: [{ atl: 720, ctl: 540, tsb: -180 }] },
    sampleContext()
  );
  const prediction = await coachMlService.predict({
    overview: { trainingLoad: [{ atl: 720, ctl: 540, tsb: -180 }] },
    context: sampleContext({ userId: 7 })
  });

  assert.equal(features.weather_risk_level, 2);
  assert.equal(prediction.provider, 'rules');
  assert.equal(prediction.fallback, true);
  assert.equal(prediction.riskLevel, 'red');
  assert.equal(prediction.loadAction, 'rest');
  assert.equal(prediction.primaryRecommendation, 'rest');
  assert.ok(prediction.topFactors.includes('体感温度较高'));
});
