const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');
const db = require('../db');
const activityService = require('./activityService');
const coachMlService = require('./coachMlService');

const MODEL_VERSION = 'performance-v1';
const CONTEXT_WINDOW_DAYS = 28;
const HEALTH_WINDOW_DAYS = 14;
const REFERENCE_PATH = path.resolve(__dirname, '..', '..', 'ml', 'reference', 'fitrec_reference_report.json');

function toNumber(value, fallback = null) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function round(value, digits = 1) {
  const numberValue = toNumber(value);
  if (numberValue === null) return null;
  const factor = 10 ** digits;
  return Math.round(numberValue * factor) / factor;
}

function clamp(value, min = 0, max = 100) {
  const numberValue = toNumber(value, min);
  return Math.max(min, Math.min(max, numberValue));
}

function score(value) {
  return Math.round(clamp(value, 0, 100));
}

function avg(values) {
  const numbers = values.map((value) => toNumber(value)).filter((value) => value !== null);
  if (!numbers.length) return null;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function sum(values) {
  return values.reduce((total, value) => total + (toNumber(value, 0) || 0), 0);
}

function normalizeLoad(value, anchor = 260) {
  const numberValue = toNumber(value, 0);
  return clamp((numberValue / anchor) * 100, 0, 100);
}

function normalizeDistanceKm(value, anchor = 42.2) {
  return clamp((toNumber(value, 0) / anchor) * 100, 0, 100);
}

function normalizePaceSecPerKm(value) {
  const pace = toNumber(value);
  if (pace === null || pace <= 0) return null;
  return clamp(((420 - pace) / 180) * 100, 0, 100);
}

function levelFromScore(value) {
  if (value >= 82) return { level: 'peak', label: '巅峰' };
  if (value >= 65) return { level: 'strong', label: '强劲' };
  if (value >= 45) return { level: 'stable', label: '稳定' };
  return { level: 'base', label: '基础' };
}

function trainingIndexLevel(value) {
  if (value >= 75) return { level: 'ready', label: '适合训练' };
  if (value >= 55) return { level: 'steady', label: '稳态训练' };
  return { level: 'recovery', label: '恢复优先' };
}

function trendFromLoads(loadRows) {
  if (!Array.isArray(loadRows) || loadRows.length < 8) return 'unknown';
  const recent = avg(loadRows.slice(-7).map((row) => row.dailyTrainingLoad));
  const previous = avg(loadRows.slice(-14, -7).map((row) => row.dailyTrainingLoad));
  if (recent === null || previous === null || previous <= 0) return 'unknown';
  const delta = (recent - previous) / previous;
  if (delta > 0.12) return 'up';
  if (delta < -0.12) return 'down';
  return 'stable';
}

function userDataWhere(alias = 'a') {
  return `(${alias}.owner_user_id = ? OR ${alias}.owner_user_id IS NULL)`;
}

function visibleOverviewFilters(user) {
  return {
    owner: 'all',
    ownerUserId: user?.id
  };
}

async function getLatestContextDate(userId) {
  const rows = await db.query(
    `
      SELECT MAX(latest_date) AS latestDate
      FROM (
        SELECT DATE(MAX(local_start_time)) AS latest_date
        FROM Activities a
        WHERE ${userDataWhere('a')}
        UNION ALL
        SELECT MAX(summary_date) AS latest_date
        FROM DailyHealthSummaries
        WHERE user_id = ?
        UNION ALL
        SELECT MAX(sleep_date) AS latest_date
        FROM SleepSummaries
        WHERE user_id = ?
        UNION ALL
        SELECT MAX(snapshot_date) AS latest_date
        FROM TrainingStatusSnapshots
        WHERE user_id = ?
      ) latest
    `,
    [userId, userId, userId, userId]
  );

  return rows[0]?.latestDate ? String(rows[0].latestDate).slice(0, 10) : new Date().toISOString().slice(0, 10);
}

async function getRecentActivityContext(userId, latestDate) {
  return db.query(
    `
      SELECT
        a.id,
        DATE_FORMAT(a.local_start_time, '%Y-%m-%d') AS localDate,
        a.activity_name AS activityName,
        a.activity_type AS activityType,
        a.location_name AS locationName,
        a.weather_condition AS weatherCondition,
        a.temperature_c AS temperatureC,
        a.humidity_percent AS humidityPercent,
        a.feels_like_c AS feelsLikeC,
        js.distance_m AS distanceM,
        js.duration_s AS durationS,
        js.avg_speed_mps AS avgSpeedMps,
        js.avg_heart_rate_bpm AS avgHeartRateBpm,
        js.avg_cadence_spm AS avgCadenceSpm,
        js.avg_stride_length_cm AS avgStrideLengthCm,
        js.avg_power_w AS avgPowerW,
        js.normalized_power_w AS normalizedPowerW,
        js.elevation_gain_m AS elevationGainM,
        js.activity_training_load AS activityTrainingLoad,
        js.aerobic_training_effect AS aerobicTrainingEffect,
        js.anaerobic_training_effect AS anaerobicTrainingEffect,
        js.training_effect_label AS trainingEffectLabel,
        js.body_battery_delta AS bodyBatteryDelta
      FROM Activities a
      LEFT JOIN ActivitySummaries js ON js.activity_id = a.id
      WHERE ${userDataWhere('a')}
        AND a.local_start_time >= DATE_SUB(?, INTERVAL ? DAY)
        AND a.local_start_time <= CONCAT(?, ' 23:59:59.999')
      ORDER BY a.local_start_time DESC
      LIMIT 120
    `,
    [userId, latestDate, CONTEXT_WINDOW_DAYS, latestDate]
  );
}

async function getActivityTotals(userId, latestDate) {
  const rows = await db.query(
    `
      SELECT
        COUNT(*) AS activityCount,
        ROUND(SUM(js.distance_m) / 1000, 1) AS totalDistanceKm,
        ROUND(SUM(js.duration_s) / 3600, 1) AS totalDurationH,
        ROUND(SUM(js.activity_training_load), 1) AS totalTrainingLoad,
        ROUND(AVG(js.avg_heart_rate_bpm), 1) AS avgHeartRateBpm,
        SUM(a.temperature_c IS NOT NULL OR a.humidity_percent IS NOT NULL OR a.weather_condition IS NOT NULL) AS weatherSamples
      FROM Activities a
      LEFT JOIN ActivitySummaries js ON js.activity_id = a.id
      WHERE ${userDataWhere('a')}
        AND a.local_start_time >= DATE_SUB(?, INTERVAL ? DAY)
        AND a.local_start_time <= CONCAT(?, ' 23:59:59.999')
    `,
    [userId, latestDate, CONTEXT_WINDOW_DAYS, latestDate]
  );
  return rows[0] || {};
}

async function getHealthContext(userId, latestDate) {
  return db.query(
    `
      SELECT
        summary_date AS summaryDate,
        avg_stress_level AS avgStressLevel,
        body_battery_drained AS bodyBatteryDrained,
        min_body_battery AS minBodyBattery,
        max_body_battery AS maxBodyBattery,
        resting_heart_rate_bpm AS restingHeartRateBpm,
        sleeping_seconds AS sleepingSeconds
      FROM DailyHealthSummaries
      WHERE user_id = ?
        AND summary_date >= DATE_SUB(?, INTERVAL ? DAY)
        AND summary_date <= ?
      ORDER BY summary_date DESC
      LIMIT 14
    `,
    [userId, latestDate, HEALTH_WINDOW_DAYS, latestDate]
  );
}

async function getSleepContext(userId, latestDate) {
  return db.query(
    `
      SELECT
        sleep_date AS sleepDate,
        duration_s AS durationS,
        sleep_score AS sleepScore,
        avg_hrv AS avgHrv,
        hrv_status AS hrvStatus,
        avg_sleep_stress AS avgSleepStress
      FROM SleepSummaries
      WHERE user_id = ?
        AND sleep_date >= DATE_SUB(?, INTERVAL ? DAY)
        AND sleep_date <= ?
      ORDER BY sleep_date DESC
      LIMIT 14
    `,
    [userId, latestDate, HEALTH_WINDOW_DAYS, latestDate]
  );
}

async function getTrainingContext(userId, latestDate) {
  return db.query(
    `
      SELECT
        snapshot_date AS snapshotDate,
        training_status AS trainingStatus,
        load_balance AS loadBalance,
        acute_training_load AS acuteTrainingLoad,
        chronic_training_load AS chronicTrainingLoad,
        acute_chronic_workload_ratio AS acuteChronicWorkloadRatio,
        vo2max,
        low_aerobic_load AS lowAerobicLoad,
        high_aerobic_load AS highAerobicLoad,
        anaerobic_load AS anaerobicLoad
      FROM TrainingStatusSnapshots
      WHERE user_id = ?
        AND snapshot_date >= DATE_SUB(?, INTERVAL ? DAY)
        AND snapshot_date <= ?
      ORDER BY snapshot_date DESC
      LIMIT 14
    `,
    [userId, latestDate, HEALTH_WINDOW_DAYS, latestDate]
  );
}

async function getContext(user) {
  const userId = user?.id || 1;
  const latestDate = await getLatestContextDate(userId);
  const [activities, activityTotals, healthRows, sleepRows, trainingRows] = await Promise.all([
    getRecentActivityContext(userId, latestDate),
    getActivityTotals(userId, latestDate),
    getHealthContext(userId, latestDate),
    getSleepContext(userId, latestDate),
    getTrainingContext(userId, latestDate)
  ]);
  const latestWeather = activities.find((activity) =>
    activity.weatherCondition || activity.temperatureC !== null || activity.humidityPercent !== null || activity.feelsLikeC !== null
  ) || null;

  return {
    userId,
    latestDate,
    activities,
    activityTotals,
    healthRows,
    sleepRows,
    trainingRows,
    latestWeather,
    signals: {
      activityCount28d: Number(activityTotals.activityCount || 0),
      healthDays14d: healthRows.length,
      sleepDays14d: sleepRows.length,
      trainingDays14d: trainingRows.length,
      weatherSamples28d: Number(activityTotals.weatherSamples || 0)
    }
  };
}

function readFitrecReference(referencePath = REFERENCE_PATH) {
  try {
    return JSON.parse(fs.readFileSync(referencePath, 'utf8'));
  } catch (_error) {
    return null;
  }
}

function runningActivities(context) {
  return (context.activities || []).filter((activity) =>
    String(activity.activityType || '').toLowerCase().includes('running')
    && toNumber(activity.distanceM, 0) > 0
    && toNumber(activity.durationS, 0) > 0
  );
}

function latestTraining(context) {
  return (context.trainingRows || [])[0] || {};
}

function latestSleep(context) {
  return (context.sleepRows || [])[0] || {};
}

function latestHealth(context) {
  return (context.healthRows || [])[0] || {};
}

function paceScores(runs) {
  return runs
    .map((activity) => {
      const distanceKm = toNumber(activity.distanceM, 0) / 1000;
      const duration = toNumber(activity.durationS, 0);
      if (distanceKm < 1 || duration <= 0) return null;
      return {
        distanceKm,
        paceSecPerKm: duration / distanceKm,
        heartRate: toNumber(activity.avgHeartRateBpm),
        cadence: toNumber(activity.avgCadenceSpm),
        stride: toNumber(activity.avgStrideLengthCm),
        power: toNumber(activity.avgPowerW ?? activity.normalizedPowerW),
        load: toNumber(activity.activityTrainingLoad, 0),
        elevation: toNumber(activity.elevationGainM, 0)
      };
    })
    .filter(Boolean);
}

function buildRunningMetrics(context, overview = {}) {
  const runs = runningActivities(context);
  const paceRows = paceScores(runs);
  const bestPace = paceRows.length ? Math.min(...paceRows.map((row) => row.paceSecPerKm)) : null;
  const longestDistanceKm = paceRows.length ? Math.max(...paceRows.map((row) => row.distanceKm)) : 0;
  const totalDistance28d = sum(paceRows.map((row) => row.distanceKm));
  const totalLoad28d = sum(paceRows.map((row) => row.load));
  const longRunCount = paceRows.filter((row) => row.distanceKm >= Math.max(10, longestDistanceKm * 0.65)).length;
  const currentLoad = overview.trainingLoad?.at(-1) || {};
  const training = latestTraining(context);
  const vo2max = toNumber(training.vo2max);
  const avgHr = avg(paceRows.map((row) => row.heartRate));
  const avgPace = avg(paceRows.map((row) => row.paceSecPerKm));
  const hrPaceEfficiency = avgPace && avgHr
    ? clamp((360 / avgPace) * 55 + ((170 - avgHr) / 70) * 45, 0, 100)
    : null;

  return {
    runs,
    paceRows,
    bestPace,
    longestDistanceKm,
    totalDistance28d,
    totalLoad28d,
    longRunRatio: paceRows.length ? longRunCount / paceRows.length : 0,
    currentLoad,
    vo2max,
    avgHr,
    avgPace,
    hrPaceEfficiency,
    latestSleep: latestSleep(context),
    latestHealth: latestHealth(context),
    latestTraining: training
  };
}

function scoreRunningPower(metrics, fitrecReference = null) {
  const vo2Score = metrics.vo2max === null ? null : clamp(((metrics.vo2max - 35) / 35) * 100, 0, 100);
  const bestPaceScore = normalizePaceSecPerKm(metrics.bestPace);
  const enduranceScore = normalizeDistanceKm(metrics.longestDistanceKm);
  const volumeScore = clamp((metrics.totalDistance28d / 220) * 100, 0, 100);
  const loadScore = normalizeLoad(metrics.totalLoad28d, 1800);
  const efficiencyScore = metrics.hrPaceEfficiency;
  const fitrecP80 = toNumber(fitrecReference?.reference?.distanceKm?.p80 ?? fitrecReference?.distanceKm?.p80);
  const referenceDistanceScore = fitrecP80 ? clamp((metrics.longestDistanceKm / fitrecP80) * 82, 0, 100) : null;

  const components = [
    [vo2Score, 0.2],
    [bestPaceScore, 0.2],
    [efficiencyScore, 0.2],
    [enduranceScore, 0.15],
    [volumeScore, 0.12],
    [loadScore, 0.08],
    [referenceDistanceScore, 0.05]
  ].filter(([value]) => value !== null);
  const weightTotal = components.reduce((total, [, weight]) => total + weight, 0) || 1;
  const raw = components.reduce((total, [value, weight]) => total + value * weight, 0) / weightTotal;
  const currentLoad = metrics.currentLoad || {};
  const fatiguePenalty = Math.max(0, -toNumber(currentLoad.tsb, 0) - 25) * 0.12;
  const finalScore = score(raw - fatiguePenalty);
  const level = levelFromScore(finalScore);
  const factors = [];

  if (vo2Score !== null && vo2Score >= 70) factors.push('VO2max 处在较高水平');
  if (bestPaceScore !== null && bestPaceScore >= 65) factors.push('近期配速表现较好');
  if (efficiencyScore !== null && efficiencyScore >= 65) factors.push('心率-配速效率较好');
  if (metrics.longestDistanceKm >= 21) factors.push('长距离能力较稳定');
  if (metrics.totalDistance28d >= 120) factors.push('近 28 天跑量基础较足');
  if (!factors.length) factors.push('跑步样本仍在积累中');

  return {
    score: finalScore,
    level: level.level,
    label: level.label,
    trend: trendFromLoads([...(metrics.overview?.trainingLoad || [])]),
    factors: factors.slice(0, 4),
    components: {
      vo2max: round(vo2Score, 1),
      bestPace: round(bestPaceScore, 1),
      heartRatePaceEfficiency: round(efficiencyScore, 1),
      endurance: round(enduranceScore, 1),
      volume28d: round(volumeScore, 1),
      load28d: round(loadScore, 1),
      externalReference: round(referenceDistanceScore, 1)
    }
  };
}

function buildFivePower(metrics, runningPowerScore) {
  const currentLoad = metrics.currentLoad || {};
  const sleep = metrics.latestSleep || {};
  const health = metrics.latestHealth || {};
  const paceRows = metrics.paceRows || [];
  const cadenceCoverage = paceRows.filter((row) => row.cadence !== null).length / Math.max(1, paceRows.length);
  const powerCoverage = paceRows.filter((row) => row.power !== null).length / Math.max(1, paceRows.length);
  const paceValues = paceRows.map((row) => row.paceSecPerKm).filter((value) => value > 0);
  const paceMean = avg(paceValues);
  const paceVariance = paceMean ? avg(paceValues.map((value) => Math.abs(value - paceMean) / paceMean)) : null;
  const paceStability = paceVariance === null ? null : clamp(100 - paceVariance * 180, 0, 100);
  const endurance = score(
    normalizeLoad(currentLoad.ctl, 260) * 0.32
    + normalizeDistanceKm(metrics.longestDistanceKm) * 0.28
    + clamp((metrics.totalDistance28d / 220) * 100, 0, 100) * 0.25
    + clamp(metrics.longRunRatio * 100, 0, 100) * 0.15
  );
  const speed = score(
    (normalizePaceSecPerKm(metrics.bestPace) ?? runningPowerScore) * 0.4
    + (metrics.vo2max === null ? runningPowerScore : clamp(((metrics.vo2max - 35) / 35) * 100, 0, 100)) * 0.32
    + normalizeLoad(metrics.totalLoad28d, 1800) * 0.28
  );
  const technique = score(
    (paceStability ?? 55) * 0.36
    + clamp(cadenceCoverage * 100, 0, 100) * 0.22
    + clamp(powerCoverage * 100, 0, 100) * 0.18
    + runningPowerScore * 0.24
  );
  const strength = score(
    normalizeLoad(metrics.totalLoad28d, 1800) * 0.32
    + normalizeLoad(currentLoad.ctl, 260) * 0.24
    + clamp(avg(paceRows.map((row) => row.power)) || 0, 0, 420) / 420 * 100 * 0.22
    + clamp(sum(paceRows.map((row) => row.elevation)) / 1200 * 100, 0, 100) * 0.22
  );
  const stability = score(
    clamp(toNumber(sleep.sleepScore, 58), 0, 100) * 0.28
    + clamp(toNumber(sleep.avgHrv, 35) / 80 * 100, 0, 100) * 0.22
    + clamp(100 - toNumber(health.avgStressLevel, 42), 0, 100) * 0.22
    + clamp(50 + toNumber(currentLoad.tsb, 0), 0, 100) * 0.18
    + clamp(100 - Math.abs(toNumber(currentLoad.tsb, 0)) * 1.5, 0, 100) * 0.1
  );

  return [
    { key: 'endurance', label: '耐力', score: endurance, detail: '长期负荷、跑量和长距离能力' },
    { key: 'speed', label: '速度', score: speed, detail: '配速表现、VO2max 和训练刺激' },
    { key: 'technique', label: '技术', score: technique, detail: '配速稳定、步频、功率和动作线索' },
    { key: 'strength', label: '肌力', score: strength, detail: '负荷承受、功率、爬升和力量基础' },
    { key: 'stability', label: '稳定', score: stability, detail: '睡眠、HRV、压力和状态余量' }
  ];
}

function buildDataQuality(metrics, context, fitrecReference) {
  const runCount = metrics.runs.length;
  const heartRateCount = metrics.paceRows.filter((row) => row.heartRate !== null).length;
  const cadenceCount = metrics.paceRows.filter((row) => row.cadence !== null).length;
  const powerCount = metrics.paceRows.filter((row) => row.power !== null).length;
  const sleepCount = (context.sleepRows || []).length;
  const hrvCount = (context.sleepRows || []).filter((row) => toNumber(row.avgHrv) !== null).length;
  const vo2Count = (context.trainingRows || []).filter((row) => toNumber(row.vo2max) !== null).length;
  const scoreValue = score(
    clamp(runCount / 12 * 100, 0, 100) * 0.24
    + clamp(heartRateCount / Math.max(1, runCount) * 100, 0, 100) * 0.18
    + clamp(vo2Count / 3 * 100, 0, 100) * 0.16
    + clamp(cadenceCount / Math.max(1, runCount) * 100, 0, 100) * 0.12
    + clamp(powerCount / Math.max(1, runCount) * 100, 0, 100) * 0.1
    + clamp(sleepCount / 7 * 100, 0, 100) * 0.12
    + clamp(hrvCount / 7 * 100, 0, 100) * 0.08
  );
  const warnings = [];
  if (runCount < 5) warnings.push('跑步样本少于 5 次，跑力置信度偏低');
  if (!heartRateCount) warnings.push('缺少跑步心率，心率-配速效率不可用');
  if (!vo2Count) warnings.push('缺少 VO2max，表现能力估计更保守');
  if (cadenceCount < Math.max(2, runCount * 0.4)) warnings.push('动作技术数据不足，技术分为估计值');
  if (!fitrecReference) warnings.push('FitRec 外部参考缺失，已使用个人基线默认值');

  return {
    score: scoreValue,
    warnings,
    coverage: {
      runningActivities28d: runCount,
      heartRateRuns: heartRateCount,
      vo2maxDays: vo2Count,
      cadenceRuns: cadenceCount,
      powerRuns: powerCount,
      sleepDays14d: sleepCount,
      hrvDays14d: hrvCount,
      fitrecReference: Boolean(fitrecReference)
    }
  };
}

function buildTrainingIndex(mlPrediction) {
  let value = score(mlPrediction?.readinessScore ?? 50);
  if (mlPrediction?.riskLevel === 'red') value = Math.min(value, 44);
  else if (mlPrediction?.riskLevel === 'orange') value = Math.min(value, 54);
  const level = trainingIndexLevel(value);
  const factors = Array.isArray(mlPrediction?.topFactors) && mlPrediction.topFactors.length
    ? mlPrediction.topFactors
    : ['训练负荷、睡眠和恢复信号综合评估'];
  const recommendation = value < 55
    ? '建议今天以恢复、拉伸或轻松有氧为主。'
    : value < 75
      ? '适合安排中低强度有氧或技术训练，避免过度堆量。'
      : '恢复信号较好，可以按计划训练并控制总量。';

  return {
    score: value,
    level: level.level,
    label: level.label,
    recommendation,
    factors: factors.slice(0, 4)
  };
}

function buildKeyMetrics(metrics) {
  const currentLoad = metrics.currentLoad || {};
  return {
    ctl: round(currentLoad.ctl, 2),
    atl: round(currentLoad.atl, 2),
    tsb: round(currentLoad.tsb, 2),
    dailyTrainingLoad: round(currentLoad.dailyTrainingLoad, 2),
    vo2max: round(metrics.vo2max, 1),
    totalDistance28d: round(metrics.totalDistance28d, 1),
    longestDistanceKm: round(metrics.longestDistanceKm, 2),
    bestPaceSecPerKm: round(metrics.bestPace, 1),
    avgHeartRateBpm: round(metrics.avgHr, 1)
  };
}

async function getPerformanceProfile(user) {
  const overview = await activityService.getDashboardOverview(visibleOverviewFilters(user));
  const context = await getContext(user);
  const mlPrediction = await coachMlService.predict({ overview, context });
  const fitrecReference = readFitrecReference();
  const metrics = buildRunningMetrics(context, overview);
  metrics.overview = overview;
  const runningPower = scoreRunningPower(metrics, fitrecReference);
  const fivePower = buildFivePower(metrics, runningPower.score);
  const dataQuality = buildDataQuality(metrics, context, fitrecReference);
  const confidence = round((dataQuality.score / 100) * 0.55 + (toNumber(mlPrediction.confidence, 0.62) || 0.62) * 0.45, 4);

  return {
    trainingIndex: buildTrainingIndex(mlPrediction),
    runningPower,
    fivePower,
    dataQuality,
    keyMetrics: buildKeyMetrics(metrics),
    model: {
      modelVersion: MODEL_VERSION,
      provider: 'local_performance_model',
      confidence
    }
  };
}

async function getHealth() {
  return {
    status: 'ok',
    modelVersion: MODEL_VERSION,
    provider: 'local_performance_model',
    supportedOutputs: ['trainingIndex', 'runningPower', 'fivePower'],
    requiresTrainingArtifact: false,
    referenceAvailable: Boolean(readFitrecReference(config.ml?.fitrecReferencePath || REFERENCE_PATH))
  };
}

module.exports = {
  MODEL_VERSION,
  buildDataQuality,
  buildFivePower,
  buildRunningMetrics,
  buildTrainingIndex,
  getHealth,
  getPerformanceProfile,
  scoreRunningPower
};
