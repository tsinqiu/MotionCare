const db = require('../db');

function getTodayText() {
  return new Date().toISOString().slice(0, 10);
}

function rangeDays(range) {
  const map = { '1m': 30, '3m': 90, '6m': 180, '1y': 365 };
  return map[range] || 30;
}

function mysqlDateTime(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function chinaDayUtcBounds(dateText) {
  const start = new Date(`${dateText}T00:00:00+08:00`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return [mysqlDateTime(start), mysqlDateTime(end)];
}

async function checkDatabase() {
  try {
    const ok = await db.ping();
    return {
      ok,
      message: ok ? 'connected' : 'query returned unexpected result',
    };
  } catch (error) {
    return {
      ok: false,
      message: error.message,
    };
  }
}

async function getTodayHealth(userId, date) {
  const today = date || getTodayText();
  const [dhs] = await db.query(
    `SELECT
      steps, distance_m AS distanceM, calories, active_calories AS activeCalories,
      moderate_intensity_minutes AS moderateIntensityMinutes,
      vigorous_intensity_minutes AS vigorousIntensityMinutes,
      resting_heart_rate_bpm AS restingHeartRateBpm,
      avg_stress_level AS avgStressLevel, max_stress_level AS maxStressLevel,
      body_battery_charged AS bodyBatteryCharged,
      stress_duration_s AS stressDurationS,
      low_stress_duration_s AS lowStressDurationS,
      high_stress_duration_s AS highStressDurationS,
      sleeping_seconds AS sleepingSeconds,
      avg_waking_respiration_value AS avgWakingRespiration
    FROM DailyHealthSummaries
    WHERE user_id = ? AND summary_date = ?
    LIMIT 1`,
    [userId, today]
  );
  const [sleep] = await db.query(
    `SELECT
      duration_s AS durationS, sleep_score AS sleepScore,
      deep_sleep_s AS deepSleepS, light_sleep_s AS lightSleepS, rem_sleep_s AS remSleepS,
      avg_hrv AS avgHrv, hrv_status AS hrvStatus,
      avg_heart_rate_during_sleep AS avgHeartRateDuringSleep,
      avg_sleep_stress AS avgSleepStress
    FROM SleepSummaries
    WHERE user_id = ? AND sleep_date = ?
    LIMIT 1`,
    [userId, today]
  );
  const [training] = await db.query(
    `SELECT training_status AS trainingStatus, vo2max
     FROM TrainingStatusSnapshots
     WHERE user_id = ? AND snapshot_date <= ?
     ORDER BY snapshot_date DESC
     LIMIT 1`,
    [userId, today]
  );
  const [ftp] = await db.query(
    `SELECT ftp_w AS cyclingFtp
     FROM CyclingFtpSnapshots
     WHERE user_id = ? AND snapshot_date <= ?
     ORDER BY snapshot_date DESC
     LIMIT 1`,
    [userId, today]
  );
  return { ...(dhs || {}), ...(sleep || {}), ...(training || {}), ...(ftp || {}) };
}

async function getHealthTrends(userId, metric, range) {
  const days = rangeDays(range);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const start = startDate.toISOString().slice(0, 10);

  const metricMap = {
    hrv: { table: 'SleepSummaries', dateCol: 'sleep_date', valueCol: 'avg_hrv', valueAlias: 'value' },
    resting_heart_rate: { table: 'DailyHealthSummaries', dateCol: 'summary_date', valueCol: 'resting_heart_rate_bpm', valueAlias: 'value' },
    sleep_score: { table: 'SleepSummaries', dateCol: 'sleep_date', valueCol: 'sleep_score', valueAlias: 'value' },
    steps: { table: 'DailyHealthSummaries', dateCol: 'summary_date', valueCol: 'steps', valueAlias: 'value' },
    stress: { table: 'DailyHealthSummaries', dateCol: 'summary_date', valueCol: 'avg_stress_level', valueAlias: 'value' },
    ftp: { table: 'CyclingFtpSnapshots', dateCol: 'snapshot_date', valueCol: 'ftp_w', valueAlias: 'value' },
  };

  const cfg = metricMap[metric];
  if (!cfg) {
    return [];
  }

  const rows = await db.query(
    `SELECT ${cfg.dateCol} AS date, ${cfg.valueCol} AS ${cfg.valueAlias}
     FROM ${cfg.table}
     WHERE user_id = ? AND ${cfg.dateCol} >= ?
     ORDER BY ${cfg.dateCol} ASC`,
    [userId, start]
  );
  return rows.map((r) => ({ date: r.date, value: r.value }));
}

async function getSamples(userId, type, date, source) {
  const sampleMap = {
    'heart-rate': { table: 'HeartRateSamples', timeCol: 'sample_time_utc', valueCol: 'heart_rate_bpm' },
    stress: { table: 'StressSamples', timeCol: 'sample_time_utc', valueCol: 'stress_level' },
    steps: { table: 'StepSamples', timeCol: 'segment_start_utc', valueCol: 'steps' },
    'intensity-minutes': { table: 'IntensityMinuteSamples', timeCol: 'sample_time_utc', valueCol: 'moderate_minutes' },
    hrv: { table: 'HrvSamples', timeCol: 'sample_time_utc', valueCol: 'hrv' },
    'sleep-stages': { table: 'SleepStageSamples', timeCol: 'stage_start_utc', isStage: true },
    'sleep-movement': { table: 'SleepMovementSamples', timeCol: 'segment_start_utc', valueCol: 'movement_level' },
  };

  const cfg = sampleMap[type];
  if (!cfg) {
    return [];
  }

  if (cfg.isStage) {
    const rows = await db.query(
      `SELECT stage_start_utc AS stageStartUtc, stage_end_utc AS stageEndUtc,
              stage_type AS stageType, duration_s AS durationS
       FROM SleepStageSamples
       WHERE user_id = ? AND sleep_date = ?
       ORDER BY stage_start_utc ASC`,
      [userId, date]
    );
    return rows.map((r) => ({
      stageStartUtc: r.stageStartUtc,
      stageEndUtc: r.stageEndUtc,
      stageType: r.stageType,
      durationS: r.durationS,
    }));
  }

  const [startUtc, endUtc] = chinaDayUtcBounds(date);
  const params = [userId, startUtc, endUtc];
  let sourceFilter = '';
  if (source && cfg.table !== 'StepSamples' && cfg.table !== 'IntensityMinuteSamples' && cfg.table !== 'HrvSamples') {
    sourceFilter = ' AND source = ?';
    params.push(source);
  }
  if (cfg.table === 'StepSamples') {
    const rows = await db.query(
      `SELECT segment_start_utc AS time, steps AS value
       FROM StepSamples
       WHERE user_id = ? AND segment_start_utc >= ? AND segment_start_utc < ?
       ORDER BY segment_start_utc ASC`,
      [userId, startUtc, endUtc]
    );
    return rows.map((r) => ({ time: r.time, value: r.value }));
  }
  if (cfg.table === 'IntensityMinuteSamples') {
    const rows = await db.query(
      `SELECT sample_time_utc AS time,
              COALESCE(moderate_minutes, 0) + COALESCE(vigorous_minutes, 0) AS value,
              moderate_minutes AS moderateMinutes,
              vigorous_minutes AS vigorousMinutes
       FROM IntensityMinuteSamples
       WHERE user_id = ? AND sample_time_utc >= ? AND sample_time_utc < ?
       ORDER BY sample_time_utc ASC`,
      [userId, startUtc, endUtc]
    );
    return rows.map((r) => ({
      time: r.time,
      value: r.value,
      moderateMinutes: r.moderateMinutes,
      vigorousMinutes: r.vigorousMinutes,
    }));
  }

  const rows = await db.query(
    `SELECT ${cfg.timeCol} AS time, ${cfg.valueCol} AS value
     FROM ${cfg.table}
     WHERE user_id = ? AND ${cfg.timeCol} >= ? AND ${cfg.timeCol} < ?${sourceFilter}
     ORDER BY ${cfg.timeCol} ASC`,
    params
  );
  return rows.map((r) => ({ time: r.time, value: r.value }));
}

async function getLatestTrainingStatus(userId) {
  const [row] = await db.query(
    `SELECT snapshot_date AS snapshotDate, vo2max, training_status AS trainingStatus,
            load_balance AS loadBalance,
            acute_training_load AS acuteTrainingLoad,
            chronic_training_load AS chronicTrainingLoad,
            acute_chronic_workload_ratio AS acuteChronicWorkloadRatio,
            acwr_status AS acwrStatus,
            acwr_percent AS acwrPercent,
            optimal_load_min AS optimalLoadMin,
            optimal_load_max AS optimalLoadMax,
            low_aerobic_load AS lowAerobicLoad,
            low_aerobic_target_min AS lowAerobicTargetMin,
            low_aerobic_target_max AS lowAerobicTargetMax,
            high_aerobic_load AS highAerobicLoad,
            high_aerobic_target_min AS highAerobicTargetMin,
            high_aerobic_target_max AS highAerobicTargetMax,
            anaerobic_load AS anaerobicLoad,
            anaerobic_target_min AS anaerobicTargetMin,
            anaerobic_target_max AS anaerobicTargetMax
     FROM TrainingStatusSnapshots
     WHERE user_id = ?
     ORDER BY snapshot_date DESC
     LIMIT 1`,
    [userId]
  );
  return row || null;
}

async function getLatestRacePredictions(userId) {
  const [row] = await db.query(
    `SELECT prediction_date AS predictionDate,
            time_5k_s AS time5kS, time_10k_s AS time10kS,
            time_half_marathon_s AS timeHalfMarathonS, time_marathon_s AS timeMarathonS
     FROM RacePredictions
     WHERE user_id = ?
     ORDER BY prediction_date DESC
     LIMIT 1`,
    [userId]
  );
  return row || null;
}

async function getLatestLactateThreshold(userId) {
  const [row] = await db.query(
    `SELECT threshold_date AS thresholdDate, heart_rate_bpm AS heartRateBpm,
            cycling_heart_rate_bpm AS cyclingHeartRateBpm,
            speed_mps AS speedMps, power_w AS powerW,
            power_to_weight AS powerToWeight
     FROM LactateThresholds
     WHERE user_id = ?
     ORDER BY threshold_date DESC
     LIMIT 1`,
    [userId]
  );
  return row || null;
}

async function getLatestCyclingFtp(userId) {
  const [row] = await db.query(
    `SELECT snapshot_date AS snapshotDate, ftp_w AS ftpW, sport, source
     FROM CyclingFtpSnapshots
     WHERE user_id = ?
     ORDER BY snapshot_date DESC
     LIMIT 1`,
    [userId]
  );
  return row || null;
}

module.exports = {
  checkDatabase,
  getTodayHealth,
  getHealthTrends,
  getSamples,
  getLatestTrainingStatus,
  getLatestRacePredictions,
  getLatestLactateThreshold,
  getLatestCyclingFtp,
};
