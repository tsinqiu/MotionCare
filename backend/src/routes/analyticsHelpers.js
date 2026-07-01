const { ApiError } = require('../errors');
const {
  parseActivityType,
  parseDate,
  parseDateRange,
  parseEnum,
  parseKeyword,
  parseYear,
  parseYearMonth
} = require('../http');
const statsCache = require('../cache/statsCache');
const { sendData } = require('../response');

const OWNER_FILTERS = ['all', 'admin', 'mine'];
const SOURCE_FILTERS = ['garmin_import', 'manual_upload', 'live_workout'];
const SUMMARY_RANGES = ['month', 'year', 'all'];
const TREND_RANGES = ['42d', '3m', '6m', '1y', '2y'];
const TRAINING_RANGES = TREND_RANGES;
const TIMELINE_GROUPS = ['day', 'month'];
const TREND_METRICS = [
  'avg_cadence_spm',
  'avg_heart_rate_bpm',
  'max_heart_rate_bpm',
  'avg_speed_mps',
  'avg_pace_sec_per_km',
  'distance_m',
  'duration_s',
  'calories',
  'activity_training_load',
  'vo2max',
  'body_battery_delta'
];

function parseOwnerFilter(value, user) {
  if (!user) {
    throw new ApiError(401, 'login is required to access activity data', 'AUTH_REQUIRED');
  }

  const requestedOwner = parseEnum(
    value,
    OWNER_FILTERS,
    'owner',
    user.role === 'admin' ? 'all' : 'mine'
  );

  return {
    owner: user.role === 'admin' ? requestedOwner : 'mine',
    ownerUserId: user.id
  };
}

function parseActivityFilters(query, user, { sourceFilters = SOURCE_FILTERS, withDates = true } = {}) {
  const ownerFilter = parseOwnerFilter(query.owner, user);

  return {
    activityType: parseActivityType(query.activity_type),
    ...(withDates ? parseDateRange(query, { maxDays: 1095 }) : {}),
    keyword: parseKeyword(query.keyword),
    source: parseEnum(query.source, sourceFilters, 'source', undefined),
    ...ownerFilter
  };
}

function parseSummaryFilters(query, user) {
  const filters = parseActivityFilters(query, user);
  const range = parseEnum(query.range, SUMMARY_RANGES, 'range', undefined);
  let date;

  if (range === 'month') {
    date = parseYearMonth(query.date, 'date');
  } else if (range === 'year') {
    date = parseYear(query.date, 'date');
  } else if (query.date !== undefined && range !== 'all') {
    throw new ApiError(400, 'date requires range=month or range=year', 'INVALID_QUERY');
  }

  return {
    ...filters,
    ...(range !== undefined ? { range } : {}),
    ...(date !== undefined ? { date } : {})
  };
}

function parseTrendFilters(query, user) {
  const metric = query.metric;
  if (!metric) {
    throw new ApiError(400, 'metric is required', 'INVALID_QUERY');
  }
  if (!TREND_METRICS.includes(metric)) {
    throw new ApiError(400, 'metric is not supported', 'UNSUPPORTED_METRIC');
  }

  return {
    ...parseActivityFilters(query, user),
    metric,
    range: parseEnum(query.range, TREND_RANGES, 'range', '3m'),
    endDate: parseDateRange({ end_date: query.end_date }).endDate
  };
}

function parseDashboardFilters(query, user) {
  return parseActivityFilters(query, user, { withDates: false });
}

function parseTrainingFilters(query, user) {
  return {
    ...parseActivityFilters(query, user, { withDates: false }),
    range: parseEnum(query.range, TRAINING_RANGES, 'range', '3m'),
    endDate: parseDate(query.end_date, 'end_date')
  };
}

async function sendCachedStats(req, res, loader) {
  const cached = statsCache.get(req);
  if (cached) {
    sendData(res, cached, { cache: { hit: true } });
    return;
  }

  const data = await loader();
  statsCache.set(req, data);
  sendData(res, data, { cache: { hit: false } });
}

module.exports = {
  TIMELINE_GROUPS,
  parseOwnerFilter,
  parseActivityFilters,
  parseSummaryFilters,
  parseTrendFilters,
  parseDashboardFilters,
  parseTrainingFilters,
  sendCachedStats,
  parseEnum,
  parseYearMonth
};
