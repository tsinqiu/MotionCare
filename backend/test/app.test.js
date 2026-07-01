const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const createApp = require('../src/app');
const db = require('../src/db');
const statsCache = require('../src/cache/statsCache');
const activityServiceModule = require('../src/services/activityService');
const syncServiceModule = require('../src/services/syncService');
const workoutServiceModule = require('../src/services/workoutService');

function buildApp(overrides = {}) {
  const healthService = overrides.healthService || {
    checkDatabase: async () => ({ ok: true, message: 'connected' }),
    getHealthTrends: async () => [],
    getSamples: async () => [],
    getLatestTrainingStatus: async () => null,
    getLatestRacePredictions: async () => null,
    getLatestLactateThreshold: async () => null,
    getLatestCyclingFtp: async () => null
  };

  const activityService = overrides.activityService || {
    listActivities: async () => ({ items: [{ id: 1, activityType: 'running' }], page: 1, pageSize: 50, total: 1, totalPages: 1 }),
    getActivityById: async (id) => (id === 1 ? { id: 1, activityType: 'running' } : null),
    activityExists: async (id) => id === 1,
    assertActivityReadable: async (user, id) => {
      if (id !== 1) {
        const error = new Error('activity not found');
        error.statusCode = 404;
        error.code = 'ACTIVITY_NOT_FOUND';
        throw error;
      }
      return { id: 1, ownerUserId: user.id };
    },
    getTrackPoints: async () => [{ sampleIndex: 0, heartRateBpm: 150 }],
    getHeartRateSeries: async () => [{ sampleTimeUtc: '2026-06-01T00:00:00.000Z', heartRateBpm: 150 }],
    getSpeedSeries: async () => [{ sampleTimeUtc: '2026-06-01T00:00:00.000Z', speedMps: 3.2 }],
    getLaps: async () => [{ lapIndex: 0, totalDistanceM: 1000 }],
    getZones: async () => [{ zoneType: 'heart_rate', zoneIndex: 1, durationS: 300 }],
    getActivityTypeStats: async () => [{ activityType: 'running', activityCount: 1 }],
    getSummaryStats: async () => ({ activityCount: 1, totalDistanceKm: 5 }),
    getTimelineStats: async () => [{ period: '2026-06-01', activityCount: 1 }],
    getMetricTrend: async () => [{ date: '2026-06-01', value: 150, sampleCount: 1, activities: [] }],
    getCalendarStats: async () => ({ month: '2026-06', days: [] }),
    getHeartRateZones: async () => [{ zone: 'Zone 1', label: '轻松' }],
    getLoadBalance: async () => [{ date: '2026-06-01', dailyTrainingLoad: 100, ctl: 20, atl: 50, tsb: -30, activities: [] }],
    getPersonalBests: async () => ({ steps: [], running: [], cycling: [], swimming: [], overall: [] }),
    getDashboardOverview: async () => ({ recentActivities: [], monthlySummary: {}, yearlySummary: {}, trainingLoad: [], personalBests: {} }),
    getTodayHealth: async () => ({ steps: 1000 })
  };

  const mlService = overrides.mlService || {
    FEATURE_NAMES: [
      'distanceM',
      'durationS',
      'movingDurationS',
      'elapsedDurationS',
      'avgSpeedMps',
      'maxSpeedMps',
      'avgHeartRateBpm',
      'maxHeartRateBpm',
      'avgCadenceSpm',
      'maxCadenceSpm',
      'elevationGainM',
      'elevationLossM',
      'avgStrideLengthCm',
      'normalizedPowerW'
    ],
    getHealth: async () => ({ status: 'ok', modelVersion: 'running-v1' }),
    runPrediction: async () => ({
      predictedTrainingLoadLevel: 'medium',
      fatigueRisk: 'medium',
      recoveryAdvice: 'keep recovery balanced',
      confidence: 0.82,
      modelVersion: 'running-v1'
    })
  };

  const aiService = overrides.aiService || {
    getHealth: async () => ({
      status: 'fallback',
      provider: 'ollama',
      model: 'qwen2.5:3b-instruct',
      ollamaAvailable: false,
      modelAvailable: false,
      fallbackRules: true
    }),
    chat: async (payload, user) => ({
      data: {
        role: 'assistant',
        content: `规则建议：${payload.message}`,
        userId: user.id
      },
      meta: { ai: { provider: 'rules', fallback: true } }
    }),
    getDailyBrief: async (user) => ({
      data: {
        headline: '负荷平稳',
        sections: [
          { key: 'recent', title: '近期运动', tone: 'good', text: '近期运动稳定。' },
          { key: 'body', title: '身体状态', tone: 'steady', text: '状态平稳。' },
          { key: 'today', title: '今日安排', tone: 'steady', text: '建议轻松有氧。' }
        ],
        metrics: [],
        recommendation: '建议轻松有氧。',
        userId: user.id
      },
      meta: { ai: { provider: 'rules', fallback: true } }
    }),
    analyzeActivity: async (payload, user) => {
      if (payload.activityId === 999) {
        const error = new Error('activity not found');
        error.statusCode = 404;
        error.code = 'ACTIVITY_NOT_FOUND';
        throw error;
      }
      return {
        data: {
          headline: '运动智能分析',
          summary: '本次运动完成稳定。',
          insights: [],
          suggestions: ['注意恢复。'],
          userId: user.id
        },
        meta: { ai: { provider: 'rules', fallback: true } }
      };
    }
  };

  const authService = overrides.authService || {
    register: async ({ username, email }) => ({ user: { id: 2, username, email, role: 'user' }, token: 'registered-token' }),
    login: async ({ email }) => ({ user: { id: 2, username: 'tester', email, role: 'user' }, token: 'login-token' }),
    verifyToken: async (token) => {
      if (token === 'valid-user-token') {
        return { id: 2, username: 'tester', email: 'tester@example.com', role: 'user', status: 'active' };
      }
      if (token === 'valid-admin-token') {
        return { id: 1, username: 'admin', email: 'admin@example.com', role: 'admin', status: 'active' };
      }
      const error = new Error('invalid token');
      error.statusCode = 401;
      error.code = 'INVALID_TOKEN';
      throw error;
    }
  };

  const securityService = overrides.securityService || {
    assertLoginAllowed: async () => undefined,
    recordLoginAttempt: async () => undefined,
    recordSecurityEvent: async () => undefined
  };

  const manualActivityService = overrides.manualActivityService || {
    createManualActivity: async () => ({ id: 10, activityType: 'running', isManual: true }),
    getManualActivity: async () => ({ id: 10, activityType: 'running', isManual: true }),
    updateManualActivity: async () => ({ id: 10, activityType: 'running', isManual: true }),
    deleteManualActivity: async () => ({ deleted: true, id: 10 })
  };

  const syncService = overrides.syncService || {
    listProviders: async () => [
      { provider: 'garmin', name: 'Garmin Connect', status: 'not_connected', adapterStatus: 'not_configured' },
      { provider: 'strava', name: 'Strava', status: 'not_connected', adapterStatus: 'not_configured' },
      { provider: 'coros', name: 'COROS', status: 'not_connected', adapterStatus: 'not_configured' },
      { provider: 'apple_health', name: 'Apple Health', status: 'not_connected', adapterStatus: 'not_configured' }
    ],
    updateProviderSettings: async (provider, payload) => ({ provider, ...payload }),
    getProviderAccount: async (provider) => ({ provider, exists: false, status: 'not_connected', email: null, lastSyncAt: null }),
    authorizeProvider: async (provider) => ({
      provider,
      status: 'pending_authorization',
      authorizationUrl: null,
      adapterStatus: 'not_configured'
    }),
    disconnectProvider: async (provider) => ({ provider, status: 'not_connected', disconnected: true }),
    createJob: async (payload) => ({
      id: 1,
      provider: payload.provider,
      jobType: payload.jobType,
      status: 'skipped',
      activityCount: 0,
      errorMessage: 'sync adapter is not configured'
    }),
    listJobs: async (filters) => ({ items: [], page: filters.page, pageSize: filters.pageSize, total: 0, totalPages: 0 }),
    listLogs: async (filters) => ({ items: [], page: filters.page, pageSize: filters.pageSize, total: 0, totalPages: 0 })
  };

  const settingsService = overrides.settingsService || {
    getSettings: async () => ({
      distanceUnit: 'km',
      weightUnit: 'kg',
      temperatureUnit: 'c',
      paceUnit: 'min_per_km',
      defaultPrivacy: 'private',
      hideMapEndpoints: true,
      healthSync: false
    }),
    updateSettings: async (payload) => ({
      distanceUnit: payload.distanceUnit || 'km',
      weightUnit: 'kg',
      temperatureUnit: 'c',
      paceUnit: 'min_per_km',
      defaultPrivacy: payload.defaultPrivacy || 'private',
      hideMapEndpoints: payload.hideMapEndpoints ?? true,
      healthSync: payload.healthSync ?? false
    })
  };

  const communityService = overrides.communityService || {
    listPosts: async (filters) => ({ items: [], page: filters.page, pageSize: filters.pageSize, total: 0, totalPages: 0 }),
    createPost: async (payload, user) => ({
      id: 1,
      userId: user.id,
      username: user.username,
      content: payload.content,
      activityId: payload.activityId,
      visibility: payload.visibility,
      likeCount: 0,
      commentCount: 0,
      shareCount: 0,
      likedByMe: false,
      createdAt: '2026-06-12 10:00:00.000'
    }),
    listComments: async (postId, filters) => ({ items: [], page: filters.page, pageSize: filters.pageSize, total: 0, totalPages: 0 }),
    createComment: async (postId, payload, user) => ({
      id: 1,
      postId,
      userId: user.id,
      username: user.username,
      content: payload.content,
      createdAt: '2026-06-12 10:00:00.000'
    }),
    likePost: async (postId, user) => ({ id: postId, likedByMe: true, likeCount: 1, userId: user.id }),
    unlikePost: async (postId) => ({ id: postId, likedByMe: false, likeCount: 0 }),
    sharePost: async (postId, payload) => ({ id: 1, postId, channel: payload.channel, shared: true })
  };

  const exploreService = overrides.exploreService || {
    listArticles: async (filters) => ({ items: [], page: filters.page, pageSize: filters.pageSize, total: 0, totalPages: 0 }),
    getArticleById: async (id) => ({ id, type: 'article', title: 'Training basics', tags: [], publishedAt: '2026-06-12 10:00:00.000' }),
    getRecommendations: async (filters) => ({ items: [], page: filters.page, pageSize: filters.pageSize, total: 0, totalPages: 0 })
  };

  const workoutService = overrides.workoutService || {
    createWorkout: async (payload, user) => ({
      id: 1,
      userId: user.id,
      activityType: payload.activityType,
      status: 'active',
      startedAt: payload.startedAt,
      pausedDurationS: 0,
      finishedAt: null,
      activityId: null
    }),
    getWorkout: async (id, user) => ({ id, userId: user.id, activityType: 'running', status: 'active', pausedDurationS: 0, activityId: null }),
    appendTrackPoints: async (id, points) => ({ workoutId: id, inserted: points.length }),
    pauseWorkout: async (id, user) => ({ id, userId: user.id, status: 'paused', pausedDurationS: 0 }),
    resumeWorkout: async (id, user) => ({ id, userId: user.id, status: 'active', pausedDurationS: 30 }),
    finishWorkout: async (id, payload, user) => ({ id, userId: user.id, status: 'finished', activityId: 99, ...payload }),
    cancelWorkout: async (id, user) => ({ id, userId: user.id, status: 'canceled', activityId: null })
  };

  return createApp({
    healthService,
    activityService,
    mlService,
    aiService,
    authService,
    securityService,
    manualActivityService,
    syncService,
    communityService,
    exploreService,
    settingsService,
    workoutService,
    securityConfig: overrides.securityConfig
  });
}

const manualPayload = {
  activityType: 'running',
  activityName: 'Manual Test Run',
  localStartTime: '2026-06-09 08:00:00',
  distanceM: 5000,
  durationS: 1800,
  movingDurationS: 1780,
  elapsedDurationS: 1850,
  avgSpeedMps: 2.8,
  maxSpeedMps: 4.5,
  avgHeartRateBpm: 150,
  maxHeartRateBpm: 175,
  avgCadenceSpm: 165,
  maxCadenceSpm: 190,
  elevationGainM: 30,
  elevationLossM: 30,
  avgStrideLengthCm: 100,
  normalizedPowerW: 220
};

test('GET /api/health returns service and database status', async () => {
  const response = await request(buildApp()).get('/api/health');

  assert.equal(response.status, 200);
  assert.equal(response.body.data.status, 'ok');
  assert.equal(response.body.data.database.ok, true);
  assert.equal(typeof response.body.data.cache.stats.size, 'number');
});

test('GET /api/ai/health requires login', async () => {
  const response = await request(buildApp()).get('/api/ai/health');

  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, 'AUTH_REQUIRED');
});

test('GET /api/ai/health returns provider status for authenticated user', async () => {
  const response = await request(buildApp())
    .get('/api/ai/health')
    .set('Authorization', 'Bearer valid-user-token');

  assert.equal(response.status, 200);
  assert.equal(response.body.data.provider, 'ollama');
  assert.equal(response.body.data.model, 'qwen2.5:3b-instruct');
  assert.equal(response.body.data.fallbackRules, true);
});

test('POST /api/ai/chat returns assistant answer with fallback meta', async () => {
  const response = await request(buildApp())
    .post('/api/ai/chat')
    .set('Authorization', 'Bearer valid-user-token')
    .send({ message: '今天适合训练吗？' });

  assert.equal(response.status, 200);
  assert.equal(response.body.data.role, 'assistant');
  assert.match(response.body.data.content, /今天适合训练/);
  assert.equal(response.body.meta.ai.fallback, true);
});

test('GET /api/ai/daily-brief returns stable brief structure', async () => {
  const response = await request(buildApp())
    .get('/api/ai/daily-brief')
    .set('Authorization', 'Bearer valid-user-token');

  assert.equal(response.status, 200);
  assert.equal(response.body.data.headline, '负荷平稳');
  assert.equal(response.body.data.sections.length, 3);
  assert.equal(response.body.meta.ai.provider, 'rules');
});

test('POST /api/ai/activity-analysis returns activity suggestions', async () => {
  const response = await request(buildApp())
    .post('/api/ai/activity-analysis')
    .set('Authorization', 'Bearer valid-user-token')
    .send({ activityId: 1 });

  assert.equal(response.status, 200);
  assert.equal(response.body.data.headline, '运动智能分析');
  assert.deepEqual(response.body.data.suggestions, ['注意恢复。']);
});

test('POST /api/ai/activity-analysis returns 404 for missing activity', async () => {
  const response = await request(buildApp())
    .post('/api/ai/activity-analysis')
    .set('Authorization', 'Bearer valid-user-token')
    .send({ activityId: 999 });

  assert.equal(response.status, 404);
  assert.equal(response.body.error.code, 'ACTIVITY_NOT_FOUND');
});

test('GET /api/health reports degraded database state', async () => {
  const response = await request(
    buildApp({
      healthService: {
        checkDatabase: async () => ({ ok: false, message: 'connection failed' })
      }
    })
  ).get('/api/health');

  assert.equal(response.status, 200);
  assert.equal(response.body.data.status, 'degraded');
  assert.equal(response.body.data.database.ok, false);
});

test('GET /api/training/garmin-import-summary is removed', async () => {
  const response = await request(buildApp())
    .get('/api/training/garmin-import-summary')
    .set('Authorization', 'Bearer valid-user-token');

  assert.equal(response.status, 404);
  assert.equal(response.body.error.code, 'ROUTE_NOT_FOUND');
});

test('GET /api/activities validates limit', async () => {
  const response = await request(buildApp())
    .get('/api/activities?limit=999')
    .set('Authorization', 'Bearer valid-user-token');

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'INVALID_QUERY');
  assert.match(response.body.error.message, /limit/);
});

test('GET /api/activities passes filters and sort options', async () => {
  let captured;
  const app = buildApp({
    activityService: {
      listActivities: async (filters) => {
        captured = filters;
        return { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 };
      },
      getActivityById: async () => null,
      activityExists: async () => true,
      getTrackPoints: async () => [],
      getHeartRateSeries: async () => [],
      getSpeedSeries: async () => [],
      getLaps: async () => [],
      getZones: async () => [],
      getActivityTypeStats: async () => [],
      getSummaryStats: async () => ({}),
      getTimelineStats: async () => []
    }
  });

  const response = await request(app)
    .get('/api/activities?activity_type=running&start_date=2026-06-01&end_date=2026-06-09&sort_by=distance_m&sort_order=asc&limit=20&offset=5')
    .set('Authorization', 'Bearer valid-admin-token');

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.data, []);
  assert.deepEqual(response.body.meta, { page: 1, pageSize: 20, total: 0, totalPages: 0 });
  assert.deepEqual(captured, {
    activityType: 'running',
    startDate: '2026-06-01',
    endDate: '2026-06-09',
    keyword: undefined,
    source: undefined,
    owner: 'mine',
    ownerUserId: 1,
    limit: 20,
    offset: 5,
    page: 1,
    pageSize: 20,
    sortBy: 'distance_m',
    sortOrder: 'asc'
  });
});

test('GET /api/activities treats activity_type=all as no activity filter', async () => {
  let captured;
  const app = buildApp({
    activityService: {
      listActivities: async (filters) => {
        captured = filters;
        return { items: [], page: 1, pageSize: 12, total: 0, totalPages: 0 };
      },
      getActivityById: async () => null,
      activityExists: async () => true,
      getTrackPoints: async () => [],
      getHeartRateSeries: async () => [],
      getSpeedSeries: async () => [],
      getLaps: async () => [],
      getZones: async () => []
    }
  });

  const response = await request(app)
    .get('/api/activities?page=2&page_size=12&activity_type=all&keyword=park&sort_by=local_start_time&sort_order=desc')
    .set('Authorization', 'Bearer valid-admin-token');

  assert.equal(response.status, 200);
  assert.equal(captured.activityType, undefined);
  assert.equal(captured.keyword, 'park');
  assert.equal(captured.page, 2);
  assert.equal(captured.pageSize, 12);
  assert.equal(captured.offset, 12);
});

test('GET /api/activities/:id returns 404 for missing activity', async () => {
  const response = await request(buildApp())
    .get('/api/activities/999')
    .set('Authorization', 'Bearer valid-user-token');

  assert.equal(response.status, 404);
  assert.equal(response.body.error.message, 'activity not found');
});

test('GET /api/activities/:id/track-points uses default paging', async () => {
  let captured;
  const app = buildApp({
    activityService: {
      listActivities: async () => [],
      getActivityById: async () => null,
      activityExists: async () => true,
      assertActivityReadable: async () => ({ id: 1, ownerUserId: 2 }),
      getTrackPoints: async (activityId, paging) => {
        captured = { activityId, paging };
        return [];
      },
      getHeartRateSeries: async () => [],
      getSpeedSeries: async () => [],
      getLaps: async () => [],
      getZones: async () => [],
      getActivityTypeStats: async () => [],
      getSummaryStats: async () => ({}),
      getTimelineStats: async () => []
    }
  });

  const response = await request(app)
    .get('/api/activities/1/track-points')
    .set('Authorization', 'Bearer valid-user-token');

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.data, []);
  assert.deepEqual(captured, {
    activityId: 1,
    paging: { limit: 1000, offset: 0 }
  });
});

test('GET /api/activities/:id/track-points returns 404 for missing activity', async () => {
  const response = await request(buildApp())
    .get('/api/activities/999/track-points')
    .set('Authorization', 'Bearer valid-user-token');

  assert.equal(response.status, 404);
  assert.equal(response.body.error.message, 'activity not found');
});

test('GET /api/stats/summary passes date filters', async () => {
  let captured;
  const app = buildApp({
    activityService: {
      listActivities: async () => [],
      getActivityById: async () => null,
      activityExists: async () => true,
      getTrackPoints: async () => [],
      getHeartRateSeries: async () => [],
      getSpeedSeries: async () => [],
      getLaps: async () => [],
      getZones: async () => [],
    getActivityTypeStats: async () => [],
    getSummaryStats: async (filters) => {
      captured = filters;
      return { activityCount: 2 };
    },
      getTimelineStats: async () => [],
      getMetricTrend: async () => [],
      getCalendarStats: async () => ({ month: '2026-06', days: [] }),
      getLoadBalance: async () => [],
      getDashboardOverview: async () => ({})
    }
  });

  const response = await request(app)
    .get('/api/stats/summary?start_date=2026-06-01&end_date=2026-06-09')
    .set('Authorization', 'Bearer valid-admin-token');

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.data, { activityCount: 2 });
  assert.deepEqual(captured, {
    activityType: undefined,
    startDate: '2026-06-01',
    endDate: '2026-06-09',
    keyword: undefined,
    source: undefined,
    owner: 'mine',
    ownerUserId: 1
  });
});

test('GET /api/stats/summary passes range filters', async () => {
  statsCache.clear();
  let captured;
  const app = buildApp({
    activityService: {
      listActivities: async () => [],
      getActivityById: async () => null,
      activityExists: async () => true,
      getTrackPoints: async () => [],
      getHeartRateSeries: async () => [],
      getSpeedSeries: async () => [],
      getLaps: async () => [],
      getZones: async () => [],
      getActivityTypeStats: async () => [],
      getSummaryStats: async (filters) => {
        captured = filters;
        return { activityCount: 3 };
      },
      getTimelineStats: async () => [],
      getMetricTrend: async () => [],
      getCalendarStats: async () => ({ month: '2026-06', days: [] }),
      getHeartRateZones: async () => [],
      getLoadBalance: async () => [],
      getPersonalBests: async () => ({ running: [], cycling: [], overall: [] }),
      getDashboardOverview: async () => ({})
    }
  });

  const response = await request(app)
    .get('/api/stats/summary?range=month&date=2026-06')
    .set('Authorization', 'Bearer valid-admin-token');

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.data, { activityCount: 3 });
  assert.equal(captured.range, 'month');
  assert.equal(captured.date, '2026-06');
  statsCache.clear();
});

test('GET /api/stats/timeline validates group_by', async () => {
  const response = await request(buildApp())
    .get('/api/stats/timeline?group_by=year')
    .set('Authorization', 'Bearer valid-user-token');

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'INVALID_QUERY');
});

test('GET /api/stats/timeline passes range filters', async () => {
  statsCache.clear();
  let captured;
  const app = buildApp({
    activityService: {
      listActivities: async () => ({ items: [], page: 1, pageSize: 50, total: 0, totalPages: 0 }),
      getActivityById: async () => null,
      activityExists: async () => true,
      getTrackPoints: async () => [],
      getHeartRateSeries: async () => [],
      getSpeedSeries: async () => [],
      getLaps: async () => [],
      getZones: async () => [],
      getActivityTypeStats: async () => [],
      getSummaryStats: async () => ({}),
      getTimelineStats: async (filters) => {
        captured = filters;
        return [];
      },
      getMetricTrend: async () => [],
      getCalendarStats: async () => ({ month: '2026-06', days: [] }),
      getHeartRateZones: async () => [],
      getLoadBalance: async () => [],
      getPersonalBests: async () => ({ running: [], cycling: [], overall: [] }),
      getDashboardOverview: async () => ({})
    }
  });

  const response = await request(app)
    .get('/api/stats/timeline?range=month&date=2026-06&group_by=day')
    .set('Authorization', 'Bearer valid-user-token');

  assert.equal(response.status, 200);
  assert.equal(captured.range, 'month');
  assert.equal(captured.date, '2026-06');
  assert.equal(captured.groupBy, 'day');
  statsCache.clear();
});

test('GET /api/stats/metric-trend returns trend points', async () => {
  statsCache.clear();
  let captured;
  const app = buildApp({
    activityService: {
      ...buildApp().locals?.activityService,
      listActivities: async () => ({ items: [], page: 1, pageSize: 50, total: 0, totalPages: 0 }),
      getActivityById: async () => null,
      activityExists: async () => true,
      getTrackPoints: async () => [],
      getHeartRateSeries: async () => [],
      getSpeedSeries: async () => [],
      getLaps: async () => [],
      getZones: async () => [],
      getActivityTypeStats: async () => [],
      getSummaryStats: async () => ({}),
      getTimelineStats: async () => [],
      getMetricTrend: async (filters) => {
        captured = filters;
        return [{ date: '2026-06-01', value: 150, sampleCount: 1, activities: [] }];
      },
      getCalendarStats: async () => ({ month: '2026-06', days: [] }),
      getHeartRateZones: async () => [],
      getLoadBalance: async () => [],
      getPersonalBests: async () => ({ running: [], cycling: [], overall: [] }),
      getDashboardOverview: async () => ({})
    }
  });

  const response = await request(app)
    .get('/api/stats/metric-trend?metric=avg_heart_rate_bpm&range=6m&end_date=2026-06-10')
    .set('Authorization', 'Bearer valid-user-token');

  assert.equal(response.status, 200);
  assert.equal(response.body.data[0].value, 150);
  assert.equal(captured.metric, 'avg_heart_rate_bpm');
  assert.equal(captured.range, '6m');
  assert.equal(captured.endDate, '2026-06-10');
  statsCache.clear();
});

test('GET /api/stats/metric-trend accepts frontend range options', async () => {
  statsCache.clear();
  const captured = [];
  const app = buildApp({
    activityService: {
      listActivities: async () => ({ items: [], page: 1, pageSize: 50, total: 0, totalPages: 0 }),
      getActivityById: async () => null,
      activityExists: async () => true,
      getTrackPoints: async () => [],
      getHeartRateSeries: async () => [],
      getSpeedSeries: async () => [],
      getLaps: async () => [],
      getZones: async () => [],
      getActivityTypeStats: async () => [],
      getSummaryStats: async () => ({}),
      getTimelineStats: async () => [],
      getMetricTrend: async (filters) => {
        captured.push(filters.range);
        return [];
      },
      getCalendarStats: async () => ({ month: '2026-06', days: [] }),
      getHeartRateZones: async () => [],
      getLoadBalance: async () => [],
      getPersonalBests: async () => ({ steps: [], running: [], cycling: [], swimming: [], overall: [] }),
      getDashboardOverview: async () => ({})
    }
  });

  const range42 = await request(app).get('/api/stats/metric-trend?metric=distance_m&range=42d').set('Authorization', 'Bearer valid-user-token');
  const range2y = await request(app).get('/api/stats/metric-trend?metric=distance_m&range=2y').set('Authorization', 'Bearer valid-user-token');

  assert.equal(range42.status, 200);
  assert.equal(range2y.status, 200);
  assert.deepEqual(captured, ['42d', '2y']);
  statsCache.clear();
});

test('GET /api/stats/metric-trend rejects unsupported metric', async () => {
  const response = await request(buildApp())
    .get('/api/stats/metric-trend?metric=left_right_balance')
    .set('Authorization', 'Bearer valid-user-token');

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'UNSUPPORTED_METRIC');
});

test('GET /api/stats/calendar returns month calendar data', async () => {
  statsCache.clear();
  const response = await request(buildApp())
    .get('/api/stats/calendar?month=2026-06')
    .set('Authorization', 'Bearer valid-user-token');

  assert.equal(response.status, 200);
  assert.equal(response.body.data.month, '2026-06');
  assert.deepEqual(response.body.data.days, []);
  statsCache.clear();
});

test('GET /api/stats/calendar requires valid month', async () => {
  const response = await request(buildApp())
    .get('/api/stats/calendar?month=2026')
    .set('Authorization', 'Bearer valid-user-token');

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'INVALID_QUERY');
});

test('GET /api/training/load-balance returns training series', async () => {
  statsCache.clear();
  let captured;
  const app = buildApp({
    activityService: {
      listActivities: async () => ({ items: [], page: 1, pageSize: 50, total: 0, totalPages: 0 }),
      getActivityById: async () => null,
      activityExists: async () => true,
      getTrackPoints: async () => [],
      getHeartRateSeries: async () => [],
      getSpeedSeries: async () => [],
      getLaps: async () => [],
      getZones: async () => [],
      getActivityTypeStats: async () => [],
      getSummaryStats: async () => ({}),
      getTimelineStats: async () => [],
      getMetricTrend: async () => [],
      getCalendarStats: async () => ({ month: '2026-06', days: [] }),
      getHeartRateZones: async () => [],
      getLoadBalance: async (filters) => {
        captured = filters;
        return [{ date: '2026-06-01', dailyTrainingLoad: 100, ctl: 20, atl: 50, tsb: -30, activities: [] }];
      },
      getPersonalBests: async () => ({ running: [], cycling: [], overall: [] }),
      getDashboardOverview: async () => ({})
    }
  });

  const response = await request(app)
    .get('/api/training/load-balance?range=1y&end_date=2026-06-10')
    .set('Authorization', 'Bearer valid-user-token');

  assert.equal(response.status, 200);
  assert.equal(response.body.data[0].tsb, -30);
  assert.equal(captured.range, '1y');
  assert.equal(captured.endDate, '2026-06-10');
  statsCache.clear();
});

test('GET /api/training/load-balance accepts frontend range options', async () => {
  statsCache.clear();
  const captured = [];
  const app = buildApp({
    activityService: {
      listActivities: async () => ({ items: [], page: 1, pageSize: 50, total: 0, totalPages: 0 }),
      getActivityById: async () => null,
      activityExists: async () => true,
      getTrackPoints: async () => [],
      getHeartRateSeries: async () => [],
      getSpeedSeries: async () => [],
      getLaps: async () => [],
      getZones: async () => [],
      getActivityTypeStats: async () => [],
      getSummaryStats: async () => ({}),
      getTimelineStats: async () => [],
      getMetricTrend: async () => [],
      getCalendarStats: async () => ({ month: '2026-06', days: [] }),
      getHeartRateZones: async () => [],
      getLoadBalance: async (filters) => {
        captured.push(filters.range);
        return [];
      },
      getPersonalBests: async () => ({ steps: [], running: [], cycling: [], swimming: [], overall: [] }),
      getDashboardOverview: async () => ({})
    }
  });

  const range42 = await request(app).get('/api/training/load-balance?range=42d').set('Authorization', 'Bearer valid-user-token');
  const range2y = await request(app).get('/api/training/load-balance?range=2y').set('Authorization', 'Bearer valid-user-token');

  assert.equal(range42.status, 200);
  assert.equal(range2y.status, 200);
  assert.deepEqual(captured, ['42d', '2y']);
  statsCache.clear();
});

test('GET /api/training/load-balance validates range', async () => {
  const response = await request(buildApp())
    .get('/api/training/load-balance?range=5y')
    .set('Authorization', 'Bearer valid-user-token');

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'INVALID_QUERY');
});

test('GET /api/dashboard/overview returns aggregated dashboard data', async () => {
  statsCache.clear();
  const response = await request(buildApp())
    .get('/api/dashboard/overview')
    .set('Authorization', 'Bearer valid-user-token');

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.data.recentActivities, []);
  assert.deepEqual(response.body.data.trainingLoad, []);
  statsCache.clear();
});

test('GET /api/ml/health returns model status', async () => {
  const response = await request(buildApp()).get('/api/ml/health');

  assert.equal(response.status, 200);
  assert.equal(response.body.data.status, 'ok');
  assert.equal(response.body.data.modelVersion, 'running-v1');
});

test('POST /api/ml/running-prediction requires login', async () => {
  const response = await request(buildApp()).post('/api/ml/running-prediction').send({ distanceM: 5000 });

  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, 'AUTH_REQUIRED');
});

test('POST /api/ml/running-prediction validates missing feature', async () => {
  const response = await request(buildApp())
    .post('/api/ml/running-prediction')
    .set('Authorization', 'Bearer valid-user-token')
    .send({ distanceM: 5000 });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'INVALID_ML_INPUT');
});

test('POST /api/ml/running-prediction returns running analysis result', async () => {
  const payload = {
    distanceM: 5000,
    durationS: 1800,
    movingDurationS: 1780,
    elapsedDurationS: 1850,
    avgSpeedMps: 2.8,
    maxSpeedMps: 4.5,
    avgHeartRateBpm: 150,
    maxHeartRateBpm: 175,
    avgCadenceSpm: 165,
    maxCadenceSpm: 190,
    elevationGainM: 30,
    elevationLossM: 30,
    avgStrideLengthCm: 100,
    normalizedPowerW: 220
  };

  const response = await request(buildApp())
    .post('/api/ml/running-prediction')
    .set('Authorization', 'Bearer valid-user-token')
    .send(payload);

  assert.equal(response.status, 200);
  assert.equal(response.body.data.predictedTrainingLoadLevel, 'medium');
  assert.equal(response.body.data.fatigueRisk, 'medium');
  assert.equal(response.body.data.modelVersion, 'running-v1');
});

test('POST /api/ml/running-prediction fills optional frontend detail fields', async () => {
  let captured;
  const app = buildApp({
    mlService: {
      FEATURE_NAMES: [
        'distanceM',
        'durationS',
        'movingDurationS',
        'elapsedDurationS',
        'avgSpeedMps',
        'maxSpeedMps',
        'avgHeartRateBpm',
        'maxHeartRateBpm',
        'avgCadenceSpm',
        'maxCadenceSpm',
        'elevationGainM',
        'elevationLossM',
        'avgStrideLengthCm',
        'normalizedPowerW'
      ],
      getHealth: async () => ({ status: 'ok' }),
      runPrediction: async (features) => {
        captured = features;
        return {
          predictedTrainingLoadLevel: 'medium',
          fatigueRisk: 'low',
          recoveryAdvice: 'ok',
          confidence: 0.75,
          modelVersion: 'running-v1'
        };
      }
    }
  });
  const payload = {
    distanceM: 5000,
    durationS: 1800,
    movingDurationS: 1780,
    elapsedDurationS: 1850,
    avgSpeedMps: 2.8,
    maxSpeedMps: 4.5,
    avgHeartRateBpm: 150,
    maxHeartRateBpm: 175,
    avgCadenceSpm: 165,
    elevationGainM: 30,
    elevationLossM: 30,
    avgStrideLengthCm: 100,
    avgPowerW: 210
  };

  const response = await request(app)
    .post('/api/ml/running-prediction')
    .set('Authorization', 'Bearer valid-user-token')
    .send(payload);

  assert.equal(response.status, 200);
  assert.equal(captured.maxCadenceSpm, 165);
  assert.equal(captured.normalizedPowerW, 210);
});

test('POST /api/ml/running-prediction allows local API origin', async () => {
  const payload = {
    distanceM: 5000,
    durationS: 1800,
    movingDurationS: 1780,
    elapsedDurationS: 1850,
    avgSpeedMps: 2.8,
    maxSpeedMps: 4.5,
    avgHeartRateBpm: 150,
    maxHeartRateBpm: 175,
    avgCadenceSpm: 165,
    maxCadenceSpm: 190,
    elevationGainM: 30,
    elevationLossM: 30,
    avgStrideLengthCm: 100,
    normalizedPowerW: 220
  };

  const response = await request(buildApp())
    .post('/api/ml/running-prediction')
    .set('Authorization', 'Bearer valid-user-token')
    .set('Origin', 'http://127.0.0.1:8089')
    .send(payload);

  assert.equal(response.status, 200);
  assert.equal(response.body.data.predictedTrainingLoadLevel, 'medium');
});

test('POST /api/auth/register returns user and token', async () => {
  const response = await request(buildApp())
    .post('/api/auth/register')
    .send({ username: 'tester', email: 'tester@example.com', password: 'password123' });

  assert.equal(response.status, 201);
  assert.equal(response.body.data.token, 'registered-token');
  assert.equal(response.body.data.user.email, 'tester@example.com');
});

test('GET /api/auth/me requires token', async () => {
  const response = await request(buildApp()).get('/api/auth/me');

  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, 'AUTH_REQUIRED');
});

test('GET /api/activities owner=mine requires login', async () => {
  const response = await request(buildApp()).get('/api/activities?owner=mine');

  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, 'AUTH_REQUIRED');
});

test('GET /api/activities owner=mine passes user id', async () => {
  let captured;
  const app = buildApp({
    activityService: {
      listActivities: async (filters) => {
        captured = filters;
        return { items: [], page: 1, pageSize: 50, total: 0, totalPages: 0 };
      },
      getActivityById: async () => null,
      activityExists: async () => true,
      getTrackPoints: async () => [],
      getHeartRateSeries: async () => [],
      getSpeedSeries: async () => [],
      getLaps: async () => [],
      getZones: async () => [],
      getActivityTypeStats: async () => [],
      getSummaryStats: async () => ({}),
      getTimelineStats: async () => [],
      getHeartRateZones: async () => [],
      getPersonalBests: async () => ({})
    }
  });

  const response = await request(app)
    .get('/api/activities?owner=mine&keyword=Manual')
    .set('Authorization', 'Bearer valid-user-token');

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.data, []);
  assert.equal(captured.owner, 'mine');
  assert.equal(captured.ownerUserId, 2);
  assert.equal(captured.keyword, 'Manual');
});

test('POST /api/manual-activities requires login', async () => {
  const response = await request(buildApp()).post('/api/manual-activities').send(manualPayload);

  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, 'AUTH_REQUIRED');
});

test('POST /api/manual-activities creates manual activity without running ML prediction', async () => {
  let capturedPayload;
  let predictionCalled = false;
  const app = buildApp({
    manualActivityService: {
      createManualActivity: async (payload, user) => {
        capturedPayload = { payload, user };
        return { id: 99, activityType: payload.activityType, isManual: true };
      },
      getManualActivity: async () => ({}),
      updateManualActivity: async () => ({}),
      deleteManualActivity: async () => ({})
    },
    mlService: {
      FEATURE_NAMES: [],
      getHealth: async () => ({}),
      runPrediction: async () => {
        predictionCalled = true;
        return {};
      }
    }
  });

  const response = await request(app)
    .post('/api/manual-activities')
    .set('Authorization', 'Bearer valid-admin-token')
    .send(manualPayload);

  assert.equal(response.status, 201);
  assert.equal(response.body.data.id, 99);
  assert.equal(capturedPayload.user.id, 1);
  assert.equal(capturedPayload.payload.activityType, 'running');
  assert.equal(predictionCalled, false);
});

test('POST /api/manual-activities allows normal users to create their own activity', async () => {
  let capturedUser;
  const response = await request(buildApp({
    manualActivityService: {
      createManualActivity: async (_payload, user) => {
        capturedUser = user;
        return { id: 10, activityType: 'running', isManual: true, ownerUserId: user.id };
      },
      getManualActivity: async () => ({}),
      updateManualActivity: async () => ({}),
      deleteManualActivity: async () => ({})
    }
  }))
    .post('/api/manual-activities')
    .set('Authorization', 'Bearer valid-user-token')
    .send(manualPayload);

  assert.equal(response.status, 201);
  assert.equal(response.body.data.ownerUserId, 2);
  assert.equal(capturedUser.id, 2);
});

test('PUT and DELETE /api/manual-activities/:id allow normal users to manage owned activities', async () => {
  const app = buildApp();
  const updated = await request(app)
    .put('/api/manual-activities/10')
    .set('Authorization', 'Bearer valid-user-token')
    .send(manualPayload);
  const deleted = await request(app)
    .delete('/api/manual-activities/10')
    .set('Authorization', 'Bearer valid-user-token');

  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.isManual, true);
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.data.deleted, true);
});

test('GET /api/manual-activities/:id hides activities owned by another user', async () => {
  const originalQuery = db.query;
  db.query = async (sql) => {
    if (sql.includes('FROM Activities a')) {
      return [{ id: 10, ownerUserId: 3, isManual: true, activityType: 'running' }];
    }
    return [];
  };

  try {
    const response = await request(createApp({
      authService: {
        verifyToken: async () => ({ id: 2, username: 'tester', role: 'user', status: 'active' })
      }
    }))
      .get('/api/manual-activities/10')
      .set('Authorization', 'Bearer valid-user-token');

    assert.equal(response.status, 404);
    assert.equal(response.body.error.code, 'ACTIVITY_NOT_FOUND');
  } finally {
    db.query = originalQuery;
  }
});

test('PUT and DELETE /api/manual-activities/:id allow administrators', async () => {
  const app = buildApp();
  const updated = await request(app)
    .put('/api/manual-activities/10')
    .set('Authorization', 'Bearer valid-admin-token')
    .send(manualPayload);
  const deleted = await request(app)
    .delete('/api/manual-activities/10')
    .set('Authorization', 'Bearer valid-admin-token');

  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.isManual, true);
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.data.deleted, true);
});

test('POST /api/manual-activities allows zero distance for non-distance activity', async () => {
  let capturedPayload;
  const app = buildApp({
    manualActivityService: {
      createManualActivity: async (payload) => {
        capturedPayload = payload;
        return { id: 100, activityType: payload.activityType, distanceM: payload.distanceM, isManual: true };
      },
      getManualActivity: async () => ({}),
      updateManualActivity: async () => ({}),
      deleteManualActivity: async () => ({})
    }
  });

  const response = await request(app)
    .post('/api/manual-activities')
    .set('Authorization', 'Bearer valid-admin-token')
    .send({
      ...manualPayload,
      activityType: 'strength_training',
      distanceM: 0
    });

  assert.equal(response.status, 201);
  assert.equal(capturedPayload.distanceM, 0);
  assert.equal(capturedPayload.activityType, 'strength_training');
});

test('POST /api/manual-activities rejects zero distance for running activity', async () => {
  const response = await request(buildApp())
    .post('/api/manual-activities')
    .set('Authorization', 'Bearer valid-admin-token')
    .send({
      ...manualPayload,
      distanceM: 0
    });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'INVALID_MANUAL_ACTIVITY');
});

test('GET /api/activities returns unified paged response', async () => {
  const response = await request(buildApp())
    .get('/api/activities?page=1&page_size=5')
    .set('Authorization', 'Bearer valid-user-token');

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.data, [{ id: 1, activityType: 'running' }]);
  assert.deepEqual(response.body.meta, {
    page: 1,
    pageSize: 50,
    total: 1,
    totalPages: 1
  });
});

test('GET /api/stats/summary uses stats cache for repeated query', async () => {
  statsCache.clear();
  let calls = 0;
  const app = buildApp({
    activityService: {
      listActivities: async () => ({ items: [], page: 1, pageSize: 50, total: 0, totalPages: 0 }),
      getActivityById: async () => null,
      activityExists: async () => true,
      getTrackPoints: async () => [],
      getHeartRateSeries: async () => [],
      getSpeedSeries: async () => [],
      getLaps: async () => [],
      getZones: async () => [],
      getActivityTypeStats: async () => [],
      getSummaryStats: async () => {
        calls += 1;
        return { activityCount: calls };
      },
      getTimelineStats: async () => [],
      getHeartRateZones: async () => [],
      getPersonalBests: async () => ({})
    }
  });

  const first = await request(app).get('/api/stats/summary?activity_type=running').set('Authorization', 'Bearer valid-user-token');
  const second = await request(app).get('/api/stats/summary?activity_type=running').set('Authorization', 'Bearer valid-user-token');

  assert.equal(first.body.data.activityCount, 1);
  assert.equal(second.body.data.activityCount, 1);
  assert.equal(first.body.meta.cache.hit, false);
  assert.equal(second.body.meta.cache.hit, true);
  assert.equal(calls, 1);
  statsCache.clear();
});

test('POST /api/manual-activities clears stats cache', async () => {
  statsCache.clear();
  let calls = 0;
  const app = buildApp({
    activityService: {
      listActivities: async () => ({ items: [], page: 1, pageSize: 50, total: 0, totalPages: 0 }),
      getActivityById: async () => null,
      activityExists: async () => true,
      getTrackPoints: async () => [],
      getHeartRateSeries: async () => [],
      getSpeedSeries: async () => [],
      getLaps: async () => [],
      getZones: async () => [],
      getActivityTypeStats: async () => [],
      getSummaryStats: async () => {
        calls += 1;
        return { activityCount: calls };
      },
      getTimelineStats: async () => [],
      getHeartRateZones: async () => [],
      getPersonalBests: async () => ({})
    }
  });

  await request(app).get('/api/stats/summary?activity_type=running').set('Authorization', 'Bearer valid-user-token');
  await request(app)
    .post('/api/manual-activities')
    .set('Authorization', 'Bearer valid-admin-token')
    .send(manualPayload);
  const afterWrite = await request(app).get('/api/stats/summary?activity_type=running').set('Authorization', 'Bearer valid-user-token');

  assert.equal(afterWrite.body.data.activityCount, 2);
  assert.equal(calls, 2);
  statsCache.clear();
});

test('GET /api/sync/providers requires login', async () => {
  const response = await request(buildApp()).get('/api/sync/providers');

  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, 'AUTH_REQUIRED');
});

test('GET /api/sync/providers returns fixed provider states', async () => {
  const response = await request(buildApp())
    .get('/api/sync/providers')
    .set('Authorization', 'Bearer valid-user-token');

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.data.map((item) => item.provider), ['garmin', 'strava', 'coros', 'apple_health']);
  assert.equal(response.body.data[0].adapterStatus, 'not_configured');
});

test('GET /api/sync/providers/:provider/account returns current user Garmin binding state', async () => {
  let captured;
  const app = buildApp({
    syncService: {
      listProviders: async () => [],
      updateProviderSettings: async () => ({}),
      getProviderAccount: async (provider, user) => {
        captured = { provider, user };
        return { provider, exists: true, status: 'connected', email: 'runner@example.com', lastSyncAt: null };
      },
      authorizeProvider: async () => ({}),
      disconnectProvider: async () => ({}),
      createJob: async () => ({}),
      listJobs: async () => ({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 }),
      listLogs: async () => ({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 })
    }
  });

  const response = await request(app)
    .get('/api/sync/providers/garmin/account')
    .set('Authorization', 'Bearer valid-user-token');

  assert.equal(response.status, 200);
  assert.equal(response.body.data.exists, true);
  assert.equal(response.body.data.email, 'runner@example.com');
  assert.equal(captured.provider, 'garmin');
  assert.equal(captured.user.id, 2);
});

test('POST /api/sync/providers/:provider/authorize passes Garmin credentials for current user', async () => {
  let captured;
  const app = buildApp({
    syncService: {
      listProviders: async () => [],
      updateProviderSettings: async () => ({}),
      getProviderAccount: async () => ({}),
      authorizeProvider: async (provider, user, payload) => {
        captured = { provider, user, payload };
        return { provider, exists: true, status: 'connected', email: payload.email };
      },
      disconnectProvider: async () => ({}),
      createJob: async () => ({}),
      listJobs: async () => ({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 }),
      listLogs: async () => ({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 })
    }
  });

  const response = await request(app)
    .post('/api/sync/providers/garmin/authorize')
    .set('Authorization', 'Bearer valid-user-token')
    .send({ email: 'runner@example.com', password: 'secret', mfaCode: '123456', isCn: true });

  assert.equal(response.status, 200);
  assert.equal(response.body.data.status, 'connected');
  assert.equal(captured.provider, 'garmin');
  assert.equal(captured.user.id, 2);
  assert.deepEqual(captured.payload, {
    email: 'runner@example.com',
    password: 'secret',
    mfaCode: '123456',
    isCn: true
  });
});

test('POST /api/sync/jobs creates skipped job when adapter is not configured', async () => {
  let captured;
  const app = buildApp({
    syncService: {
      listProviders: async () => [],
      updateProviderSettings: async () => ({}),
      authorizeProvider: async () => ({}),
      disconnectProvider: async () => ({}),
      createJob: async (payload, user) => {
        captured = { payload, user };
        return {
          id: 5,
          provider: payload.provider,
          jobType: payload.jobType,
          status: 'skipped',
          activityCount: 0,
          errorMessage: 'sync adapter is not configured'
        };
      },
      listJobs: async () => ({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 }),
      listLogs: async () => ({ items: [{ id: 1, level: 'warn' }], page: 1, pageSize: 20, total: 1, totalPages: 1 })
    }
  });

  const response = await request(app)
    .post('/api/sync/jobs')
    .set('Authorization', 'Bearer valid-user-token')
    .send({ provider: 'strava' });

  assert.equal(response.status, 201);
  assert.equal(response.body.data.status, 'skipped');
  assert.equal(response.body.data.activityCount, 0);
  assert.equal(captured.payload.jobType, 'manual_sync');
  assert.equal(captured.user.id, 2);
});

test('POST /api/sync/jobs requires login', async () => {
  const response = await request(buildApp()).post('/api/sync/jobs').send({ provider: 'garmin' });

  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, 'AUTH_REQUIRED');
});

test('GET /api/settings returns default settings for first read', async () => {
  const response = await request(buildApp())
    .get('/api/settings')
    .set('Authorization', 'Bearer valid-user-token');

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.data, {
    distanceUnit: 'km',
    weightUnit: 'kg',
    temperatureUnit: 'c',
    paceUnit: 'min_per_km',
    defaultPrivacy: 'private',
    hideMapEndpoints: true,
    healthSync: false
  });
});

test('PUT /api/settings partially updates user settings', async () => {
  let captured;
  const app = buildApp({
    settingsService: {
      getSettings: async () => ({}),
      updateSettings: async (payload, user) => {
        captured = { payload, user };
        return { distanceUnit: 'mi', healthSync: true };
      }
    }
  });

  const response = await request(app)
    .put('/api/settings')
    .set('Authorization', 'Bearer valid-user-token')
    .send({ distanceUnit: 'mi', healthSync: true });

  assert.equal(response.status, 200);
  assert.deepEqual(captured.payload, { distanceUnit: 'mi', healthSync: true });
  assert.equal(captured.user.id, 2);
});

test('PUT /api/settings rejects unsupported units', async () => {
  const response = await request(buildApp())
    .put('/api/settings')
    .set('Authorization', 'Bearer valid-user-token')
    .send({ distanceUnit: 'meter' });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'VALIDATION_ERROR');
});

test('GET /api/community/posts is public and passes paging', async () => {
  let captured;
  const app = buildApp({
    communityService: {
      listPosts: async (filters, user) => {
        captured = { filters, user };
        return { items: [], page: filters.page, pageSize: filters.pageSize, total: 0, totalPages: 0 };
      },
      createPost: async () => ({}),
      listComments: async () => ({}),
      createComment: async () => ({}),
      likePost: async () => ({}),
      unlikePost: async () => ({}),
      sharePost: async () => ({})
    }
  });

  const response = await request(app).get('/api/community/posts?page=2&page_size=10&keyword=run');

  assert.equal(response.status, 200);
  assert.deepEqual(captured.filters, { page: 2, pageSize: 10, offset: 10, keyword: 'run' });
  assert.equal(captured.user, undefined);
  assert.deepEqual(response.body.data.items, []);
});

test('POST /api/community/posts requires login', async () => {
  const response = await request(buildApp()).post('/api/community/posts').send({ content: 'hello' });

  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, 'AUTH_REQUIRED');
});

test('POST and DELETE /api/community/posts/:id/like are idempotent through service contract', async () => {
  const response = await request(buildApp())
    .post('/api/community/posts/1/like')
    .set('Authorization', 'Bearer valid-user-token');
  const deleted = await request(buildApp())
    .delete('/api/community/posts/1/like')
    .set('Authorization', 'Bearer valid-user-token');

  assert.equal(response.status, 200);
  assert.equal(response.body.data.likedByMe, true);
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.data.likedByMe, false);
});

test('GET /api/explore/articles is public and filters by type and keyword', async () => {
  let captured;
  const app = buildApp({
    exploreService: {
      listArticles: async (filters) => {
        captured = filters;
        return { items: [], page: filters.page, pageSize: filters.pageSize, total: 0, totalPages: 0 };
      },
      getArticleById: async () => ({}),
      getRecommendations: async () => ({})
    }
  });

  const response = await request(app).get('/api/explore/articles?type=course&keyword=base&page=1&page_size=12');

  assert.equal(response.status, 200);
  assert.deepEqual(captured, { page: 1, pageSize: 12, offset: 0, type: 'course', keyword: 'base' });
  assert.deepEqual(response.body.data.items, []);
});

test('GET /api/explore/articles rejects unsupported type', async () => {
  const response = await request(buildApp()).get('/api/explore/articles?type=video');

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'INVALID_QUERY');
});

test('POST /api/workouts creates active workout session', async () => {
  let captured;
  const app = buildApp({
    workoutService: {
      createWorkout: async (payload, user) => {
        captured = { payload, user };
        return { id: 8, userId: user.id, activityType: payload.activityType, status: 'active', pausedDurationS: 0, activityId: null };
      },
      getWorkout: async () => ({}),
      appendTrackPoints: async () => ({}),
      pauseWorkout: async () => ({}),
      resumeWorkout: async () => ({}),
      finishWorkout: async () => ({}),
      cancelWorkout: async () => ({})
    }
  });

  const response = await request(app)
    .post('/api/workouts')
    .set('Authorization', 'Bearer valid-user-token')
    .send({ activityType: 'running', startedAt: '2026-06-12 08:00:00' });

  assert.equal(response.status, 201);
  assert.equal(response.body.data.status, 'active');
  assert.equal(captured.payload.activityType, 'running');
  assert.equal(captured.user.id, 2);
});

test('POST /api/workouts/:id/track-points accepts batch points', async () => {
  let captured;
  const app = buildApp({
    workoutService: {
      createWorkout: async () => ({}),
      getWorkout: async () => ({}),
      appendTrackPoints: async (id, points, user) => {
        captured = { id, points, user };
        return { workoutId: id, inserted: points.length };
      },
      pauseWorkout: async () => ({}),
      resumeWorkout: async () => ({}),
      finishWorkout: async () => ({}),
      cancelWorkout: async () => ({})
    }
  });

  const response = await request(app)
    .post('/api/workouts/8/track-points')
    .set('Authorization', 'Bearer valid-user-token')
    .send({
      trackPoints: [
        {
          sampleTimeUtc: '2026-06-12 08:00:01',
          latitude: 31.2,
          longitude: 121.4,
          distanceM: 0,
          speedMps: 2.8,
          heartRateBpm: 140
        },
        {
          sampleTimeUtc: '2026-06-12 08:00:02',
          latitude: 31.2001,
          longitude: 121.4001,
          distanceM: 4,
          speedMps: 3,
          heartRateBpm: 142
        }
      ]
    });

  assert.equal(response.status, 201);
  assert.equal(response.body.data.inserted, 2);
  assert.equal(captured.id, 8);
  assert.equal(captured.points[0].heartRateBpm, 140);
  assert.equal(captured.user.id, 2);
});

test('POST /api/workouts/:id/track-points rejects empty batch', async () => {
  const response = await request(buildApp())
    .post('/api/workouts/8/track-points')
    .set('Authorization', 'Bearer valid-user-token')
    .send({ trackPoints: [] });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'VALIDATION_ERROR');
});

test('POST /api/workouts/:id/finish clears stats cache and returns activity id', async () => {
  statsCache.clear();
  let calls = 0;
  const app = buildApp({
    activityService: {
      listActivities: async () => ({ items: [], page: 1, pageSize: 50, total: 0, totalPages: 0 }),
      getActivityById: async () => null,
      activityExists: async () => true,
      getTrackPoints: async () => [],
      getHeartRateSeries: async () => [],
      getSpeedSeries: async () => [],
      getLaps: async () => [],
      getZones: async () => [],
      getActivityTypeStats: async () => [],
      getSummaryStats: async () => {
        calls += 1;
        return { activityCount: calls };
      },
      getTimelineStats: async () => [],
      getHeartRateZones: async () => [],
      getPersonalBests: async () => ({})
    },
    workoutService: {
      createWorkout: async () => ({}),
      getWorkout: async () => ({}),
      appendTrackPoints: async () => ({}),
      pauseWorkout: async () => ({}),
      resumeWorkout: async () => ({}),
      finishWorkout: async (id, payload) => ({ id, status: 'finished', activityId: 99, activityName: payload.activityName }),
      cancelWorkout: async () => ({})
    }
  });

  await request(app).get('/api/stats/summary?activity_type=running').set('Authorization', 'Bearer valid-user-token');
  const finished = await request(app)
    .post('/api/workouts/8/finish')
    .set('Authorization', 'Bearer valid-user-token')
    .send({ activityName: 'Live Run', calories: 300 });
  const afterWrite = await request(app).get('/api/stats/summary?activity_type=running').set('Authorization', 'Bearer valid-user-token');

  assert.equal(finished.status, 200);
  assert.equal(finished.body.data.activityId, 99);
  assert.equal(afterWrite.body.data.activityCount, 2);
  assert.equal(calls, 2);
  statsCache.clear();
});

test('activityService listActivities exposes frontend-compatible activity fields', async () => {
  const originalQuery = db.query;
  const queries = [];
  db.query = async (sql, params) => {
    queries.push({ sql, params });
    if (sql.includes('COUNT(DISTINCT a.id)')) {
      return [{ total: 1 }];
    }
    return [
      {
        id: 1,
        activityKey: 'garmin:1',
        activityName: 'Morning Run',
        activityType: 'running',
        localStartTime: '2026-06-09 08:00:00.000',
        distanceM: 5000,
        durationS: 1800,
        movingDurationS: 1780,
        elapsedDurationS: 1850,
        calories: 320,
        avgSpeedMps: 2.8,
        maxSpeedMps: 4.5,
        avgHeartRateBpm: 150,
        maxHeartRateBpm: 175,
        avgCadenceSpm: 165,
        maxCadenceSpm: 190,
        avgPowerW: 210,
        maxPowerW: 360,
        normalizedPowerW: 220,
        elevationGainM: 30,
        elevationLossM: 30,
        activityTrainingLoad: 90,
        vo2max: 52,
        isManual: 0,
        dataSource: 'garmin_import',
        ownerUsername: 'admin'
      }
    ];
  };

  try {
    const result = await activityServiceModule.listActivities({
      activityType: undefined,
      startDate: undefined,
      endDate: undefined,
      keyword: 'Morning',
      source: undefined,
      owner: 'all',
      ownerUserId: undefined,
      limit: 12,
      offset: 0,
      page: 1,
      pageSize: 12,
      sortBy: 'local_start_time',
      sortOrder: 'desc'
    });

    assert.equal(result.total, 1);
    assert.equal(result.items[0].distanceM, 5000);
    assert.equal(result.items[0].durationS, 1800);
    assert.equal(result.items[0].normalizedPowerW, 220);
    assert.match(queries[1].sql, /a\.activity_key AS activityKey/);
    assert.match(queries[1].sql, /js\.distance_m AS distanceM/);
    assert.deepEqual(queries[0].params, ['%Morning%', '%Morning%', '%Morning%', '%Morning%', '%Morning%']);
  } finally {
    db.query = originalQuery;
  }
});

test('activityService summary, calendar, and personal bests expose frontend-compatible shapes', async () => {
  const originalQuery = db.query;
  db.query = async (sql) => {
    if (sql.includes('COUNT(*) AS activityCount') && sql.includes('totalDistanceM') && !sql.includes('GROUP BY')) {
      return [{
        activityCount: 2,
        totalDistanceM: 10000,
        totalDistanceKm: 10,
        totalDurationS: 3600,
        totalDurationMin: 60,
        totalCalories: 700,
        totalTrainingLoad: 120
      }];
    }
    if (sql.includes('GROUP BY a.activity_type')) {
      return [{
        activityType: 'running',
        activityCount: 2,
        totalDistanceM: 10000,
        totalDurationS: 3600
      }];
    }
    if (sql.includes('GROUP BY date')) {
      return [{
        date: '2026-06-09',
        activityCount: 1,
        totalDistanceKm: 5,
        totalDurationS: 1800,
        totalCalories: 350,
        activityTypes: 'running'
      }];
    }
    if (sql.includes('DATE_FORMAT(a.local_start_time') && sql.includes('AS activityDate')) {
      return [{
        activityDate: '2026-06-09',
        id: 1,
        activityName: 'Morning Run',
        activityType: 'running',
        localStartTime: '2026-06-09 08:00:00.000',
        distanceM: 5000,
        durationS: 1800,
        calories: 350
      }];
    }
    return [];
  };

  try {
    const summary = await activityServiceModule.getSummaryStats({ range: 'all' });
    const calendar = await activityServiceModule.getCalendarStats({ month: '2026-06' });
    const personalBests = await activityServiceModule.getPersonalBests({});

    assert.equal(summary.totalDurationS, 3600);
    assert.equal(summary.totalDistanceM, 10000);
    assert.equal(summary.fatKg, 0.0909);
    assert.equal(calendar.days.length, 30);
    assert.equal(calendar.days[8].totals.totalDurationS, 1800);
    assert.deepEqual(calendar.days[0].activities, []);
    assert.deepEqual(personalBests.steps, []);
    assert.deepEqual(personalBests.swimming, []);
    assert.deepEqual(personalBests.running, []);
    assert.deepEqual(personalBests.cycling, []);
    assert.deepEqual(personalBests.overall, []);
  } finally {
    db.query = originalQuery;
  }
});

test('activityService dashboard overview returns six recent activities', async () => {
  const originalQuery = db.query;
  let recentListParams;
  db.query = async (sql, params = []) => {
    if (sql.includes('MAX(a.local_start_time)')) {
      return [{ latestDate: '2026-06-13' }];
    }
    if (sql.includes('COUNT(DISTINCT a.id)')) {
      return [{ total: 6 }];
    }
    if (sql.includes('a.garmin_activity_id AS garminActivityId') && sql.includes('LIMIT ? OFFSET ?')) {
      recentListParams = params;
      return Array.from({ length: 6 }, (_, index) => ({
        id: index + 1,
        activityName: `Recent ${index + 1}`,
        activityType: 'running',
        localStartTime: `2026-06-${String(13 - index).padStart(2, '0')} 08:00:00.000`,
        distanceM: 5000,
        durationS: 1800
      }));
    }
    if (sql.includes('COUNT(*) AS activityCount') && !sql.includes('GROUP BY')) {
      return [{ activityCount: 6, totalDistanceKm: 30, totalCalories: 1200 }];
    }
    return [];
  };

  try {
    const overview = await activityServiceModule.getDashboardOverview({});

    assert.equal(overview.recentActivities.length, 6);
    assert.deepEqual(recentListParams.slice(-2), [6, 0]);
  } finally {
    db.query = originalQuery;
  }
});

test('activityService activity type stats avoids MySQL 8 window functions', async () => {
  const originalQuery = db.query;
  let capturedSql;
  db.query = async (sql) => {
    capturedSql = sql;
    return [
      { activityType: 'running', activityCount: 3, totalDistanceM: 15000 },
      { activityType: 'cycling', activityCount: 1, totalDistanceM: 20000 }
    ];
  };

  try {
    const rows = await activityServiceModule.getActivityTypeStats({});

    assert.equal(rows[0].percentage, 75);
    assert.equal(rows[1].percentage, 25);
    assert.doesNotMatch(capturedSql, /OVER\s*\(/i);
  } finally {
    db.query = originalQuery;
  }
});

test('activityService laps avoids MySQL 8 window functions', async () => {
  const originalQuery = db.query;
  let capturedSql;
  db.query = async (sql) => {
    capturedSql = sql;
    return [];
  };

  try {
    const rows = await activityServiceModule.getLaps(1);

    assert.deepEqual(rows, []);
    assert.doesNotMatch(capturedSql, /OVER\s*\(/i);
    assert.doesNotMatch(capturedSql, /^\s*WITH\s+/i);
  } finally {
    db.query = originalQuery;
  }
});

test('workoutService finish rejects workouts without track points', async () => {
  const originalTransaction = db.transaction;
  db.transaction = async (handler) => {
    const connection = {
      query: async (sql) => {
        if (sql.includes('FROM WorkoutSessions')) {
          return [[{
            id: 7,
            userId: 2,
            activityType: 'running',
            status: 'active',
            startedAt: '2026-06-12 08:00:00.000',
            pausedDurationS: 0
          }]];
        }
        if (sql.includes('FROM WorkoutTrackPoints')) {
          return [[]];
        }
        return [{}];
      }
    };
    return handler(connection);
  };

  try {
    await assert.rejects(
      () => workoutServiceModule.finishWorkout(7, {}, { id: 2, role: 'user' }),
      (error) => error.code === 'VALIDATION_ERROR'
    );
  } finally {
    db.transaction = originalTransaction;
  }
});

test('workoutService appendTrackPoints continues after existing sample index zero', async () => {
  const originalQuery = db.query;
  const originalTransaction = db.transaction;
  const insertedParams = [];

  db.query = async (sql) => {
    if (sql.includes('FROM WorkoutSessions')) {
      return [{
        id: 7,
        userId: 2,
        activityType: 'running',
        status: 'active',
        startedAt: '2026-06-12 08:00:00.000',
        pausedDurationS: 0
      }];
    }
    if (sql.includes('MAX(sample_index)')) {
      return [{ maxIndex: 0 }];
    }
    return [];
  };
  db.transaction = async (handler) => {
    const connection = {
      query: async (sql, params = []) => {
        insertedParams.push(params);
        return [{}];
      }
    };
    return handler(connection);
  };

  try {
    const result = await workoutServiceModule.appendTrackPoints(
      7,
      [{ sampleTimeUtc: '2026-06-12 08:00:10.000', latitude: 31.2, longitude: 121.4 }],
      { id: 2, role: 'user' }
    );

    assert.equal(result.inserted, 1);
    assert.equal(insertedParams[0][1], 1);
  } finally {
    db.query = originalQuery;
    db.transaction = originalTransaction;
  }
});

test('workoutService finish writes activity summary and track points', async () => {
  const originalTransaction = db.transaction;
  const originalQuery = db.query;
  const writes = [];

  db.transaction = async (handler) => {
    const connection = {
      query: async (sql, params = []) => {
        writes.push({ sql, params });
        if (sql.includes('FROM WorkoutSessions')) {
          return [[{
            id: 7,
            userId: 2,
            activityType: 'running',
            status: 'active',
            startedAt: '2026-06-12 08:00:00.000',
            pausedDurationS: 0
          }]];
        }
        if (sql.includes('FROM WorkoutTrackPoints')) {
          return [[
            {
              sampleIndex: 0,
              sampleTimeUtc: '2026-06-12 08:00:00.000',
              latitude: 31.2,
              longitude: 121.4,
              altitudeM: 5,
              distanceM: 0,
              speedMps: 2.5,
              heartRateBpm: 140,
              cadence: 160,
              powerW: 180
            },
            {
              sampleIndex: 1,
              sampleTimeUtc: '2026-06-12 08:00:10.000',
              latitude: 31.2001,
              longitude: 121.4001,
              altitudeM: 6,
              distanceM: 30,
              speedMps: 3,
              heartRateBpm: 145,
              cadence: 164,
              powerW: 190
            }
          ]];
        }
        if (sql.includes('INSERT INTO Activities')) {
          return [{ insertId: 99 }];
        }
        return [{}];
      }
    };
    return handler(connection);
  };
  db.query = async () => [{
    id: 7,
    userId: 2,
    activityType: 'running',
    status: 'finished',
    startedAt: '2026-06-12 08:00:00.000',
    pausedDurationS: 0,
    finishedAt: '2026-06-12 08:00:10.000',
    activityId: 99
  }];

  try {
    const result = await workoutServiceModule.finishWorkout(
      7,
      { activityName: 'Live Run', calories: 88 },
      { id: 2, role: 'user' }
    );

    assert.equal(result.activityId, 99);
    assert.ok(writes.some((entry) => entry.sql.includes('INSERT INTO Activities')));
    assert.ok(writes.some((entry) => entry.sql.includes('INSERT INTO ActivitySummaries')));
    assert.ok(writes.some((entry) => entry.sql.includes('INSERT INTO TrackPoints')));
    assert.ok(writes.some((entry) => entry.sql.includes("data_source, is_manual, match_status")));
  } finally {
    db.transaction = originalTransaction;
    db.query = originalQuery;
  }
});

test('syncService Garmin incremental start prefers last sync date', async () => {
  const originalQuery = db.query;
  db.query = async (sql) => {
    if (sql.includes('DATE_FORMAT(last_sync_at')) {
      return [{ lastSyncDate: '2026-06-10' }];
    }
    if (sql.includes('MAX(COALESCE(local_start_time, start_time_utc))')) {
      return [{ latestActivityDate: '2026-06-08' }];
    }
    return [];
  };

  try {
    const startDate = await syncServiceModule._private.getGarminIncrementalStartDate({ id: 2 });

    assert.equal(startDate, '2026-06-10');
  } finally {
    db.query = originalQuery;
  }
});

test('syncService Garmin incremental start falls back to latest local Garmin activity', async () => {
  const originalQuery = db.query;
  db.query = async (sql) => {
    if (sql.includes('DATE_FORMAT(last_sync_at')) {
      return [{ lastSyncDate: null }];
    }
    if (sql.includes('MAX(COALESCE(local_start_time, start_time_utc))')) {
      return [{ latestActivityDate: '2026-06-12' }];
    }
    return [];
  };

  try {
    const startDate = await syncServiceModule._private.getGarminIncrementalStartDate({ id: 2 });

    assert.equal(startDate, '2026-06-12');
  } finally {
    db.query = originalQuery;
  }
});

test('syncService Garmin sync skips remote scan when no local Garmin history exists', async () => {
  const originalQuery = db.query;
  const logs = [];

  db.query = async (sql, params = []) => {
    if (sql.includes('last_sync_at AS lastSyncAt')) {
      return [{
        status: 'connected',
        lastSyncAt: null,
        connectedAt: '2026-06-10 10:00:00.000',
        rawJson: JSON.stringify({ email: 'runner@example.com', isCn: false })
      }];
    }
    if (sql.includes('DATE_FORMAT(last_sync_at')) {
      return [{ lastSyncDate: null }];
    }
    if (sql.includes('MAX(COALESCE(local_start_time, start_time_utc))')) {
      return [{ latestActivityDate: null }];
    }
    if (sql.includes('INSERT INTO SyncLogs')) {
      logs.push({ sql, params });
      return { affectedRows: 1 };
    }
    return [];
  };

  try {
    const result = await syncServiceModule._private.runGarminSync(99, { id: 2 }, {});

    assert.equal(result.importedCount, 0);
    assert.equal(result.startDate, null);
    assert.deepEqual(result.summary, { skipped: true, reason: 'no_local_sync_history' });
    assert.equal(logs.length, 1);
    assert.match(logs[0].params[4], /no local Garmin sync history/);
  } finally {
    db.query = originalQuery;
  }
});

test('activityService returns compact activity access metadata', async () => {
  const originalQuery = db.query;
  let captured;
  db.query = async (sql, params) => {
    captured = { sql, params };
    return [{ id: 7, ownerUserId: 2 }];
  };

  try {
    const access = await activityServiceModule.getActivityAccess(7);

    assert.deepEqual(access, { id: 7, ownerUserId: 2 });
    assert.match(captured.sql, /owner_user_id AS ownerUserId/);
    assert.deepEqual(captured.params, [7]);
  } finally {
    db.query = originalQuery;
  }
});

test('activityService hides activities owned by another normal user', async () => {
  const originalQuery = db.query;
  db.query = async () => [{ id: 7, ownerUserId: 3 }];

  try {
    await assert.rejects(
      activityServiceModule.assertActivityReadable({ id: 2, role: 'user' }, 7),
      (error) => error.statusCode === 404 && error.code === 'ACTIVITY_NOT_FOUND'
    );
  } finally {
    db.query = originalQuery;
  }
});

test('activityService allows owners and administrators to read an activity', async () => {
  const originalQuery = db.query;
  db.query = async () => [{ id: 7, ownerUserId: 2 }];

  try {
    const ownerAccess = await activityServiceModule.assertActivityReadable({ id: 2, role: 'user' }, 7);
    const adminAccess = await activityServiceModule.assertActivityReadable({ id: 1, role: 'admin' }, 7);

    assert.equal(ownerAccess.id, 7);
    assert.equal(adminAccess.id, 7);
  } finally {
    db.query = originalQuery;
  }
});

test('API responses use security headers without exposing Express', async () => {
  const response = await request(buildApp()).get('/api/health');

  assert.equal(response.status, 200);
  assert.equal(response.headers['x-powered-by'], undefined);
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['cross-origin-resource-policy'], 'cross-origin');
});

test('GET /api/health hides database error details', async () => {
  const response = await request(buildApp({
    healthService: {
      checkDatabase: async () => ({ ok: false, message: 'connect ECONNREFUSED root:secret@127.0.0.1' })
    }
  })).get('/api/health');

  assert.equal(response.status, 200);
  assert.equal(response.body.data.status, 'degraded');
  assert.deepEqual(response.body.data.database, { ok: false, message: 'unavailable' });
});

test('personal health, activity analytics, training, and dashboard routes require login', async () => {
  const paths = [
    '/api/health/trends',
    '/api/health/samples/heart-rate',
    '/api/health/training-status/latest',
    '/api/health/race-predictions/latest',
    '/api/health/lactate-threshold/latest',
    '/api/health/cycling-ftp/latest',
    '/api/activities',
    '/api/activities/1',
    '/api/activities/1/track-points',
    '/api/activities/1/heart-rate',
    '/api/activities/1/speed',
    '/api/activities/1/laps',
    '/api/activities/1/zones',
    '/api/stats/summary',
    '/api/training/load-balance',
    '/api/dashboard/overview',
    '/api/dashboard/health'
  ];

  for (const path of paths) {
    const response = await request(buildApp()).get(path);
    assert.equal(response.status, 401, path);
    assert.equal(response.body.error.code, 'AUTH_REQUIRED', path);
  }
});

test('GET /api/activities forces owner=mine for normal users', async () => {
  let captured;
  const response = await request(buildApp({
    activityService: {
      listActivities: async (filters) => {
        captured = filters;
        return { items: [], page: 1, pageSize: 50, total: 0, totalPages: 0 };
      }
    }
  }))
    .get('/api/activities?owner=all')
    .set('Authorization', 'Bearer valid-user-token');

  assert.equal(response.status, 200);
  assert.equal(captured.owner, 'mine');
  assert.equal(captured.ownerUserId, 2);
});

test('GET /api/activities preserves administrator owner filters', async () => {
  const captured = [];
  const app = buildApp({
    activityService: {
      listActivities: async (filters) => {
        captured.push(filters);
        return { items: [], page: 1, pageSize: 50, total: 0, totalPages: 0 };
      }
    }
  });

  for (const owner of ['all', 'mine', 'admin']) {
    const response = await request(app)
      .get(`/api/activities?owner=${owner}`)
      .set('Authorization', 'Bearer valid-admin-token');
    assert.equal(response.status, 200);
  }

  assert.deepEqual(captured.map((filters) => filters.owner), ['all', 'mine', 'admin']);
  assert.equal(captured[1].ownerUserId, 1);
});

test('GET /api/activities defaults administrators to their own activities', async () => {
  let captured;
  const response = await request(buildApp({
    activityService: {
      listActivities: async (filters) => {
        captured = filters;
        return { items: [], page: 1, pageSize: 50, total: 0, totalPages: 0 };
      }
    }
  }))
    .get('/api/activities')
    .set('Authorization', 'Bearer valid-admin-token');

  assert.equal(response.status, 200);
  assert.equal(captured.owner, 'mine');
  assert.equal(captured.ownerUserId, 1);
});

test('activity detail checks object-level read access for the authenticated user', async () => {
  let checked;
  const response = await request(buildApp({
    activityService: {
      assertActivityReadable: async (user, activityId) => {
        checked = { user, activityId };
      },
      getActivityById: async (activityId) => ({ id: activityId, activityType: 'running' })
    }
  }))
    .get('/api/activities/1')
    .set('Authorization', 'Bearer valid-user-token');

  assert.equal(response.status, 200);
  assert.equal(checked.user.id, 2);
  assert.equal(checked.activityId, 1);
});

test('activity detail hides activities denied by object-level access control', async () => {
  const denied = new Error('activity not found');
  denied.statusCode = 404;
  denied.code = 'ACTIVITY_NOT_FOUND';
  const response = await request(buildApp({
    activityService: {
      assertActivityReadable: async () => { throw denied; },
      getActivityById: async (activityId) => ({ id: activityId, activityType: 'running' })
    }
  }))
    .get('/api/activities/2')
    .set('Authorization', 'Bearer valid-user-token');

  assert.equal(response.status, 404);
  assert.equal(response.body.error.code, 'ACTIVITY_NOT_FOUND');
});

test('oversized JSON requests return the stable payload-too-large error', async () => {
  const response = await request(buildApp())
    .post('/api/auth/register')
    .send({ username: 'tester', email: 'tester@example.com', password: `x${'a'.repeat(1024 * 1024)}` });

  assert.equal(response.status, 413);
  assert.equal(response.body.error.code, 'PAYLOAD_TOO_LARGE');
});

test('successful logins do not consume the login IP rate limit', async () => {
  const app = buildApp({
    securityConfig: {
      globalRateLimitWindowMs: 900000,
      globalRateLimitMax: 100,
      authRateLimitWindowMs: 900000,
      authRateLimitMax: 2
    }
  });
  let response;

  for (let index = 0; index < 31; index += 1) {
    response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'tester@example.com', password: 'password123' });
  }

  assert.equal(response.status, 200);
});

test('the login IP rate limit counts failed malformed JSON requests', async () => {
  const app = buildApp({
    securityConfig: {
      globalRateLimitWindowMs: 900000,
      globalRateLimitMax: 100,
      authRateLimitWindowMs: 900000,
      authRateLimitMax: 2
    }
  });
  let response;

  for (let index = 0; index < 3; index += 1) {
    response = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{invalid-json');
  }

  assert.equal(response.status, 429);
  assert.equal(response.body.error.code, 'AUTH_RATE_LIMITED');
});

test('activity image upload rejects non-image files', async () => {
  const response = await request(buildApp())
    .post('/api/activities/1/photo')
    .set('Authorization', 'Bearer valid-user-token')
    .attach('photo', Buffer.from('plain text'), { filename: 'notes.txt', contentType: 'text/plain' });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'INVALID_UPLOAD');
});

test('all media upload routes reject spoofed file contents', async () => {
  const app = buildApp();
  const authorization = ['Authorization', 'Bearer valid-user-token'];
  const spoofed = Buffer.from('plain text disguised as media');
  const requests = [
    ['activity', request(app)
      .post('/api/activities/1/photo')
      .set(...authorization)
      .attach('photo', spoofed, { filename: 'activity.png', contentType: 'image/png' })],
    ['shoe', request(app)
      .post('/api/shoes/1/photo')
      .set(...authorization)
      .attach('photo', spoofed, { filename: 'shoe.png', contentType: 'image/png' })],
    ['community', request(app)
      .post('/api/community/posts')
      .set(...authorization)
      .field('content', 'spoofed upload')
      .attach('image', spoofed, { filename: 'community.png', contentType: 'image/png' })],
    ['explore image', request(app)
      .post('/api/explore/articles')
      .set(...authorization)
      .field('type', 'article')
      .field('title', 'spoofed image')
      .attach('image', spoofed, { filename: 'explore.png', contentType: 'image/png' })],
    ['explore video', request(app)
      .post('/api/explore/articles')
      .set(...authorization)
      .field('type', 'course')
      .field('title', 'spoofed video')
      .attach('video', spoofed, { filename: 'explore.mp4', contentType: 'video/mp4' })]
  ];

  for (const [label, pendingRequest] of requests) {
    const response = await pendingRequest;
    assert.equal(response.status, 400, `${label}: ${JSON.stringify(response.body)}`);
    assert.equal(response.body.error.code, 'INVALID_UPLOAD', label);
  }
});

test('successful login records the attempt and LOGIN_SUCCESS event before responding', async () => {
  const calls = [];
  const response = await request(buildApp({
    securityService: {
      assertLoginAllowed: async () => calls.push('allowed'),
      recordLoginAttempt: async (entry) => calls.push({ attempt: entry }),
      recordSecurityEvent: async (entry) => calls.push({ event: entry })
    }
  }))
    .post('/api/auth/login')
    .send({ email: 'tester@example.com', password: 'password123' });

  assert.equal(response.status, 200);
  assert.equal(calls[0], 'allowed');
  assert.equal(calls[1].attempt.success, true);
  assert.equal(calls[1].attempt.userId, 2);
  assert.equal(calls[2].event.eventType, 'LOGIN_SUCCESS');
});

test('failed login records the attempt and LOGIN_FAILED event', async () => {
  const calls = [];
  const invalidCredentials = new Error('invalid email or password');
  invalidCredentials.statusCode = 401;
  invalidCredentials.code = 'INVALID_CREDENTIALS';
  const response = await request(buildApp({
    authService: {
      login: async () => { throw invalidCredentials; },
      verifyToken: async () => ({ id: 2, role: 'user' })
    },
    securityService: {
      assertLoginAllowed: async () => undefined,
      recordLoginAttempt: async (entry) => calls.push({ attempt: entry }),
      recordSecurityEvent: async (entry) => calls.push({ event: entry })
    }
  }))
    .post('/api/auth/login')
    .send({ email: 'tester@example.com', password: 'wrong-password' });

  assert.equal(response.status, 401);
  assert.equal(calls[0].attempt.success, false);
  assert.equal(calls[0].attempt.failureReason, 'INVALID_CREDENTIALS');
  assert.equal(calls[1].event.eventType, 'LOGIN_FAILED');
});

test('persisted login block returns 429 without calling authService.login', async () => {
  let loginCalled = false;
  const blocked = new Error('login temporarily blocked');
  blocked.statusCode = 429;
  blocked.code = 'LOGIN_BLOCKED';
  const response = await request(buildApp({
    authService: {
      login: async () => {
        loginCalled = true;
        return {};
      },
      verifyToken: async () => ({ id: 2, role: 'user' })
    },
    securityService: {
      assertLoginAllowed: async () => { throw blocked; },
      recordLoginAttempt: async () => undefined,
      recordSecurityEvent: async () => undefined
    }
  }))
    .post('/api/auth/login')
    .send({ email: 'tester@example.com', password: 'password123' });

  assert.equal(response.status, 429);
  assert.equal(response.body.error.code, 'LOGIN_BLOCKED');
  assert.equal(loginCalled, false);
});
