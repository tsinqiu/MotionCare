const { ApiError } = require('../errors');
const activityService = require('./activityService');

const EMPTY_OVERVIEW = {
  recentActivities: [],
  monthlySummary: {},
  yearlySummary: {},
  trainingLoad: [],
  personalBests: {}
};

const QUICK_REPLIES = [
  '今天适合训练吗？',
  '最近运动负荷怎么样？',
  '下一次跑步怎么安排？'
];

function visibleOverviewFilters(user) {
  return {
    owner: 'all',
    ownerUserId: user?.id
  };
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function toNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function round(value, digits = 1) {
  const numberValue = toNumber(value);
  if (numberValue === null) return null;
  const factor = 10 ** digits;
  return Math.round(numberValue * factor) / factor;
}

function formatKm(valueM) {
  const numberValue = toNumber(valueM);
  return numberValue === null ? '--' : `${round(numberValue / 1000, 1)} km`;
}

function formatDuration(valueS) {
  const seconds = toNumber(valueS);
  if (seconds === null) return '--';
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes} 分钟` : `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`;
}

function activityTypeLabel(type) {
  const labels = {
    running: '跑步',
    street_running: '跑步',
    track_running: '跑步',
    treadmill_running: '跑步',
    cycling: '骑行',
    road_biking: '骑行',
    indoor_cycling: '骑行',
    swimming: '游泳',
    strength_training: '力量训练',
    floor_climbing: '爬楼'
  };
  return labels[type] || type || '运动';
}

function normalizeActivity(activity = {}) {
  return {
    id: activity.id,
    name: firstDefined(activity.activityName, activity.activity_name, activity.activityType, activity.activity_type, '运动记录'),
    type: firstDefined(activity.activityType, activity.activity_type),
    distanceM: toNumber(firstDefined(activity.distanceM, activity.totalDistanceM, activity.total_distance_m)),
    durationS: toNumber(firstDefined(activity.durationS, activity.totalTimerTimeS, activity.total_timer_time_s)),
    avgHeartRateBpm: toNumber(firstDefined(activity.avgHeartRateBpm, activity.avg_heart_rate_bpm)),
    trainingLoad: toNumber(firstDefined(activity.activityTrainingLoad, activity.activity_training_load)),
    calories: toNumber(activity.calories)
  };
}

function latestLoad(overview) {
  return overview.trainingLoad?.at(-1) || {};
}

function loadStatus(load) {
  const tsb = toNumber(load.tsb);
  if (tsb !== null && tsb < -15) return { tone: 'warning', label: '疲劳偏高' };
  if (tsb !== null && tsb > 8) return { tone: 'good', label: '状态较新鲜' };
  return { tone: 'steady', label: '负荷平稳' };
}

function summarizeRecentActivities(overview) {
  const recent = overview.recentActivities || [];
  if (!recent.length) {
    return '近期暂无运动记录，建议先安排一次低强度有氧或轻量力量训练。';
  }

  const totalDistanceM = recent.reduce((sum, activity) => sum + (normalizeActivity(activity).distanceM || 0), 0);
  const types = [...new Set(recent.map((activity) => activityTypeLabel(normalizeActivity(activity).type)))].slice(0, 3);
  return `近期共有 ${recent.length} 次运动，累计约 ${formatKm(totalDistanceM)}，主要类型为 ${types.join('、')}。`;
}

function buildDailyBrief(overview = EMPTY_OVERVIEW) {
  const load = latestLoad(overview);
  const status = loadStatus(load);
  const monthlyCount = overview.monthlySummary?.activityCount || 0;
  const monthlyDistanceKm = round(overview.monthlySummary?.totalDistanceKm || 0, 1);
  const avgHeartRate = overview.monthlySummary?.avgHeartRateBpm || null;
  const dailyLoad = round(load.dailyTrainingLoad, 1);
  const ctl = round(load.ctl, 1);
  const atl = round(load.atl, 1);
  const tsb = round(load.tsb, 1);
  const recommendation = status.tone === 'warning'
    ? '今天建议恢复优先，可选择轻松慢跑、骑行或拉伸，避免高强度间歇。'
    : status.tone === 'good'
      ? '今天可以安排一次质量训练，但仍要充分热身并关注心率漂移。'
      : '今天适合中低强度有氧或技术训练，维持节奏即可。';

  return {
    headline: status.label,
    sections: [
      { key: 'recent', title: '近期运动', tone: 'good', text: summarizeRecentActivities(overview) },
      {
        key: 'body',
        title: '身体状态',
        tone: status.tone,
        text: `当前 TSB ${tsb ?? '--'}，CTL ${ctl ?? '--'}，ATL ${atl ?? '--'}，整体判断为${status.label}。`
      },
      { key: 'today', title: '今日安排', tone: status.tone, text: recommendation }
    ],
    metrics: [
      { label: '本月活动', value: `${monthlyCount}`, tone: 'steady' },
      { label: '本月距离', value: `${monthlyDistanceKm} km`, tone: 'good' },
      { label: '近期负荷', value: dailyLoad ?? '--', tone: status.tone },
      { label: '平均心率', value: avgHeartRate ? `${avgHeartRate} bpm` : '--', tone: 'steady' }
    ],
    recommendation,
    disclaimer: 'AI 建议仅用于训练参考，不替代医疗建议。'
  };
}

function buildActivityAnalysis(activity) {
  const item = normalizeActivity(activity);
  const typeLabel = activityTypeLabel(item.type);
  const loadTone = item.trainingLoad !== null && item.trainingLoad > 180
    ? 'warning'
    : item.trainingLoad !== null && item.trainingLoad < 40
      ? 'easy'
      : 'steady';
  const suggestions = [
    item.distanceM
      ? `本次${typeLabel}距离约 ${formatKm(item.distanceM)}，总用时 ${formatDuration(item.durationS)}。`
      : `本次${typeLabel}以时长和身体反馈为主要参考，轨迹或距离数据不足。`
  ];

  if (item.avgHeartRateBpm) {
    suggestions.push(`平均心率 ${item.avgHeartRateBpm} bpm，建议结合主观疲劳判断恢复需求。`);
  }
  if (loadTone === 'warning') {
    suggestions.push('训练负荷偏高，接下来 24-48 小时建议降低强度。');
  } else if (loadTone === 'easy') {
    suggestions.push('负荷较轻，可作为恢复或基础训练日。');
  } else {
    suggestions.push('负荷处于可控区间，下次训练可按疲劳感选择稳定有氧或技术训练。');
  }

  return {
    headline: `${typeLabel}智能分析`,
    summary: suggestions[0],
    insights: [
      { label: '距离', value: formatKm(item.distanceM), tone: 'good' },
      { label: '用时', value: formatDuration(item.durationS), tone: 'steady' },
      { label: '平均心率', value: item.avgHeartRateBpm ? `${item.avgHeartRateBpm} bpm` : '--', tone: 'steady' },
      { label: '训练负荷', value: item.trainingLoad ?? '--', tone: loadTone }
    ],
    suggestions: suggestions.slice(1),
    disclaimer: 'AI 分析仅用于训练参考，不替代医疗建议。'
  };
}

function sanitizeQuestion(message) {
  const text = String(message || '').trim();
  if (!text) {
    throw new ApiError(400, 'message is required', 'INVALID_AI_INPUT');
  }
  if (text.length > 1000) {
    throw new ApiError(400, 'message is too long', 'INVALID_AI_INPUT');
  }
  return text;
}

function buildChatAnswer(message, overview) {
  if (!/运动|跑步|骑行|游泳|训练|恢复|心率|配速|步频|负荷|疲劳|今日|安排|活动|Garmin|有氧|力量|拉伸/i.test(message)) {
    return '我目前只围绕运动数据、训练负荷、恢复和训练安排提供建议。可以问我“今天适合训练吗？”或“最近跑步状态怎么样？”。';
  }

  const brief = buildDailyBrief(overview);
  return [brief.sections[0].text, brief.sections[1].text, brief.recommendation].join('\n');
}

async function getOverviewForUser(user) {
  try {
    return await activityService.getDashboardOverview(visibleOverviewFilters(user));
  } catch (_error) {
    return EMPTY_OVERVIEW;
  }
}

async function getHealth() {
  return {
    status: 'ok',
    provider: 'rules',
    activeProvider: 'rules',
    model: null,
    fallbackRules: true
  };
}

async function getDailyBrief(user) {
  const overview = await getOverviewForUser(user);
  return {
    data: buildDailyBrief(overview),
    meta: { ai: { provider: 'rules', model: null, fallback: true } }
  };
}

async function chat({ message }, user) {
  const question = sanitizeQuestion(message);
  const overview = await getOverviewForUser(user);
  return {
    data: {
      role: 'assistant',
      content: buildChatAnswer(question, overview),
      quickReplies: QUICK_REPLIES
    },
    meta: { ai: { provider: 'rules', model: null, fallback: true } }
  };
}

async function analyzeActivity({ activityId }) {
  const id = Number.parseInt(activityId, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, 'activityId is required', 'INVALID_AI_INPUT');
  }

  const activity = await activityService.getActivityById(id);
  if (!activity) {
    throw new ApiError(404, 'activity not found', 'ACTIVITY_NOT_FOUND');
  }

  return {
    data: buildActivityAnalysis(activity),
    meta: { ai: { provider: 'rules', model: null, fallback: true } }
  };
}

module.exports = {
  getHealth,
  getDailyBrief,
  chat,
  analyzeActivity
};
