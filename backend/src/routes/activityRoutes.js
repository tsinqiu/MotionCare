const express = require('express');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const multer = require('multer');
const defaultActivityService = require('../services/activityService');
const defaultWeatherService = require('../services/weatherService');
const defaultAuthService = require('../services/authService');
const config = require('../config');
const { ApiError } = require('../errors');
const { authenticate } = require('../middleware/authMiddleware');
const { parseOwnerFilter } = require('./analyticsHelpers');
const {
  asyncHandler,
  parseActivityType,
  parseDateRange,
  parseEnum,
  parseOffset,
  parsePage,
  parsePageSize,
  parseKeyword,
  parsePositiveId,
  parseSort
} = require('../http');
const { sendData, sendPaged } = require('../response');
const { removeUploadedFile, validateUploadedFile } = require('../services/uploadSecurity');

const ACTIVITY_SORT_FIELDS = [
  'local_start_time',
  'distance_m',
  'duration_s',
  'avg_heart_rate_bpm',
  'max_heart_rate_bpm',
  'avg_pace',
  'activity_training_load'
];
const SOURCE_FILTERS = ['garmin_import', 'manual_upload', 'live_workout'];

fs.mkdirSync(config.uploads.activityImagesDir, { recursive: true });

const activityImageStorage = multer.diskStorage({
  destination(req, file, callback) {
    callback(null, config.uploads.activityImagesDir);
  },
  filename(req, file, callback) {
    const extension = path.extname(file.originalname || '').slice(0, 16) || '.jpg';
    callback(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${extension}`);
  }
});

const uploadActivityImage = multer({
  storage: activityImageStorage,
  limits: { fileSize: config.uploads.maxImageBytes },
  fileFilter(req, file, callback) {
    if (!String(file.mimetype || '').startsWith('image/')) {
      callback(new ApiError(400, 'image file is required', 'INVALID_UPLOAD'));
      return;
    }
    callback(null, true);
  }
});

function createActivityRouter(activityService = defaultActivityService, authService = defaultAuthService) {
  const router = express.Router();
  const requireAuth = authenticate(authService);

  router.get(
    '/activities',
    requireAuth,
    asyncHandler(async (req, res) => {
      const pageSize = parsePageSize(req.query.page_size ?? req.query.limit, 50, 200);
      const page = req.query.page === undefined && req.query.offset !== undefined
        ? Math.floor(parseOffset(req.query.offset) / pageSize) + 1
        : parsePage(req.query.page);
      const offset = req.query.offset !== undefined ? parseOffset(req.query.offset) : (page - 1) * pageSize;
      const { startDate, endDate } = parseDateRange(req.query, { maxDays: 1095 });
      const { sortBy, sortOrder } = parseSort(req.query, ACTIVITY_SORT_FIELDS, 'local_start_time');
      const ownerFilter = parseOwnerFilter(req.query.owner, req.user);
      const source = parseEnum(req.query.source, SOURCE_FILTERS, 'source', undefined);

      const activities = await activityService.listActivities({
        activityType: parseActivityType(req.query.activity_type),
        startDate,
        endDate,
        keyword: parseKeyword(req.query.keyword),
        source,
        ...ownerFilter,
        limit: pageSize,
        offset,
        page,
        pageSize,
        sortBy,
        sortOrder
      });

      sendPaged(res, activities);
    })
  );

  router.get(
    '/activities/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const activityId = parsePositiveId(req.params.id, 'activity id');
      await activityService.assertActivityReadable(req.user, activityId);
      const activity = await activityService.getActivityById(activityId);

      if (!activity) {
        throw new ApiError(404, 'activity not found', 'ACTIVITY_NOT_FOUND');
      }

      sendData(res, activity);
    })
  );

  router.get(
    '/activities/:id/track-points',
    requireAuth,
    asyncHandler(async (req, res) => {
      const activityId = parsePositiveId(req.params.id, 'activity id');
      const limit = parsePageSize(req.query.limit, 1000, 5000);
      const offset = parseOffset(req.query.offset);
      await activityService.assertActivityReadable(req.user, activityId);
      const points = await activityService.getTrackPoints(activityId, { limit, offset });

      sendData(res, points);
    })
  );

  router.get(
    '/activities/:id/heart-rate',
    requireAuth,
    asyncHandler(async (req, res) => {
      const activityId = parsePositiveId(req.params.id, 'activity id');
      const limit = parsePageSize(req.query.limit, 2000, 10000);
      const offset = parseOffset(req.query.offset);
      await activityService.assertActivityReadable(req.user, activityId);
      const series = await activityService.getHeartRateSeries(activityId, { limit, offset });

      sendData(res, series);
    })
  );

  router.get(
    '/activities/:id/speed',
    requireAuth,
    asyncHandler(async (req, res) => {
      const activityId = parsePositiveId(req.params.id, 'activity id');
      const limit = parsePageSize(req.query.limit, 2000, 10000);
      const offset = parseOffset(req.query.offset);
      await activityService.assertActivityReadable(req.user, activityId);
      const series = await activityService.getSpeedSeries(activityId, { limit, offset });

      sendData(res, series);
    })
  );

  router.get(
    '/activities/:id/laps',
    requireAuth,
    asyncHandler(async (req, res) => {
      const activityId = parsePositiveId(req.params.id, 'activity id');
      await activityService.assertActivityReadable(req.user, activityId);
      const laps = await activityService.getLaps(activityId);

      sendData(res, laps);
    })
  );

  router.get(
    '/activities/:id/zones',
    requireAuth,
    asyncHandler(async (req, res) => {
      const activityId = parsePositiveId(req.params.id, 'activity id');
      await activityService.assertActivityReadable(req.user, activityId);
      const zones = await activityService.getZones(activityId);

      sendData(res, zones);
    })
  );

  router.route('/activities/:id')
    .patch(
      authenticate(authService),
      asyncHandler(async (req, res) => {
        const activityId = parsePositiveId(req.params.id, 'activity id');
        const activity = await activityService.updateActivityMeta(req.user, activityId, req.body);
        sendData(res, activity);
      })
    );

  router.post(
    '/activities/:id/photo',
    authenticate(authService),
    uploadActivityImage.single('photo'),
    asyncHandler(async (req, res) => {
      const file = req.file;
      if (!file) {
        throw new ApiError(400, 'photo file is required', 'INVALID_UPLOAD');
      }
      try {
        const activityId = parsePositiveId(req.params.id, 'activity id');
        await validateUploadedFile(file, { kind: 'image' });
        const activity = await activityService.updateActivityPhoto(req.user, activityId, {
          path: `/uploads/activity-images/${file.filename}`,
          originalName: file.originalname || null,
          mimeType: file.mimetype || null,
          size: file.size
        });
        sendData(res, activity);
      } catch (error) {
        await removeUploadedFile(file);
        throw error;
      }
    })
  );

  router.patch(
    '/activities/:id/weather',
    authenticate(authService),
    asyncHandler(async (req, res) => {
      const activityId = parsePositiveId(req.params.id, 'activity id');
      const activity = await activityService.updateActivityWeather(req.user, activityId, req.body, 'manual');
      sendData(res, activity);
    })
  );

  router.post(
    '/activities/:id/weather/fetch',
    authenticate(authService),
    asyncHandler(async (req, res) => {
      const activityId = parsePositiveId(req.params.id, 'activity id');
      const current = await activityService.getActivityById(activityId);
      if (!current) {
        throw new ApiError(404, 'activity not found');
      }
      const weatherPayload = await defaultWeatherService.fetchHistoricalWeatherForActivity(current);
      const activity = await activityService.updateActivityWeather(req.user, activityId, weatherPayload, 'open_meteo');
      sendData(res, activity);
    })
  );

  return router;
}

module.exports = createActivityRouter;
