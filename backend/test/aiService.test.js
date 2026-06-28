const test = require('node:test');
const assert = require('node:assert/strict');

const aiService = require('../src/services/aiService');
const activityService = require('../src/services/activityService');

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

test('aiService reports local rule provider', async () => {
  const health = await aiService.getHealth();

  assert.equal(health.status, 'ok');
  assert.equal(health.provider, 'rules');
  assert.equal(health.fallbackRules, true);
});

test('aiService daily brief uses visible dashboard overview', async () => {
  await withActivityStubs({
    getDashboardOverview: async (filters) => {
      assert.deepEqual(filters, { owner: 'all', ownerUserId: 7 });
      return {
        recentActivities: [{ id: 1, activityType: 'running', distanceM: 5000 }],
        monthlySummary: { activityCount: 1, totalDistanceKm: 5 },
        trainingLoad: [{ dailyTrainingLoad: 80, ctl: 20, atl: 24, tsb: -4 }]
      };
    }
  }, async () => {
    const brief = await aiService.getDailyBrief({ id: 7 });

    assert.equal(brief.meta.ai.provider, 'rules');
    assert.equal(brief.data.sections.length, 3);
    assert.equal(brief.data.metrics.length, 4);
    assert.match(brief.data.sections[0].text, /近期共有 1 次运动/);
  });
});

test('aiService chat rejects empty messages and answers sports questions', async () => {
  await assert.rejects(
    () => aiService.chat({ message: '' }, { id: 2 }),
    (error) => error.code === 'INVALID_AI_INPUT'
  );

  await withActivityStubs({
    getDashboardOverview: async () => ({
      recentActivities: [],
      monthlySummary: {},
      trainingLoad: []
    })
  }, async () => {
    const result = await aiService.chat({ message: '今天适合训练吗？' }, { id: 2 });

    assert.equal(result.data.role, 'assistant');
    assert.equal(result.meta.ai.provider, 'rules');
    assert.match(result.data.content, /近期暂无运动记录/);
  });
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
