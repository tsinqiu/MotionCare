const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const config = require('./config');
const { ApiError } = require('./errors');
const createAuthRouter = require('./routes/authRoutes');
const createAdminUserRouter = require('./routes/adminUserRoutes');
const createHealthRouter = require('./routes/healthRoutes');
const defaultHealthService = require('./services/healthService');
const createActivityRouter = require('./routes/activityRoutes');
const createStatsRouter = require('./routes/statsRoutes');
const createTrainingRouter = require('./routes/trainingRoutes');
const createDashboardRouter = require('./routes/dashboardRoutes');
const createMlRouter = require('./routes/mlRoutes');
const createAiRouter = require('./routes/aiRoutes');
const createManualActivityRouter = require('./routes/manualActivityRoutes');
const createWorkoutRouter = require('./routes/workoutRoutes');
const createSyncRouter = require('./routes/syncRoutes');
const createCommunityRouter = require('./routes/communityRoutes');
const createExploreRouter = require('./routes/exploreRoutes');
const createSettingsRouter = require('./routes/settingsRoutes');
const createShoeRouter = require('./routes/shoeRoutes');
const defaultShoeService = require('./services/shoeService');

function createApp({
  healthService = defaultHealthService,
  activityService,
  mlService,
  aiService,
  authService,
  manualActivityService,
  workoutService,
  syncService,
  communityService,
  exploreService,
  settingsService,
  shoeService,
  securityService,
  securityConfig = config.security
} = {}) {
  if (!shoeService) shoeService = defaultShoeService;
  const app = express();
  app.disable('x-powered-by');

  if (config.security.trustProxy) {
    app.set('trust proxy', 1);
  }

  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  }));

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || config.cors.origins.includes(origin)) {
          callback(null, true);
          return;
        }

        callback(new ApiError(403, 'origin is not allowed by CORS'));
      }
    })
  );
  app.use('/api', rateLimit({
    windowMs: securityConfig.globalRateLimitWindowMs,
    limit: securityConfig.globalRateLimitMax,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler(req, res) {
      res.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'too many requests' }
      });
    }
  }));
  app.use('/api/auth/login', rateLimit({
    windowMs: securityConfig.authRateLimitWindowMs,
    limit: securityConfig.authRateLimitMax,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    handler(req, res) {
      res.status(429).json({
        error: { code: 'AUTH_RATE_LIMITED', message: 'too many authentication requests' }
      });
    }
  }));
  app.use(express.json({ limit: config.security.jsonLimit }));
  app.use('/uploads', express.static(config.uploads.root));

  app.use('/api', createAuthRouter(authService, securityService));
  app.use('/api', createAdminUserRouter(authService));
  app.use('/api', createHealthRouter(healthService, authService));
  app.use('/api', createActivityRouter(activityService, authService));
  app.use('/api', createStatsRouter(activityService, authService));
  app.use('/api', createTrainingRouter(activityService, authService));
  app.use('/api', createDashboardRouter(activityService, authService));
  app.use('/api', createManualActivityRouter({ manualActivityService, authService }));
  app.use('/api', createWorkoutRouter({ workoutService, authService }));
  app.use('/api', createMlRouter(mlService, authService));
  app.use('/api', createAiRouter({ aiService, authService }));
  app.use('/api', createSyncRouter({ syncService, authService }));
  app.use('/api', createCommunityRouter({ communityService, authService }));
  app.use('/api', createExploreRouter(exploreService, authService));
  app.use('/api', createSettingsRouter({ settingsService, authService }));
  app.use('/api', createShoeRouter(shoeService, authService));

  app.use('/api', (req, res) => {
    res.status(404).json({ error: { code: 'ROUTE_NOT_FOUND', message: 'route not found' } });
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }

    const uploadLimitExceeded = error.code === 'LIMIT_FILE_SIZE';
    const payloadLimitExceeded = error.type === 'entity.too.large';
    const statusCode = uploadLimitExceeded ? 400 : payloadLimitExceeded ? 413 : error.statusCode || error.status || 500;
    res.status(statusCode).json({
      error: {
        code: uploadLimitExceeded
          ? 'INVALID_UPLOAD'
          : payloadLimitExceeded
            ? 'PAYLOAD_TOO_LARGE'
          : statusCode === 500 ? 'INTERNAL_SERVER_ERROR' : error.code || 'API_ERROR',
        message: uploadLimitExceeded
          ? 'uploaded file is too large'
          : payloadLimitExceeded
            ? 'request body is too large'
          : statusCode === 500 ? 'internal server error' : error.message
      }
    });
  });

  return app;
}

module.exports = createApp;
