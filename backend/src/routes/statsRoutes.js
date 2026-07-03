const express = require('express');
const defaultActivityService = require('../services/activityService');
const defaultAuthService = require('../services/authService');
const { ApiError } = require('../errors');
const { asyncHandler } = require('../http');
const { authenticate } = require('../middleware/authMiddleware');
const {
  TIMELINE_GROUPS,
  parseActivityFilters,
  parseEnum,
  parseSummaryFilters,
  parseTrendFilters,
  parseYearMonth,
  sendCachedStats
} = require('./analyticsHelpers');

function createStatsRouter(activityService = defaultActivityService, authService = defaultAuthService) {
  const router = express.Router();
  const requireAuth = authenticate(authService);

  router.get('/stats/activity-types', requireAuth, asyncHandler((req, res) =>
    sendCachedStats(req, res, () => activityService.getActivityTypeStats(parseActivityFilters(req.query, req.user)))
  ));

  router.get('/stats/summary', requireAuth, asyncHandler((req, res) =>
    sendCachedStats(req, res, () => activityService.getSummaryStats(parseSummaryFilters(req.query, req.user)))
  ));

  router.get('/stats/metric-trend', requireAuth, asyncHandler((req, res) =>
    sendCachedStats(req, res, () => activityService.getMetricTrend(parseTrendFilters(req.query, req.user)))
  ));

  router.get('/stats/calendar', requireAuth, asyncHandler((req, res) => {
    const month = parseYearMonth(req.query.month, 'month');
    if (!month) {
      throw new ApiError(400, 'month is required', 'INVALID_QUERY');
    }

    return sendCachedStats(req, res, () =>
      activityService.getCalendarStats({
        ...parseActivityFilters(req.query, req.user),
        month
      })
    );
  }));

  router.get('/stats/timeline', requireAuth, asyncHandler((req, res) =>
    sendCachedStats(req, res, () =>
      activityService.getTimelineStats({
        ...parseSummaryFilters(req.query, req.user),
        groupBy: parseEnum(req.query.group_by, TIMELINE_GROUPS, 'group_by', 'day')
      })
    )
  ));

  router.get('/stats/heart-rate-zones', requireAuth, asyncHandler((req, res) =>
    sendCachedStats(req, res, () => activityService.getHeartRateZones(parseActivityFilters(req.query, req.user)))
  ));

  router.get('/stats/personal-bests', requireAuth, asyncHandler((req, res) =>
    sendCachedStats(req, res, () => activityService.getPersonalBests(parseActivityFilters(req.query, req.user)))
  ));

  return router;
}

module.exports = createStatsRouter;
