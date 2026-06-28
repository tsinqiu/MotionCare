const express = require('express');
const db = require('../db');
const { asyncHandler } = require('../http');
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

function createHealthRouter(healthService = defaultHealthService) {
  const router = express.Router();

  router.get(
    '/health',
    asyncHandler(async (req, res) => {
      const database = await healthService.checkDatabase();
      sendData(res, {
        status: database.ok ? 'ok' : 'degraded',
        database,
        cache: {
          stats: statsCache.stats()
        }
      });
    })
  );

  return router;
}

module.exports = createHealthRouter;
