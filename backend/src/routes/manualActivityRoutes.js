const express = require('express');
const db = require('../db');
const defaultAuthService = require('../services/authService');
const { ApiError } = require('../errors');
const { asyncHandler, parseActivityType, parseOptionalNumber, parsePositiveId } = require('../http');
const { authenticate } = require('../middleware/authMiddleware');
const statsCache = require('../cache/statsCache');
const { sendCreated, sendData } = require('../response');

const SUMMARY_COLUMNS = [
  'duration_s',
  'moving_duration_s',
  'elapsed_duration_s',
  'distance_m',
  'calories',
  'avg_speed_mps',
  'max_speed_mps',
  'avg_heart_rate_bpm',
  'max_heart_rate_bpm',
  'avg_cadence_spm',
  'max_cadence_spm',
  'avg_power_w',
  'max_power_w',
  'normalized_power_w',
  'activity_training_load',
  'elevation_gain_m',
  'elevation_loss_m',
  'avg_stride_length_cm',
  'raw_json'
];
const NUMERIC_LIMITS = {
  distanceM: { min: 0, max: 200000, required: true },
  durationS: { min: 1, max: 86400, required: true },
  movingDurationS: { min: 1, max: 86400 },
  elapsedDurationS: { min: 1, max: 86400 },
  calories: { min: 0, max: 10000 },
  avgSpeedMps: { min: 0, max: 15 },
  maxSpeedMps: { min: 0, max: 20 },
  avgHeartRateBpm: { min: 30, max: 240 },
  maxHeartRateBpm: { min: 30, max: 260 },
  avgCadenceSpm: { min: 0, max: 300 },
  maxCadenceSpm: { min: 0, max: 350 },
  avgPowerW: { min: 0, max: 1000 },
  maxPowerW: { min: 0, max: 2000 },
  normalizedPowerW: { min: 0, max: 1000 },
  activityTrainingLoad: { min: 0, max: 2000 },
  elevationGainM: { min: 0, max: 10000 },
  elevationLossM: { min: 0, max: 10000 },
  avgStrideLengthCm: { min: 0, max: 300 }
};
const DISTANCE_REQUIRED_TYPES = new Set([
  'running',
  'street_running',
  'track_running',
  'treadmill_running',
  'cycling',
  'road_biking',
  'indoor_cycling'
]);

function optionalText(value, max = 200) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const text = String(value).trim();
  if (text.length > max) {
    throw new ApiError(400, `text field must be at most ${max} characters`, 'INVALID_MANUAL_ACTIVITY');
  }
  return text;
}

function requiredText(value, name, max = 120) {
  const text = optionalText(value, max);
  if (!text) {
    throw new ApiError(400, `${name} is required`, 'INVALID_MANUAL_ACTIVITY');
  }
  return text;
}

function parseDateTime(value, name) {
  const text = requiredText(value, name, 40).replace('T', ' ').replace('Z', '');
  const match = text.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})(?::(\d{2})(?:\.\d{1,3})?)?$/);
  if (!match) {
    throw new ApiError(400, `${name} must be a datetime string`, 'INVALID_MANUAL_ACTIVITY');
  }
  return `${match[1]} ${match[2]}:${match[3] || '00'}.000`;
}

function parseNumberField(body, name, limits) {
  const value = body[name];
  if (value === undefined || value === null || value === '') {
    if (limits.required) {
      throw new ApiError(400, `${name} is required`, 'INVALID_MANUAL_ACTIVITY');
    }
    return null;
  }

  try {
    return parseOptionalNumber(value, name, limits);
  } catch (error) {
    if (error instanceof ApiError) {
      throw new ApiError(error.statusCode, error.message, 'INVALID_MANUAL_ACTIVITY');
    }
    throw error;
  }
}

function parseManualActivity(body) {
  const payload = {
    activityType: parseActivityType(body.activityType || body.activity_type),
    activityName: optionalText(body.activityName || body.activity_name, 200),
    localStartTime: parseDateTime(body.localStartTime || body.local_start_time, 'localStartTime'),
    startTimeUtc: body.startTimeUtc || body.start_time_utc ? parseDateTime(body.startTimeUtc || body.start_time_utc, 'startTimeUtc') : null,
    locationName: optionalText(body.locationName || body.location_name, 200)
  };

  if (!payload.activityType) {
    throw new ApiError(400, 'activityType is required', 'INVALID_MANUAL_ACTIVITY');
  }

  for (const [name, limits] of Object.entries(NUMERIC_LIMITS)) {
    payload[name] = parseNumberField(body, name, limits);
  }

  if (!payload.activityName) {
    payload.activityName = `Manual ${payload.activityType}`;
  }
  if (!payload.movingDurationS) {
    payload.movingDurationS = payload.durationS;
  }
  if (!payload.elapsedDurationS) {
    payload.elapsedDurationS = payload.durationS;
  }
  if (payload.avgSpeedMps === null && payload.distanceM && payload.durationS) {
    payload.avgSpeedMps = payload.distanceM / payload.durationS;
  }

  if (DISTANCE_REQUIRED_TYPES.has(payload.activityType) && payload.distanceM <= 0) {
    throw new ApiError(400, 'distanceM must be greater than 0 for distance activities', 'INVALID_MANUAL_ACTIVITY');
  }
  if (payload.movingDurationS > payload.elapsedDurationS || payload.durationS > payload.elapsedDurationS) {
    throw new ApiError(400, 'durations must be consistent', 'INVALID_MANUAL_ACTIVITY');
  }
  if (payload.avgHeartRateBpm && payload.maxHeartRateBpm && payload.avgHeartRateBpm > payload.maxHeartRateBpm) {
    throw new ApiError(400, 'avgHeartRateBpm must not be greater than maxHeartRateBpm', 'INVALID_MANUAL_ACTIVITY');
  }
  if (payload.avgSpeedMps && payload.maxSpeedMps && payload.avgSpeedMps > payload.maxSpeedMps) {
    throw new ApiError(400, 'avgSpeedMps must not be greater than maxSpeedMps', 'INVALID_MANUAL_ACTIVITY');
  }

  return payload;
}

function requireAdmin(user) {
  if (user?.role !== 'admin') {
    throw new ApiError(403, 'only administrators can manage manual activities', 'FORBIDDEN');
  }
}

function canManage(user, activity) {
  return user.role === 'admin' || activity.ownerUserId === user.id;
}

function toSummaryValues(payload) {
  return [
    payload.durationS,
    payload.movingDurationS,
    payload.elapsedDurationS,
    payload.distanceM,
    payload.calories,
    payload.avgSpeedMps,
    payload.maxSpeedMps,
    payload.avgHeartRateBpm,
    payload.maxHeartRateBpm,
    payload.avgCadenceSpm,
    payload.maxCadenceSpm,
    payload.avgPowerW,
    payload.maxPowerW,
    payload.normalizedPowerW,
    payload.activityTrainingLoad,
    payload.elevationGainM,
    payload.elevationLossM,
    payload.avgStrideLengthCm,
    JSON.stringify({ manualUpload: payload })
  ];
}

async function getManualActivity(activityId, user) {
  const rows = await db.query(
    `
      SELECT
        a.id,
        a.activity_name AS activityName,
        a.activity_type AS activityType,
        a.local_start_time AS localStartTime,
        a.location_name AS locationName,
        a.owner_user_id AS ownerUserId,
        a.data_source AS dataSource,
        a.is_manual AS isManual,
        js.duration_s AS durationS,
        js.moving_duration_s AS movingDurationS,
        js.elapsed_duration_s AS elapsedDurationS,
        js.distance_m AS distanceM,
        js.calories,
        js.avg_speed_mps AS avgSpeedMps,
        js.max_speed_mps AS maxSpeedMps,
        js.avg_heart_rate_bpm AS avgHeartRateBpm,
        js.max_heart_rate_bpm AS maxHeartRateBpm,
        js.avg_cadence_spm AS avgCadenceSpm,
        js.max_cadence_spm AS maxCadenceSpm,
        js.avg_power_w AS avgPowerW,
        js.max_power_w AS maxPowerW,
        js.normalized_power_w AS normalizedPowerW,
        js.activity_training_load AS activityTrainingLoad,
        js.elevation_gain_m AS elevationGainM,
        js.elevation_loss_m AS elevationLossM,
        js.avg_stride_length_cm AS avgStrideLengthCm
      FROM Activities a
      LEFT JOIN ActivitySummaries js ON js.activity_id = a.id
      WHERE a.id = ? AND a.is_manual = TRUE
    `,
    [activityId]
  );

  const activity = rows[0];
  if (!activity) {
    throw new ApiError(404, 'manual activity not found', 'MANUAL_ACTIVITY_NOT_FOUND');
  }
  if (!canManage(user, activity)) {
    throw new ApiError(403, 'you cannot access this manual activity', 'FORBIDDEN');
  }

  return activity;
}

async function createManualActivity(payload, user) {
  const activityId = await db.transaction(async (connection) => {
    const activityKey = `manual:${user.id}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
    const [activityResult] = await connection.query(
      `
        INSERT INTO Activities (
          activity_key, activity_name, activity_type, local_start_time, start_time_utc,
          location_name, owner_user_id, data_source, is_manual, match_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'manual_upload', TRUE, 'manual_upload')
      `,
      [
        activityKey,
        payload.activityName,
        payload.activityType,
        payload.localStartTime,
        payload.startTimeUtc || payload.localStartTime,
        payload.locationName,
        user.id
      ]
    );

    const insertedActivityId = activityResult.insertId;
    await connection.query(
      `
        INSERT INTO ActivitySummaries (activity_id, ${SUMMARY_COLUMNS.join(', ')})
        VALUES (?, ${SUMMARY_COLUMNS.map(() => '?').join(', ')})
      `,
      [insertedActivityId, ...toSummaryValues(payload)]
    );

    return insertedActivityId;
  });

  return getManualActivity(activityId, user);
}

async function updateManualActivity(activityId, payload, user) {
  await getManualActivity(activityId, user);

  await db.transaction(async (connection) => {
    await connection.query(
      `
        UPDATE Activities
        SET activity_name = ?, activity_type = ?, local_start_time = ?, start_time_utc = ?,
            location_name = ?
        WHERE id = ? AND is_manual = TRUE
      `,
      [
        payload.activityName,
        payload.activityType,
        payload.localStartTime,
        payload.startTimeUtc || payload.localStartTime,
        payload.locationName,
        activityId
      ]
    );

    await connection.query(
      `
        UPDATE ActivitySummaries
        SET ${SUMMARY_COLUMNS.map((column) => `${column} = ?`).join(', ')}
        WHERE activity_id = ?
      `,
      [...toSummaryValues(payload), activityId]
    );
  });

  return getManualActivity(activityId, user);
}

async function deleteManualActivity(activityId, user) {
  await getManualActivity(activityId, user);
  await db.query('DELETE FROM Activities WHERE id = ? AND is_manual = TRUE', [activityId]);
  return { deleted: true, id: activityId };
}

const defaultManualActivityService = {
  createManualActivity,
  getManualActivity,
  updateManualActivity,
  deleteManualActivity
};

function createManualActivityRouter({
  manualActivityService = defaultManualActivityService,
  authService = defaultAuthService
} = {}) {
  const router = express.Router();
  const requireAuth = authenticate(authService);

  router.post(
    '/manual-activities',
    requireAuth,
    asyncHandler(async (req, res) => {
      requireAdmin(req.user);
      const activity = await manualActivityService.createManualActivity(parseManualActivity(req.body), req.user);
      statsCache.clear();
      sendCreated(res, activity);
    })
  );

  router.get(
    '/manual-activities/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const activity = await manualActivityService.getManualActivity(parsePositiveId(req.params.id), req.user);
      sendData(res, activity);
    })
  );

  router.put(
    '/manual-activities/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      requireAdmin(req.user);
      const activity = await manualActivityService.updateManualActivity(
        parsePositiveId(req.params.id),
        parseManualActivity(req.body),
        req.user
      );
      statsCache.clear();
      sendData(res, activity);
    })
  );

  router.delete(
    '/manual-activities/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      requireAdmin(req.user);
      const result = await manualActivityService.deleteManualActivity(parsePositiveId(req.params.id), req.user);
      statsCache.clear();
      sendData(res, result);
    })
  );

  return router;
}

module.exports = createManualActivityRouter;
