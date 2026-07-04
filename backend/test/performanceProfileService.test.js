const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildDataQuality,
  buildFivePower,
  buildTrainingIndex,
  scoreRunningPower
} = require('../src/services/performanceProfileService');

test('performance profile maps coach readiness into training index labels', () => {
  const low = buildTrainingIndex({
    readinessScore: 38,
    readinessLevel: 'low',
    topFactors: ['TSB 显著偏低']
  });
  const high = buildTrainingIndex({
    readinessScore: 82,
    readinessLevel: 'high',
    topFactors: ['恢复信号稳定']
  });
  const red = buildTrainingIndex({
    readinessScore: 60,
    readinessLevel: 'medium',
    riskLevel: 'red',
    topFactors: ['TSB 显著偏低']
  });

  assert.equal(low.score, 38);
  assert.equal(low.level, 'recovery');
  assert.equal(low.label, '恢复优先');
  assert.match(low.recommendation, /恢复/);
  assert.equal(high.level, 'ready');
  assert.equal(high.label, '适合训练');
  assert.equal(red.score, 44);
  assert.equal(red.level, 'recovery');
});

test('running power does not become 100 only because CTL is above 100', () => {
  const profile = scoreRunningPower({
    overview: { trainingLoad: [] },
    currentLoad: { ctl: 238.91, atl: 305.61, tsb: -66.7, dailyTrainingLoad: 219.72 },
    bestPace: 360,
    longestDistanceKm: 10,
    totalDistance28d: 32,
    totalLoad28d: 420,
    hrPaceEfficiency: 58,
    vo2max: 48
  });

  assert.ok(profile.score < 100);
  assert.ok(profile.score >= 0);
  assert.notEqual(profile.label, '巅峰');
});

test('five power returns valid scores and data quality warnings when technique signals are missing', () => {
  const metrics = {
    currentLoad: { ctl: 120, atl: 180, tsb: -30, dailyTrainingLoad: 150 },
    latestSleep: { sleepScore: 62, avgHrv: 38 },
    latestHealth: { avgStressLevel: 42 },
    paceRows: [
      { paceSecPerKm: 330, load: 80, elevation: 12, cadence: null, power: null },
      { paceSecPerKm: 350, load: 70, elevation: 10, cadence: null, power: null }
    ],
    longestDistanceKm: 12,
    totalDistance28d: 40,
    totalLoad28d: 500,
    longRunRatio: 0.25,
    bestPace: 330,
    vo2max: null,
    runs: [{}, {}]
  };
  const powers = buildFivePower(metrics, 60);
  const quality = buildDataQuality(metrics, { sleepRows: [], trainingRows: [] }, null);

  assert.equal(powers.length, 5);
  assert.ok(powers.every((item) => Number.isInteger(item.score) && item.score >= 0 && item.score <= 100));
  assert.ok(quality.warnings.some((warning) => warning.includes('动作技术数据不足')));
  assert.ok(quality.warnings.some((warning) => warning.includes('FitRec')));
});
