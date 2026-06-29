const express = require('express');
const defaultActivityService = require('../services/activityService');
const defaultAuthService = require('../services/authService');
const { asyncHandler } = require('../http');
const { optionalAuthenticate } = require('../middleware/authMiddleware');
const { parseDashboardFilters, sendCachedStats } = require('./analyticsHelpers');

function createDashboardRouter(activityService = defaultActivityService, authService = defaultAuthService) {
  const router = express.Router();

  router.get('/dashboard/overview', optionalAuthenticate(authService), asyncHandler((req, res) =>
    sendCachedStats(req, res, () => activityService.getDashboardOverview(parseDashboardFilters(req.query, req.user)))
  ));

  router.get('/dashboard/health', optionalAuthenticate(authService), asyncHandler(async (req, res) => {
    const date = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : null;
    const data = await activityService.getTodayHealth(req.user?.id || 1, date);
    res.json(data);
  }));

  return router;
}

module.exports = createDashboardRouter;
