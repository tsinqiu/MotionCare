const express = require('express');
const defaultActivityService = require('../services/activityService');
const defaultAuthService = require('../services/authService');
const { asyncHandler } = require('../http');
const { authenticate } = require('../middleware/authMiddleware');
const { parseTrainingFilters, sendCachedStats } = require('./analyticsHelpers');

function createTrainingRouter(activityService = defaultActivityService, authService = defaultAuthService) {
  const router = express.Router();
  const requireAuth = authenticate(authService);

  router.get('/training/load-balance', requireAuth, asyncHandler((req, res) =>
    sendCachedStats(req, res, () => activityService.getLoadBalance(parseTrainingFilters(req.query, req.user)))
  ));

  return router;
}

module.exports = createTrainingRouter;
