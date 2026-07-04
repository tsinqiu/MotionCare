const db = require('../db');
const { ApiError } = require('../errors');

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
  'elevation_gain_m',
  'elevation_loss_m',
  'raw_json'
];

const MAX_ACCURACY_M = 80;
const MIN_MOVING_SEGMENT_M = 1;

function toWorkout(row) {
  return {
    id: row.id,
    userId: row.userId,
    activityType: row.activityType,
    status: row.status,
    startedAt: row.startedAt,
    pausedDurationS: Number(row.pausedDurationS || 0),
    finishedAt: row.finishedAt,
    activityId: row.activityId
  };
}

function toPoint(row) {
  return {
    sampleIndex: row.sampleIndex,
    sampleTimeUtc: row.sampleTimeUtc,
    latitude: row.latitude,
    longitude: row.longitude,
    altitudeM: row.altitudeM,
    distanceM: row.distanceM,
    speedMps: row.speedMps,
    heartRateBpm: row.heartRateBpm,
    cadence: row.cadence,
    powerW: row.powerW,
    accuracyM: row.accuracyM,
    bearingDeg: row.bearingDeg,
    provider: row.provider,
    isAccepted: row.isAccepted == null ? null : Boolean(row.isAccepted),
    rejectReason: row.rejectReason
  };
}

async function queryRows(client, sql, params = []) {
  if (client === db) {
    return db.query(sql, params);
  }
  const [rows] = await client.query(sql, params);
  return rows;
}

async function getWorkoutRow(workoutId, user, client = db, lock = false) {
  const rows = await queryRows(
    client,
    `
      SELECT
        id,
        user_id AS userId,
        activity_type AS activityType,
        status,
        started_at AS startedAt,
        paused_at AS pausedAt,
        paused_duration_s AS pausedDurationS,
        finished_at AS finishedAt,
        activity_id AS activityId
      FROM WorkoutSessions
      WHERE id = ? AND user_id = ?
      LIMIT 1
      ${lock ? 'FOR UPDATE' : ''}
    `,
    [workoutId, user.id]
  );

  const workout = rows[0];
  if (!workout) {
    throw new ApiError(404, 'workout not found', 'NOT_FOUND');
  }
  return workout;
}

async function getWorkout(workoutId, user) {
  return toWorkout(await getWorkoutRow(workoutId, user));
}

async function createWorkout(payload, user) {
  const result = await db.query(
    `
      INSERT INTO WorkoutSessions (user_id, activity_type, status, started_at, paused_duration_s, raw_json)
      VALUES (?, ?, 'active', ?, 0, ?)
    `,
    [user.id, payload.activityType, payload.startedAt, JSON.stringify({ createPayload: payload })]
  );

  return getWorkout(result.insertId, user);
}

async function appendTrackPoints(workoutId, points, user) {
  const workout = await getWorkoutRow(workoutId, user);
  if (workout.status !== 'active') {
    throw new ApiError(400, 'track points can only be added to an active workout', 'VALIDATION_ERROR');
  }

  const maxRows = await db.query(
    'SELECT COALESCE(MAX(sample_index), -1) AS maxIndex FROM WorkoutTrackPoints WHERE workout_session_id = ?',
    [workoutId]
  );
  const startIndex = Number(maxRows[0]?.maxIndex ?? -1) + 1;

  await db.transaction(async (connection) => {
    for (const [index, point] of points.entries()) {
      const sampleIndex = point.sampleIndex ?? startIndex + index;
      await connection.query(
        `
          INSERT INTO WorkoutTrackPoints (
            workout_session_id, sample_index, sample_time_utc, latitude, longitude, altitude_m,
            distance_m, speed_mps, heart_rate_bpm, cadence, power_w,
            accuracy_m, bearing_deg, provider, is_accepted, reject_reason, raw_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          workoutId,
          sampleIndex,
          point.sampleTimeUtc,
          point.latitude,
          point.longitude,
          point.altitudeM,
          point.distanceM,
          point.speedMps,
          point.heartRateBpm,
          point.cadence,
          point.powerW,
          point.accuracyM,
          point.bearingDeg,
          point.provider,
          point.isAccepted,
          point.rejectReason,
          JSON.stringify(point)
        ]
      );
    }
  });

  return {
    workoutId,
    inserted: points.length
  };
}

async function pauseWorkout(workoutId, user) {
  const workout = await getWorkoutRow(workoutId, user);
  if (workout.status !== 'active') {
    throw new ApiError(400, 'only active workouts can be paused', 'VALIDATION_ERROR');
  }

  await db.query("UPDATE WorkoutSessions SET status = 'paused', paused_at = NOW(3) WHERE id = ?", [workoutId]);
  return getWorkout(workoutId, user);
}

async function resumeWorkout(workoutId, user) {
  const workout = await getWorkoutRow(workoutId, user);
  if (workout.status !== 'paused') {
    throw new ApiError(400, 'only paused workouts can be resumed', 'VALIDATION_ERROR');
  }

  await db.query(
    `
      UPDATE WorkoutSessions
      SET
        status = 'active',
        paused_duration_s = paused_duration_s + GREATEST(TIMESTAMPDIFF(SECOND, paused_at, NOW(3)), 0),
        paused_at = NULL
      WHERE id = ?
    `,
    [workoutId]
  );
  return getWorkout(workoutId, user);
}

async function cancelWorkout(workoutId, user) {
  const workout = await getWorkoutRow(workoutId, user);
  if (workout.status === 'finished') {
    throw new ApiError(400, 'finished workouts cannot be canceled', 'VALIDATION_ERROR');
  }

  await db.query("UPDATE WorkoutSessions SET status = 'canceled', finished_at = NOW(3) WHERE id = ?", [workoutId]);
  return getWorkout(workoutId, user);
}

function secondsBetween(start, end) {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return 1;
  }
  return Math.max(1, Math.round((endMs - startMs) / 1000));
}

function haversineM(a, b) {
  if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) {
    return 0;
  }
  const radiusM = 6371000;
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radiusM * Math.asin(Math.sqrt(h));
}

function maxAcceptedSpeedMps(activityType) {
  return String(activityType || '').includes('cycling') || String(activityType || '').includes('biking')
    ? 25
    : 12;
}

function timestampMs(point) {
  const value = new Date(point.sampleTimeUtc).getTime();
  return Number.isFinite(value) ? value : null;
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function measuredSpeed(point) {
  const speed = Number(point.speedMps);
  return Number.isFinite(speed) && speed >= 0 ? speed : null;
}

function markPoint(point, isAccepted, rejectReason, distanceM, speedMps) {
  return {
    ...point,
    distanceM,
    speedMps,
    isAccepted,
    rejectReason: isAccepted ? null : rejectReason
  };
}

function processTrackPoints(points, workout) {
  const maxSpeed = maxAcceptedSpeedMps(workout.activityType);
  const processed = [];
  const accepted = [];
  let cumulativeDistanceM = 0;

  for (const point of points) {
    const explicitReject = point.isAccepted === false;
    const accuracyM = Number(point.accuracyM);
    const pointTimeMs = timestampMs(point);
    const previous = accepted.at(-1);
    const previousTimeMs = previous ? timestampMs(previous) : null;
    let rejectReason = null;
    let segmentDistanceM = 0;
    let segmentSpeedMps = measuredSpeed(point);

    if (point.latitude == null || point.longitude == null) {
      rejectReason = 'missing_coordinate';
    } else if (explicitReject) {
      rejectReason = point.rejectReason || 'client_rejected';
    } else if (Number.isFinite(accuracyM) && accuracyM > MAX_ACCURACY_M) {
      rejectReason = 'low_accuracy';
    } else if (previous && pointTimeMs != null && previousTimeMs != null && pointTimeMs <= previousTimeMs) {
      rejectReason = 'non_increasing_time';
    } else if (previous) {
      const deltaSeconds = pointTimeMs != null && previousTimeMs != null
        ? Math.max((pointTimeMs - previousTimeMs) / 1000, 0)
        : null;
      segmentDistanceM = haversineM(previous, point);
      const fallbackSpeedMps = deltaSeconds && deltaSeconds > 0 ? segmentDistanceM / deltaSeconds : null;
      segmentSpeedMps = segmentSpeedMps ?? fallbackSpeedMps;

      if (deltaSeconds !== null && deltaSeconds <= 0) {
        rejectReason = 'non_increasing_time';
      } else if (fallbackSpeedMps !== null && fallbackSpeedMps > maxSpeed) {
        rejectReason = 'gps_jump';
      } else if (segmentSpeedMps !== null && segmentSpeedMps > maxSpeed) {
        rejectReason = 'speed_outlier';
      } else if (segmentDistanceM < MIN_MOVING_SEGMENT_M) {
        rejectReason = 'stationary_drift';
      }
    }

    if (rejectReason) {
      processed.push(markPoint(point, false, rejectReason, cumulativeDistanceM, segmentSpeedMps));
      continue;
    }

    cumulativeDistanceM += segmentDistanceM;
    const acceptedPoint = markPoint(point, true, null, cumulativeDistanceM, segmentSpeedMps);
    accepted.push(acceptedPoint);
    processed.push(acceptedPoint);
  }

  return { processed, accepted, distanceM: cumulativeDistanceM };
}

function summarizePoints(points, workout, payload) {
  const quality = processTrackPoints(points, workout);
  if (quality.accepted.length === 0) {
    throw new ApiError(400, 'workout must contain at least one accepted track point before finish', 'VALIDATION_ERROR');
  }

  const first = quality.accepted[0];
  const last = quality.accepted[quality.accepted.length - 1];
  const elapsedDurationS = payload.durationS || secondsBetween(first.sampleTimeUtc || workout.startedAt, last.sampleTimeUtc || new Date());
  const movingDurationS = Math.max(1, elapsedDurationS - Number(workout.pausedDurationS || 0));
  const distanceM = quality.distanceM;
  const heartRates = quality.accepted.map((point) => Number(point.heartRateBpm)).filter(Number.isFinite);
  const speeds = quality.accepted.map((point) => Number(point.speedMps)).filter(Number.isFinite);
  const cadences = quality.accepted.map((point) => Number(point.cadence)).filter(Number.isFinite);
  const powers = quality.accepted.map((point) => Number(point.powerW)).filter(Number.isFinite);
  const elevations = quality.accepted.map((point) => Number(point.altitudeM)).filter(Number.isFinite);
  const accuracies = quality.accepted.map((point) => Number(point.accuracyM)).filter(Number.isFinite);

  return {
    processedPoints: quality.processed,
    durationS: elapsedDurationS,
    movingDurationS,
    elapsedDurationS,
    distanceM,
    calories: payload.calories ?? null,
    avgSpeedMps: movingDurationS > 0 ? distanceM / movingDurationS : null,
    maxSpeedMps: speeds.length ? Math.max(...speeds) : null,
    avgHeartRateBpm: heartRates.length ? Math.round(heartRates.reduce((sum, value) => sum + value, 0) / heartRates.length) : null,
    maxHeartRateBpm: heartRates.length ? Math.max(...heartRates) : null,
    avgCadenceSpm: average(cadences),
    maxCadenceSpm: cadences.length ? Math.max(...cadences) : null,
    avgPowerW: powers.length ? Math.round(powers.reduce((sum, value) => sum + value, 0) / powers.length) : null,
    maxPowerW: powers.length ? Math.max(...powers) : null,
    elevationGainM: elevations.length ? Math.max(0, elevations[elevations.length - 1] - elevations[0]) : null,
    elevationLossM: null,
    startLatitude: first.latitude,
    startLongitude: first.longitude,
    endLatitude: last.latitude,
    endLongitude: last.longitude,
    quality: {
      totalPoints: points.length,
      acceptedPoints: quality.accepted.length,
      rejectedPoints: points.length - quality.accepted.length,
      medianAccuracyM: median(accuracies)
    }
  };
}

async function finishWorkout(workoutId, payload, user) {
  const activityId = await db.transaction(async (connection) => {
    const workout = await getWorkoutRow(workoutId, user, connection, true);
    if (!['active', 'paused'].includes(workout.status)) {
      throw new ApiError(400, 'only active or paused workouts can be finished', 'VALIDATION_ERROR');
    }

    const pointRows = await queryRows(
      connection,
      `
        SELECT
          sample_index AS sampleIndex,
          sample_time_utc AS sampleTimeUtc,
          latitude,
          longitude,
          altitude_m AS altitudeM,
          distance_m AS distanceM,
          speed_mps AS speedMps,
          heart_rate_bpm AS heartRateBpm,
          cadence,
          power_w AS powerW,
          accuracy_m AS accuracyM,
          bearing_deg AS bearingDeg,
          provider,
          is_accepted AS isAccepted,
          reject_reason AS rejectReason
        FROM WorkoutTrackPoints
        WHERE workout_session_id = ?
        ORDER BY sample_index ASC
      `,
      [workoutId]
    );
    const points = pointRows.map(toPoint);
    if (points.length === 0) {
      throw new ApiError(400, 'workout must contain at least one track point before finish', 'VALIDATION_ERROR');
    }

    const summary = summarizePoints(points, workout, payload);
    const activityKey = `workout:${user.id}:${workoutId}`;
    const activityName = payload.activityName || `Workout ${workout.activityType}`;
    const startedAt = workout.startedAt;
    const rawJson = JSON.stringify({ workoutId, finishPayload: payload, summary });

    const [activityResult] = await connection.query(
      `
        INSERT INTO Activities (
          activity_key, activity_name, activity_type, start_time_utc, local_start_time,
          location_name, start_latitude, start_longitude, end_latitude, end_longitude,
          owner_user_id, data_source, is_manual, match_status, raw_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'live_workout', FALSE, 'live_recorded', ?)
      `,
      [
        activityKey,
        activityName,
        workout.activityType,
        startedAt,
        startedAt,
        payload.locationName || null,
        summary.startLatitude,
        summary.startLongitude,
        summary.endLatitude,
        summary.endLongitude,
        user.id,
        rawJson
      ]
    );
    const newActivityId = activityResult.insertId;

    await connection.query(
      `
        INSERT INTO ActivitySummaries (activity_id, ${SUMMARY_COLUMNS.join(', ')})
        VALUES (?, ${SUMMARY_COLUMNS.map(() => '?').join(', ')})
      `,
      [
        newActivityId,
        summary.durationS,
        summary.movingDurationS,
        summary.elapsedDurationS,
        summary.distanceM,
        summary.calories,
        summary.avgSpeedMps,
        summary.maxSpeedMps,
        summary.avgHeartRateBpm,
        summary.maxHeartRateBpm,
        summary.avgCadenceSpm,
        summary.maxCadenceSpm,
        summary.avgPowerW,
        summary.maxPowerW,
        summary.elevationGainM,
        summary.elevationLossM,
        rawJson
      ]
    );

    for (const point of summary.processedPoints) {
      await connection.query(
        `
          INSERT INTO TrackPoints (
            activity_id, sample_index, sample_time_utc, latitude, longitude, altitude_m,
            distance_m, speed_mps, heart_rate_bpm, cadence, power_w,
            accuracy_m, bearing_deg, provider, is_accepted, reject_reason
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          newActivityId,
          point.sampleIndex,
          point.sampleTimeUtc,
          point.latitude,
          point.longitude,
          point.altitudeM,
          point.distanceM,
          point.speedMps,
          point.heartRateBpm,
          point.cadence,
          point.powerW,
          point.accuracyM,
          point.bearingDeg,
          point.provider,
          point.isAccepted,
          point.rejectReason
        ]
      );
    }

    await connection.query(
      `
        UPDATE WorkoutSessions
        SET status = 'finished', finished_at = NOW(3), activity_id = ?
        WHERE id = ?
      `,
      [newActivityId, workoutId]
    );

    return newActivityId;
  });

  return {
    ...(await getWorkout(workoutId, user)),
    activityId
  };
}

module.exports = {
  createWorkout,
  getWorkout,
  appendTrackPoints,
  pauseWorkout,
  resumeWorkout,
  finishWorkout,
  cancelWorkout
};
