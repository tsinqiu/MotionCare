const test = require('node:test');
const assert = require('node:assert/strict');

const aiService = require('../src/services/aiService');
const activityService = require('../src/services/activityService');
const config = require('../src/config');
const db = require('../src/db');

function withActivityStubs(stubs, fn) {
  const originals = {};
  for (const [name, value] of Object.entries(stubs)) {
    originals[name] = activityService[name];
    activityService[name] = value;
  }

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [name, value] of Object.entries(originals)) {
        activityService[name] = value;
      }
    });
}

function withAiEnvironment({ activityStubs = {}, dbQuery, aiConfig = {}, mlConfig = {}, fetchImpl }, fn) {
  const originalDbQuery = db.query;
  const originalFetch = global.fetch;
  const originalAiConfig = { ...config.ai };
  const originalMlConfig = { ...config.ml };

  if (dbQuery) db.query = dbQuery;
  if (fetchImpl) global.fetch = fetchImpl;
  Object.assign(config.ai, aiConfig);
  Object.assign(config.ml, { coachModelPath: '__missing_coach_model__.joblib', ...mlConfig });

  return withActivityStubs(activityStubs, fn)
    .finally(() => {
      db.query = originalDbQuery;
      global.fetch = originalFetch;
      Object.assign(config.ai, originalAiConfig);
      Object.assign(config.ml, originalMlConfig);
    });
}

function ragDbQuery(sql) {
  if (sql.includes('MAX(latest_date)')) {
    return [{ latestDate: '2026-06-29' }];
  }
  if (sql.includes('COUNT(*) AS activityCount')) {
    return [{
      activityCount: 3,
      totalDistanceKm: 18.2,
      totalDurationH: 2.4,
      totalTrainingLoad: 210,
      avgHeartRateBpm: 148,
      avgTemperatureC: 31,
      avgHumidityPercent: 72,
      weatherSamples: 2
    }];
  }
  if (sql.includes('FROM Activities a') && sql.includes('LEFT JOIN ActivitySummaries')) {
    return [{
      id: 1,
      localDate: '2026-06-29',
      activityName: '无锡市 跑步',
      activityType: 'running',
      distanceM: 5000,
      durationS: 1800,
      avgHeartRateBpm: 145,
      activityTrainingLoad: 80,
      weatherCondition: '多云',
      temperatureC: 31,
      humidityPercent: 72,
      feelsLikeC: 35
    }];
  }
  if (sql.includes('FROM DailyHealthSummaries')) {
    return [{
      summaryDate: '2026-06-29',
      steps: 9000,
      avgStressLevel: 52,
      restingHeartRateBpm: 55,
      bodyBatteryDrained: 65,
      minBodyBattery: 28,
      maxBodyBattery: 72
    }];
  }
  if (sql.includes('FROM SleepSummaries')) {
    return [{
      sleepDate: '2026-06-29',
      durationS: 19800,
      sleepScore: 58,
      avgHrv: 42,
      hrvStatus: 'unbalanced',
      avgSleepStress: 32
    }];
  }
  if (sql.includes('FROM TrainingStatusSnapshots')) {
    return [{
      snapshotDate: '2026-06-29',
      trainingStatus: 'MAINTAINING',
      acuteTrainingLoad: 720,
      chronicTrainingLoad: 540,
      acuteChronicWorkloadRatio: 1.33,
      optimalLoadMax: 650
    }];
  }
  return [];
}

test('aiService reports DeepSeek provider with rule fallback', async () => {
  const health = await aiService.getHealth();

  assert.equal(health.provider, 'deepseek');
  assert.equal(health.activeProvider, health.deepseekConfigured ? 'deepseek' : 'rules');
  assert.equal(health.fallbackRules, true);
});

test('aiService daily brief uses visible dashboard overview', async () => {
  await withAiEnvironment({
    dbQuery: async () => [],
    aiConfig: { deepseekApiKey: '' },
    activityStubs: {
      getDashboardOverview: async (filters) => {
      assert.deepEqual(filters, { owner: 'all', ownerUserId: 7 });
      return {
        recentActivities: [{ id: 1, activityType: 'running', distanceM: 5000 }],
        monthlySummary: { activityCount: 1, totalDistanceKm: 5 },
        trainingLoad: [{ dailyTrainingLoad: 80, ctl: 20, atl: 24, tsb: -4 }]
      };
    }
    }
  }, async () => {
    const brief = await aiService.getDailyBrief({ id: 7 });

    assert.equal(brief.meta.ai.provider, 'rules');
    assert.equal(brief.data.sections.length, 5);
    assert.equal(brief.data.metrics.length, 4);
    assert.equal(typeof brief.data.placements.trainingLoad.text, 'string');
    assert.match(brief.data.sections[0].text, /近期共有 1 次运动/);
  });
});

test('aiService daily brief uses DeepSeek JSON with RAG system context', async () => {
  let requestBody;
  await withAiEnvironment({
    dbQuery: ragDbQuery,
    aiConfig: {
      deepseekApiKey: 'test-key',
      deepseekModel: 'deepseek-chat',
      deepseekBaseUrl: 'https://api.deepseek.com',
      fallbackRules: true
    },
    activityStubs: {
      getDashboardOverview: async () => ({
        recentActivities: [{ id: 1, activityType: 'running', distanceM: 5000 }],
        monthlySummary: { activityCount: 1, totalDistanceKm: 5 },
        trainingLoad: [{ dailyTrainingLoad: 80, ctl: 20, atl: 35, tsb: -15 }]
      })
    },
    fetchImpl: async (_url, init) => {
      requestBody = JSON.parse(init.body);
      return {
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                headline: 'DeepSeek 恢复建议',
                riskLevel: 'orange',
                recommendation: '今天以恢复跑和拉伸为主，避开高温时段。',
                weatherAdvice: '体感温度较高，户外训练要降低目标配速。',
                loadAdvice: '负荷偏紧，避免继续堆强度。',
                sleepAdvice: '睡眠评分偏低，优先补睡。',
                recoveryAdvice: '恢复优先，保留轻松活动即可。',
                sections: [
                  { key: 'recent', title: '近期运动', tone: 'warning', text: '近期训练连续性较强。' },
                  { key: 'body', title: '负荷状态', tone: 'warning', text: '短期负荷偏高。' },
                  { key: 'sleep', title: '睡眠恢复', tone: 'warning', text: '睡眠和 HRV 提示恢复不足。' },
                  { key: 'weather', title: '天气影响', tone: 'warning', text: '高温高湿会放大体感强度。' },
                  { key: 'today', title: '今日安排', tone: 'warning', text: '安排恢复跑或休息。' }
                ],
                placements: {
                  today: { title: '今日智能建议', tone: 'warning', text: '恢复优先。' },
                  trainingLoad: { title: '负荷建议', tone: 'warning', text: '降低强度。' },
                  sleep: { title: '睡眠与恢复建议', tone: 'warning', text: '优先补睡。' },
                  weather: { title: '天气影响', tone: 'warning', text: '避开高温。' }
                }
              })
            }
          }]
        })
      };
    }
  }, async () => {
    const result = await aiService.getDailyBrief({ id: 7 });

    assert.equal(result.meta.ai.provider, 'deepseek');
    assert.equal(result.meta.ai.fallback, false);
    assert.equal(result.data.headline, 'DeepSeek 恢复建议');
    assert.equal(result.data.placements.trainingLoad.text, '降低强度。');
    assert.equal(result.data.ml.provider, 'rules');
    assert.equal(result.meta.ai.contextSignals.mlProvider, 'rules');
    assert.equal(result.data.metrics.length, 4);
    assert.equal(requestBody.messages[0].role, 'system');
    assert.equal(requestBody.messages[1].role, 'user');
    assert.match(requestBody.messages[0].content, /近期运动明细/);
    assert.match(requestBody.messages[0].content, /本地模型输出/);
    assert.match(requestBody.messages[1].content, /只返回一个 JSON 对象/);
    assert.doesNotMatch(JSON.stringify(result), /近期运动明细|system prompt|28天运动汇总/);
  });
});

test('aiService daily brief falls back to rules for invalid DeepSeek JSON', async () => {
  await withAiEnvironment({
    dbQuery: ragDbQuery,
    aiConfig: {
      deepseekApiKey: 'test-key',
      fallbackRules: true
    },
    activityStubs: {
      getDashboardOverview: async () => ({
        recentActivities: [{ id: 1, activityType: 'running', distanceM: 5000 }],
        monthlySummary: { activityCount: 1, totalDistanceKm: 5 },
        trainingLoad: [{ dailyTrainingLoad: 80, ctl: 20, atl: 35, tsb: -15 }]
      })
    },
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '不是 JSON' } }] })
    })
  }, async () => {
    const result = await aiService.getDailyBrief({ id: 7 });

    assert.equal(result.meta.ai.provider, 'rules');
    assert.equal(result.meta.ai.fallback, true);
    assert.equal(result.meta.ai.contextSignals.activityCount28d, 3);
  });
});

test('aiService chat rejects empty messages and answers sports questions', async () => {
  await assert.rejects(
    () => aiService.chat({ message: '' }, { id: 2 }),
    (error) => error.code === 'INVALID_AI_INPUT'
  );

  await withAiEnvironment({
    dbQuery: async () => [],
    aiConfig: { deepseekApiKey: '' },
    activityStubs: {
      getDashboardOverview: async () => ({
      recentActivities: [],
      monthlySummary: {},
      trainingLoad: []
    })
    }
  }, async () => {
    const result = await aiService.chat({ message: '今天适合训练吗？' }, { id: 2 });

    assert.equal(result.data.role, 'assistant');
    assert.equal(result.meta.ai.provider, 'rules');
    assert.equal(result.meta.ai.contextWindowDays, 28);
    assert.match(result.data.content, /近期暂无运动记录/);
  });
});

test('aiService sends RAG context as DeepSeek system message only', async () => {
  let requestBody;
  await withAiEnvironment({
    dbQuery: ragDbQuery,
    aiConfig: {
      deepseekApiKey: 'test-key',
      deepseekModel: 'deepseek-chat',
      deepseekBaseUrl: 'https://api.deepseek.com',
      fallbackRules: true
    },
    activityStubs: {
      getDashboardOverview: async () => ({
        recentActivities: [{ id: 1, activityType: 'running', distanceM: 5000 }],
        monthlySummary: { activityCount: 1, totalDistanceKm: 5 },
        trainingLoad: [{ dailyTrainingLoad: 80, ctl: 20, atl: 35, tsb: -15 }]
      })
    },
    fetchImpl: async (_url, init) => {
      requestBody = JSON.parse(init.body);
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: '今天建议恢复跑，并避开高温时段。' } }] })
      };
    }
  }, async () => {
    const result = await aiService.chat({ message: '今天适合训练吗？' }, { id: 7 });

    assert.equal(result.meta.ai.provider, 'deepseek');
    assert.equal(result.meta.ai.fallback, false);
    assert.equal(result.data.content, '今天建议恢复跑，并避开高温时段。');
    assert.equal(requestBody.model, 'deepseek-chat');
    assert.equal(requestBody.messages[0].role, 'system');
    assert.equal(requestBody.messages[1].role, 'user');
    assert.equal(requestBody.messages[1].content, '今天适合训练吗？');
    assert.match(requestBody.messages[0].content, /近期运动明细/);
    assert.match(requestBody.messages[0].content, /多云/);
    assert.match(requestBody.messages[0].content, /本地模型输出/);
    assert.doesNotMatch(requestBody.messages[1].content, /近期运动明细|28天运动汇总|system prompt/);
    assert.doesNotMatch(JSON.stringify(result), /近期运动明细|system prompt|28天运动汇总/);
  });
});

test('aiService falls back to rules when DeepSeek fails', async () => {
  await withAiEnvironment({
    dbQuery: ragDbQuery,
    aiConfig: {
      deepseekApiKey: 'test-key',
      fallbackRules: true
    },
    activityStubs: {
      getDashboardOverview: async () => ({
        recentActivities: [],
        monthlySummary: {},
        trainingLoad: []
      })
    },
    fetchImpl: async () => ({ ok: false, json: async () => ({}) })
  }, async () => {
    const result = await aiService.chat({ message: '最近训练负荷怎么样？' }, { id: 7 });

    assert.equal(result.meta.ai.provider, 'rules');
    assert.equal(result.meta.ai.fallback, true);
    assert.equal(result.meta.ai.contextSignals.activityCount28d, 3);
  });
});

test('aiService saves feedback without prompt content', async () => {
  const queries = [];
  await withAiEnvironment({
    dbQuery: async (sql, params = []) => {
      queries.push({ sql, params });
      if (sql.includes('INSERT INTO AiCoachFeedback')) {
        return { insertId: 42 };
      }
      return [];
    }
  }, async () => {
    const result = await aiService.submitFeedback({
      suggestionType: 'daily_brief',
      feedback: 'helpful',
      suggestionDate: '2026-06-29',
      modelVersion: 'coach-v1',
      ml: {
        provider: 'local_model',
        riskLevel: 'orange',
        loadAction: 'reduce',
        weatherRisk: 'high'
      },
      coachSystemPrompt: 'should not be stored'
    }, { id: 7 });

    assert.equal(result.data.saved, true);
    assert.equal(result.data.id, 42);
    const insert = queries.find((item) => item.sql.includes('INSERT INTO AiCoachFeedback'));
    assert.ok(insert);
    assert.equal(insert.params[0], 7);
    assert.equal(insert.params[2], 'daily_brief');
    assert.equal(insert.params[4], 'helpful');
    assert.doesNotMatch(JSON.stringify(insert.params), /should not be stored|system prompt/i);
  });
});

test('aiService rejects invalid feedback payloads', async () => {
  await assert.rejects(
    () => aiService.submitFeedback({ suggestionType: 'daily_brief', feedback: 'bad' }, { id: 7 }),
    (error) => error.code === 'INVALID_AI_FEEDBACK'
  );
});

test('aiService saves morning readiness feedback with upsert', async () => {
  const queries = [];
  await withAiEnvironment({
    dbQuery: async (sql, params = []) => {
      queries.push({ sql, params });
      if (sql.includes('INSERT INTO MorningReadinessFeedback')) {
        return { insertId: 52 };
      }
      return [];
    }
  }, async () => {
    const result = await aiService.submitMorningReadiness({
      feedbackDate: '2026-06-30',
      readinessScore: 3,
      muscleSoreness: 'mild',
      mentalState: 'normal',
      trainingWillingness: 'easy',
      note: '腿有点酸'
    }, { id: 7 });

    assert.equal(result.data.saved, true);
    assert.equal(result.data.id, 52);
    const insert = queries.find((item) => item.sql.includes('INSERT INTO MorningReadinessFeedback'));
    assert.ok(insert);
    assert.equal(insert.params[0], 7);
    assert.equal(insert.params[1], '2026-06-30');
    assert.equal(insert.params[2], 3);
    assert.equal(insert.params[3], 'mild');
    assert.equal(insert.params[4], 'normal');
    assert.equal(insert.params[5], 'easy');
  });
});

test('aiService rejects invalid morning readiness payloads', async () => {
  await assert.rejects(
    () => aiService.submitMorningReadiness({
      feedbackDate: '2026-06-30',
      readinessScore: 8,
      muscleSoreness: 'mild',
      mentalState: 'normal',
      trainingWillingness: 'easy'
    }, { id: 7 }),
    (error) => error.code === 'INVALID_MORNING_READINESS'
  );
  await assert.rejects(
    () => aiService.submitMorningReadiness({
      feedbackDate: '2026-06-30',
      readinessScore: 3,
      muscleSoreness: 'bad',
      mentalState: 'normal',
      trainingWillingness: 'easy'
    }, { id: 7 }),
    (error) => error.code === 'INVALID_MORNING_READINESS'
  );
});

test('aiService analyzes existing activities and returns 404 for missing activity', async () => {
  await withActivityStubs({
    getActivityById: async (id) => (id === 1
      ? { id: 1, activityType: 'running', distanceM: 5000, durationS: 1800, avgHeartRateBpm: 145 }
      : null)
  }, async () => {
    const analysis = await aiService.analyzeActivity({ activityId: 1 }, { id: 2 });

    assert.equal(analysis.meta.ai.provider, 'rules');
    assert.equal(analysis.data.headline, '跑步智能分析');
    assert.match(analysis.data.summary, /5 km/);

    await assert.rejects(
      () => aiService.analyzeActivity({ activityId: 999 }, { id: 2 }),
      (error) => error.code === 'ACTIVITY_NOT_FOUND'
    );
  });
});
