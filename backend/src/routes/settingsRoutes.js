const express = require('express');
const db = require('../db');
const defaultAuthService = require('../services/authService');
const { ApiError } = require('../errors');
const { asyncHandler } = require('../http');
const { authenticate } = require('../middleware/authMiddleware');
const { sendData } = require('../response');

const DEFAULT_SETTINGS = {
  distanceUnit: 'km',
  weightUnit: 'kg',
  temperatureUnit: 'c',
  paceUnit: 'min_per_km',
  defaultPrivacy: 'private',
  hideMapEndpoints: true,
  healthSync: false
};

const ALLOWED = {
  distanceUnit: ['km', 'mi'],
  weightUnit: ['kg', 'lb'],
  temperatureUnit: ['c', 'f'],
  paceUnit: ['min_per_km', 'min_per_mile'],
  defaultPrivacy: ['private', 'followers', 'public']
};

function parseBoolean(value, name) {
  if (typeof value !== 'boolean') {
    throw new ApiError(400, `${name} must be a boolean`, 'VALIDATION_ERROR');
  }
  return value;
}

function parseSettingEnum(body, name) {
  if (body[name] === undefined) {
    return undefined;
  }
  if (!ALLOWED[name].includes(body[name])) {
    throw new ApiError(400, `${name} is not supported`, 'VALIDATION_ERROR');
  }
  return body[name];
}

function parseSettingsPatch(body) {
  const payload = {};
  for (const name of Object.keys(ALLOWED)) {
    const value = parseSettingEnum(body, name);
    if (value !== undefined) {
      payload[name] = value;
    }
  }

  for (const name of ['hideMapEndpoints', 'healthSync']) {
    if (body[name] !== undefined) {
      payload[name] = parseBoolean(body[name], name);
    }
  }

  return payload;
}

function toSettings(row) {
  if (!row) {
    return { ...DEFAULT_SETTINGS };
  }

  return {
    distanceUnit: row.distanceUnit || DEFAULT_SETTINGS.distanceUnit,
    weightUnit: row.weightUnit || DEFAULT_SETTINGS.weightUnit,
    temperatureUnit: row.temperatureUnit || DEFAULT_SETTINGS.temperatureUnit,
    paceUnit: row.paceUnit || DEFAULT_SETTINGS.paceUnit,
    defaultPrivacy: row.defaultPrivacy || DEFAULT_SETTINGS.defaultPrivacy,
    hideMapEndpoints: Boolean(row.hideMapEndpoints),
    healthSync: Boolean(row.healthSync)
  };
}

async function getSettings(user) {
  const rows = await db.query(
    `
      SELECT
        distance_unit AS distanceUnit,
        weight_unit AS weightUnit,
        temperature_unit AS temperatureUnit,
        pace_unit AS paceUnit,
        default_privacy AS defaultPrivacy,
        hide_map_endpoints AS hideMapEndpoints,
        health_sync AS healthSync
      FROM UserSettings
      WHERE user_id = ?
      LIMIT 1
    `,
    [user.id]
  );

  return toSettings(rows[0]);
}

async function updateSettings(payload, user) {
  const current = await getSettings(user);
  const next = { ...current, ...payload };

  await db.query(
    `
      INSERT INTO UserSettings (
        user_id, distance_unit, weight_unit, temperature_unit, pace_unit,
        default_privacy, hide_map_endpoints, health_sync
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        distance_unit = VALUES(distance_unit),
        weight_unit = VALUES(weight_unit),
        temperature_unit = VALUES(temperature_unit),
        pace_unit = VALUES(pace_unit),
        default_privacy = VALUES(default_privacy),
        hide_map_endpoints = VALUES(hide_map_endpoints),
        health_sync = VALUES(health_sync)
    `,
    [
      user.id,
      next.distanceUnit,
      next.weightUnit,
      next.temperatureUnit,
      next.paceUnit,
      next.defaultPrivacy,
      next.hideMapEndpoints,
      next.healthSync
    ]
  );

  return next;
}

const defaultSettingsService = { getSettings, updateSettings };

function createSettingsRouter({ settingsService = defaultSettingsService, authService = defaultAuthService } = {}) {
  const router = express.Router();
  const requireAuth = authenticate(authService);

  router.get(
    '/settings',
    requireAuth,
    asyncHandler(async (req, res) => {
      sendData(res, await settingsService.getSettings(req.user));
    })
  );

  router.put(
    '/settings',
    requireAuth,
    asyncHandler(async (req, res) => {
      sendData(res, await settingsService.updateSettings(parseSettingsPatch(req.body), req.user));
    })
  );

  return router;
}

module.exports = createSettingsRouter;
