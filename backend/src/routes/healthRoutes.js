const express = require('express');
const db = require('../db');
const { asyncHandler, parseDate, parseEnum } = require('../http');
const statsCache = require('../cache/statsCache');
const { sendData } = require('../response');

async function checkDatabase() {
  try {
    const ok = await db.ping();
    return {
      ok,
      message: ok ? 'connected' : 'query returned unexpected result'
    };
  } catch (error) {
    return {
      ok: false,
      message: error.message
    };
  }
}

const defaultHealthService = { checkDatabase };

function getUserId(req) {
  return req.user?.id || 1;
}

function createHealthRouter(healthService = defaultHealthService) {
  const router = express.Router();

  router.get(
    '/health',
    asyncHandler(async (req, res) => {
      const database = await healthService.checkDatabase();
      sendData(res, {
        status: database.ok ? 'ok' : 'degraded',
        database,
        cache: { stats: statsCache.stats() }
      });
    })
  );

  router.get(
    '/health/trends',
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      const metric = parseEnum(req.query.metric,
        ['hrv', 'resting_heart_rate', 'sleep_score', 'steps', 'stress', 'ftp'],
        'metric', 'hrv');
      const range = parseEnum(req.query.range, ['1m', '3m', '6m', '1y'], 'range', '3m');
      const data = await healthService.getHealthTrends(userId, metric, range);
      sendData(res, data);
    })
  );

  router.get(
    '/health/samples/:type',
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      const type = parseEnum(req.params.type,
        ['heart-rate', 'stress', 'steps', 'intensity-minutes', 'sleep-stages', 'sleep-movement', 'hrv'],
        'type', 'heart-rate');
      const date = parseDate(req.query.date, 'date') || new Date().toISOString().slice(0, 10);
      const source = req.query.source || null;
      const data = await healthService.getSamples(userId, type, date, source);
      sendData(res, data);
    })
  );

  router.get(
    '/health/training-status/latest',
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      const data = await healthService.getLatestTrainingStatus(userId);
      sendData(res, data);
    })
  );

  router.get(
    '/health/race-predictions/latest',
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      const data = await healthService.getLatestRacePredictions(userId);
      sendData(res, data);
    })
  );

  router.get(
    '/health/lactate-threshold/latest',
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      const data = await healthService.getLatestLactateThreshold(userId);
      sendData(res, data);
    })
  );

  router.get(
    '/health/cycling-ftp/latest',
    asyncHandler(async (req, res) => {
      const userId = getUserId(req);
      const data = await healthService.getLatestCyclingFtp(userId);
      sendData(res, data);
    })
  );

  return router;
}

module.exports = createHealthRouter;
