const express = require('express');
const defaultActivityService = require('../services/activityService');
const defaultAuthService = require('../services/authService');
const { asyncHandler } = require('../http');
const { optionalAuthenticate } = require('../middleware/authMiddleware');
const { sendData } = require('../response');
const { parseTrainingFilters, sendCachedStats } = require('./analyticsHelpers');

function createTrainingRouter(activityService = defaultActivityService, authService = defaultAuthService) {
  const router = express.Router();

  router.get('/training/load-balance', optionalAuthenticate(authService), asyncHandler((req, res) =>
    sendCachedStats(req, res, () => activityService.getLoadBalance(parseTrainingFilters(req.query, req.user)))
  ));

  router.get('/training/garmin-import-summary', optionalAuthenticate(authService), asyncHandler(async (req, res) => {
    const data = await activityService.getGarminImportSummary(req.user?.id || 1);
    sendData(res, data);
  }));

  return router;
}

module.exports = createTrainingRouter;
