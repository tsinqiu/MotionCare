<template>
  <div class="page-stack">
    <StateBlock v-if="loading" title="正在准备今日建议" message="正在读取身体状态、训练负荷和最近运动。" />
    <StateBlock
      v-else-if="!hasData && errors.length"
      title="今日数据加载失败"
      message="连接暂时不可用，稍后再试一次。"
      action-label="重试"
      tone="danger"
      @action="loadToday"
    />
    <template v-else-if="!hasData">
      <section class="today-empty-rq-panel">
        <div class="today-empty-rq-panel__top">
          <div>
            <p class="overline">今日跑力</p>
            <h2>新手跑力</h2>
          </div>
          <strong>--</strong>
        </div>
        <div class="score-band" aria-label="空数据跑力区间">
          <span class="score-band__segment score-band__segment--base">基础</span>
          <span class="score-band__segment score-band__segment--steady">稳定</span>
          <span class="score-band__segment score-band__segment--strong">强化</span>
          <span class="score-band__segment score-band__segment--peak">冲刺</span>
          <i class="score-band__marker" aria-hidden="true"></i>
        </div>
        <div class="today-empty-rq-panel__stats">
          <span><small>数据同步</small><b>待同步</b></span>
          <span><small>训练负荷</small><b>待记录</b></span>
          <span><small>今日建议</small><b>轻松跑</b></span>
        </div>
      </section>

      <section class="today-empty-plan">
        <div class="section-heading">
          <div>
            <p class="overline">训练节奏</p>
            <h2>训练节奏</h2>
          </div>
          <span class="status-chip neutral">等待数据</span>
        </div>
        <div class="today-empty-bars" aria-label="空数据训练节奏">
          <i v-for="bar in emptyLoadBars" :key="bar.key" :style="{ '--bar-height': bar.height }">
            <span>{{ bar.label }}</span>
          </i>
        </div>
      </section>
    </template>

    <template v-else>
      <p v-if="errors.length" class="soft-note">部分内容暂时不可用，已用现有数据为你生成建议。</p>

      <section class="rq-overview-panel">
        <div class="rq-overview-panel__top">
          <p class="overline">训练总览</p>
          <span class="status-chip" :class="statusBadge.tone">{{ statusBadge.label }}</span>
        </div>
        <div class="rq-overview-panel__score">
          <span>当前训练指数</span>
          <strong>{{ currentTrainingIndexDisplay }}</strong>
        </div>
        <div class="score-band" :style="trainingIndexStyle" aria-label="当前训练指数">
          <span class="score-band__segment score-band__segment--base">恢复</span>
          <span class="score-band__segment score-band__segment--steady">建设</span>
          <span class="score-band__segment score-band__segment--strong">推进</span>
          <span class="score-band__segment score-band__segment--peak">风险</span>
          <i class="score-band__marker" aria-hidden="true"></i>
        </div>
        <div class="rq-overview-panel__stats">
          <span><small>体能储备</small><b>{{ metricValue(currentLoad.ctl) }}</b></span>
          <span><small>疲劳负荷</small><b>{{ metricValue(currentLoad.atl) }}</b></span>
          <span><small>状态余量</small><b>{{ metricValue(currentLoad.tsb) }}</b></span>
          <span><small>最近训练</small><b>{{ recentActivities.length }}</b></span>
        </div>
      </section>

      <section class="rq-daily-advice">
        <p class="overline">每日建议 · {{ greeting }}</p>
        <h2>{{ recommendationHeadline }}</h2>
        <p>{{ recommendationText }}</p>
        <small>
          {{ briefAvailable ? '建议已结合你的近期运动生成' : '基于身体状态与训练负荷生成' }}
        </small>
      </section>

      <section class="microcycle-panel">
        <div class="section-heading">
          <div>
            <p class="overline">训练节奏</p>
            <h2>本周训练节奏</h2>
          </div>
          <span class="status-chip" :class="weekSummary.tone">{{ weekSummary.label }}</span>
        </div>
        <div class="microcycle-summary">
          <span><small>周负荷</small><b>{{ weekSummary.load }}</b></span>
          <span><small>训练日</small><b>{{ weekSummary.activeDays }}</b></span>
          <span><small>完成度</small><b>{{ weekSummary.completion }}</b></span>
        </div>
        <div class="microcycle-bars" aria-label="本周训练负荷">
          <span v-for="bar in weeklyLoadBars" :key="bar.key" :class="{ today: bar.isToday, active: bar.hasLoad }">
            <i :style="{ '--bar-height': bar.height }" aria-hidden="true"></i>
            <small>{{ bar.label }}</small>
          </span>
        </div>
        <p>{{ weekSummary.message }}</p>
      </section>

      <div class="metric-grid">
        <MetricCard label="睡眠分数" :value="metricValue(health.sleepScore)" />
        <MetricCard label="静息心率" :value="metricValue(health.restingHeartRateBpm, ' 次/分')" />
        <MetricCard label="平均压力" :value="metricValue(health.avgStressLevel)" />
        <MetricCard label="心率变异" :value="metricValue(health.avgHrv)" />
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'

import MetricCard from '@/components/MetricCard.vue'
import StateBlock from '@/components/StateBlock.vue'
import { getDailyBrief } from '@/services/ai'
import { getDashboardOverview, getTodayHealth } from '@/services/dashboard'
import { deriveStatusBadge } from '@/utils/productInsights'

const overview = ref({ recentActivities: [], monthlySummary: {}, yearlySummary: {}, trainingLoad: [] })
const health = ref({})
const brief = ref(null)
const loading = ref(false)
const errors = ref([])
const briefAvailable = ref(false)

const recentActivities = computed(() => (overview.value.recentActivities || []).slice(0, 6))
const currentLoad = computed(() => (overview.value.trainingLoad || []).at(-1) || {})
const statusBadge = computed(() => deriveStatusBadge({
  sleepScore: health.value.sleepScore,
  avgStressLevel: health.value.avgStressLevel,
  tsb: currentLoad.value.tsb,
}))
const hasData = computed(() => (
  Object.keys(health.value || {}).length > 0
  || recentActivities.value.length > 0
  || (overview.value.trainingLoad || []).length > 0
))
const recommendationHeadline = computed(() => brief.value?.headline || statusBadge.value.label)
const recommendationText = computed(() => brief.value?.recommendation || statusBadge.value.message)
const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 6) return '凌晨好，注意休息'
  if (hour < 11) return '早上好，今天适合怎么运动'
  if (hour < 14) return '中午好，今天适合怎么运动'
  if (hour < 18) return '下午好，今天适合怎么运动'
  return '晚上好，回顾今天的状态'
})
const currentTrainingIndex = computed(() => {
  const ctl = Number(currentLoad.value.ctl)
  const atl = Number(currentLoad.value.atl)
  const tsb = Number(currentLoad.value.tsb)
  if (![ctl, atl, tsb].some(Number.isFinite)) return null

  const fitness = Number.isFinite(ctl) ? ctl : 45
  const fatigueControl = Number.isFinite(atl) ? Math.max(0, 100 - Math.min(atl, 100)) * 0.18 : 6
  const freshness = Number.isFinite(tsb) ? Math.max(-12, Math.min(12, tsb)) * 0.45 : 0
  return Math.round(Math.max(0, Math.min(100, fitness + fatigueControl + freshness)))
})
const currentTrainingIndexDisplay = computed(() => currentTrainingIndex.value ?? '--')
const trainingIndexStyle = computed(() => ({
  '--score-position': `${currentTrainingIndex.value ?? 0}%`,
}))
const emptyLoadBars = computed(() => ['一', '二', '三', '四', '五', '六', '日'].map((label, index) => ({
  key: `empty-${index}`,
  label,
  height: `${18 + (index % 4) * 10}%`,
})))
const weeklyLoadBars = computed(() => {
  const rows = buildWeekRows()
  const maxLoad = Math.max(...rows.map((row) => row.load), 1)
  return rows.map((row) => ({
    ...row,
    hasLoad: row.load > 0,
    height: `${Math.max(10, Math.min(100, Math.round((row.load / maxLoad) * 100)))}%`,
  }))
})
const weekSummary = computed(() => {
  const rows = weeklyLoadBars.value
  const totalLoad = rows.reduce((sum, row) => sum + row.load, 0)
  const activeDays = rows.filter((row) => row.hasLoad).length
  const completionValue = Math.min(100, Math.round((activeDays / 5) * 100))

  if (!totalLoad) {
    return {
      label: '等待训练',
      tone: 'neutral',
      load: '--',
      activeDays: '0 天',
      completion: '0%',
      message: '本周还没有训练负荷记录，可以从一次轻松跑或同步数据开始。',
    }
  }

  const isHeavyWeek = totalLoad >= 420
  const isConsistent = activeDays >= 4
  return {
    label: isHeavyWeek ? '负荷偏高' : isConsistent ? '节奏稳定' : '继续堆量',
    tone: isHeavyWeek ? 'warning' : isConsistent ? 'good' : 'steady',
    load: Math.round(totalLoad),
    activeDays: `${activeDays} 天`,
    completion: `${completionValue}%`,
    message: isHeavyWeek
      ? '本周刺激已经足够，下一次训练优先控制强度并观察恢复。'
      : isConsistent
        ? '本周训练节奏不错，保持轻重交替，比单次猛练更稳。'
        : '本周还可以补一次低强度有氧，把训练节奏接起来。',
  }
})

function metricValue(value, unit = '') {
  return value === null || value === undefined || value === '' ? '--' : `${value}${unit}`
}

function buildWeekRows() {
  const today = startOfDay(new Date())
  const monday = new Date(today)
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7))

  const loadsByDate = new Map()
  for (const row of overview.value.trainingLoad || []) {
    const key = normalizeDateKey(row.date)
    if (!key) continue
    const load = Number(row.dailyTrainingLoad || row.daily_training_load || row.ctl || 0)
    loadsByDate.set(key, Math.max(loadsByDate.get(key) || 0, Number.isFinite(load) ? load : 0))
  }

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + index)
    const key = formatDateKey(date)
    return {
      key,
      label: ['一', '二', '三', '四', '五', '六', '日'][index],
      load: loadsByDate.get(key) || 0,
      isToday: key === formatDateKey(today),
    }
  })
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function formatDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function normalizeDateKey(value) {
  if (!value) return ''
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : formatDateKey(date)
}

async function loadToday() {
  loading.value = true
  errors.value = []
  briefAvailable.value = false
  const results = await Promise.allSettled([
    getDashboardOverview(),
    getTodayHealth(),
    getDailyBrief(),
  ])

  if (results[0].status === 'fulfilled') overview.value = results[0].value
  else {
    overview.value = { recentActivities: [], monthlySummary: {}, yearlySummary: {}, trainingLoad: [] }
    errors.value.push('运动概览加载失败')
  }
  if (results[1].status === 'fulfilled') health.value = results[1].value
  else {
    health.value = {}
    errors.value.push('身体状态加载失败')
  }
  if (results[2].status === 'fulfilled') {
    brief.value = results[2].value.data || null
    briefAvailable.value = Boolean(brief.value)
  } else {
    brief.value = null
    errors.value.push('个性化建议暂时不可用')
  }
  loading.value = false
}

onMounted(loadToday)
</script>

<style scoped>
.soft-note {
  margin: 0;
  padding: 10px 14px;
  font-size: 13px;
  color: var(--muted);
  background: var(--panel-soft);
  border-radius: var(--radius-lg);
}

.rq-daily-advice {
  display: grid;
  gap: 10px;
  padding: var(--space-5);
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--panel);
  box-shadow: var(--shadow-sm);
}
.rq-daily-advice .overline { margin: 0; }
.rq-daily-advice h2 {
  margin: 0;
  font-size: 24px;
  line-height: 1.18;
  letter-spacing: 0;
}
.rq-daily-advice p {
  margin: 0;
  color: var(--muted);
  line-height: 1.55;
}
.rq-daily-advice small {
  color: var(--faint);
  font-size: 12px;
}

.today-empty-rq-panel,
.today-empty-plan {
  display: grid;
  gap: 14px;
  padding: var(--space-5);
  border: 1px solid color-mix(in srgb, var(--app-green) 14%, var(--border));
  border-top: 4px solid var(--app-green);
  border-radius: 12px;
  background: var(--panel);
  box-shadow: var(--shadow-sm);
}
.today-empty-rq-panel__top {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 12px;
}
.today-empty-rq-panel__top .overline,
.today-empty-rq-panel__top h2 {
  margin: 0;
}
.today-empty-rq-panel__top h2 {
  margin-top: 4px;
  font-size: var(--fs-h2);
  line-height: 1.15;
}
.today-empty-rq-panel__top strong {
  color: var(--app-green-dark);
  font-size: clamp(46px, 16cqi, 68px);
  line-height: 0.9;
}
.today-empty-rq-panel__stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.today-empty-rq-panel__stats span {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 10px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--app-green) 8%, var(--panel-soft));
}
.today-empty-rq-panel__stats small {
  color: var(--muted);
  font-size: 11px;
}
.today-empty-rq-panel__stats b {
  min-width: 0;
  color: var(--text);
  font-size: 14px;
  overflow-wrap: anywhere;
}
.today-empty-plan .section-heading {
  margin: 0;
}
.today-empty-bars {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  align-items: end;
  gap: 6px;
  height: 92px;
  padding: 10px 6px 0;
  border-radius: 12px;
  background: color-mix(in srgb, var(--app-green) 7%, var(--panel-soft));
}
.today-empty-bars i {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  align-items: end;
  gap: 6px;
  min-width: 0;
  height: 100%;
  font-style: normal;
}
.today-empty-bars i::before {
  content: "";
  justify-self: center;
  width: min(100%, 18px);
  height: var(--bar-height);
  min-height: 8px;
  border-radius: 999px 999px 3px 3px;
  background: color-mix(in srgb, var(--app-green) 26%, var(--border));
}
.today-empty-bars span {
  color: var(--muted);
  font-size: 11px;
  font-weight: 800;
  text-align: center;
}
.microcycle-panel {
  display: grid;
  gap: 14px;
  padding: var(--space-5);
  border: 1px solid color-mix(in srgb, var(--app-green) 14%, var(--border));
  border-top: 4px solid var(--app-green);
  border-radius: 12px;
  background: var(--panel);
  box-shadow: var(--shadow-sm);
}
.microcycle-panel .overline,
.microcycle-panel h2,
.microcycle-panel p {
  margin: 0;
}
.microcycle-panel h2 {
  margin-top: 3px;
  font-size: var(--fs-h2);
  line-height: 1.18;
}
.microcycle-panel > p {
  color: var(--muted);
  line-height: 1.5;
}
.microcycle-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.microcycle-summary span {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 10px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--app-green) 8%, var(--panel-soft));
}
.microcycle-summary small {
  color: var(--muted);
  font-size: 11px;
}
.microcycle-summary b {
  min-width: 0;
  color: var(--text);
  font-size: var(--fs-title);
  line-height: 1.1;
  overflow-wrap: anywhere;
}
.microcycle-bars {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  align-items: end;
  gap: 6px;
  height: 86px;
  padding: 10px 6px 0;
  border-radius: 12px;
  background: color-mix(in srgb, var(--app-green) 7%, var(--panel-soft));
}
.microcycle-bars span {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  align-items: end;
  gap: 6px;
  min-width: 0;
  height: 100%;
}
.microcycle-bars i {
  justify-self: center;
  width: min(100%, 18px);
  height: var(--bar-height);
  min-height: 7px;
  border-radius: 999px 999px 3px 3px;
  background: color-mix(in srgb, var(--app-green) 18%, var(--border));
}
.microcycle-bars span.active i {
  background: linear-gradient(180deg, var(--app-green), var(--app-green-dark));
}
.microcycle-bars span.today i {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--app-green) 18%, transparent);
}
.microcycle-bars small {
  color: var(--muted);
  font-size: 11px;
  font-weight: 800;
  text-align: center;
}
.microcycle-bars span.today small {
  color: var(--app-green-dark);
}

</style>
