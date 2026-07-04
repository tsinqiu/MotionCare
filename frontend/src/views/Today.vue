<template>
  <div class="page-stack">
    <button type="button" class="android-download-link today-download-entry" aria-label="前往安卓版下载页" @click="goToDownload">
      <span>
        <small>手机安装包</small>
        <strong>下载安卓版</strong>
      </span>
      <DownloadIcon :size="20" aria-hidden="true" />
    </button>

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

      <section class="rq-overview-panel training-index-panel">
        <div class="rq-overview-panel__top">
          <p class="overline training-index-greeting">晚上好</p>
          <span class="status-chip" :class="trainingIndexTone">{{ trainingIndexLabel }}</span>
        </div>
        <div class="rq-overview-panel__score">
          <span>训练指数</span>
          <strong>{{ trainingIndexDisplay }}</strong>
        </div>
        <div class="performance-gradient-track" :style="trainingIndexStyle" aria-label="训练指数">
          <span>恢复</span>
          <span>稳态</span>
          <span>训练</span>
          <i class="score-band__marker" aria-hidden="true"></i>
        </div>
        <div class="training-index-copy">
          <h2>{{ recommendationHeadline }}</h2>
          <p>{{ recommendationText }}</p>
        </div>
        <div class="rq-overview-panel__stats">
          <span><small>体能（CTL）</small><b>{{ metricValue(currentLoad.ctl) }}</b></span>
          <span><small>疲劳（ATL）</small><b>{{ metricValue(currentLoad.atl) }}</b></span>
          <span><small>状态（TSB）</small><b>{{ metricValue(currentLoad.tsb) }}</b></span>
        </div>
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
import { Download as DownloadIcon } from '@lucide/vue'
import { useRouter } from 'vue-router'

import MetricCard from '@/components/MetricCard.vue'
import StateBlock from '@/components/StateBlock.vue'
import { getDailyBrief } from '@/services/ai'
import { getDashboardOverview, getTodayHealth } from '@/services/dashboard'
import { getPerformanceProfile } from '@/services/performance'
import { deriveStatusBadge } from '@/utils/productInsights'

const router = useRouter()
const overview = ref({ recentActivities: [], monthlySummary: {}, yearlySummary: {}, trainingLoad: [] })
const health = ref({})
const brief = ref(null)
const performanceProfile = ref(null)
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
const recommendationText = computed(() => trainingIndex.value?.recommendation || brief.value?.recommendation || statusBadge.value.message)
const trainingIndex = computed(() => performanceProfile.value?.trainingIndex || null)
const trainingIndexScore = computed(() => {
  const fromProfile = Number(trainingIndex.value?.score)
  if (Number.isFinite(fromProfile)) return Math.max(0, Math.min(100, Math.round(fromProfile)))
  const fromBrief = Number(brief.value?.ml?.trainingIndexScore ?? brief.value?.ml?.readinessScore)
  return Number.isFinite(fromBrief) ? Math.max(0, Math.min(100, Math.round(fromBrief))) : null
})
const trainingIndexDisplay = computed(() => trainingIndexScore.value ?? '--')
const trainingIndexLabel = computed(() => trainingIndex.value?.label || brief.value?.ml?.trainingIndexLabel || statusBadge.value.label)
const trainingIndexTone = computed(() => {
  const score = trainingIndexScore.value
  if (score === null) return statusBadge.value.tone
  if (score < 45) return 'danger'
  if (score < 65) return 'warning'
  if (score < 80) return 'steady'
  return 'good'
})
const trainingIndexStyle = computed(() => ({
  '--score-position': `${trainingIndexScore.value ?? 0}%`,
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

function goToDownload() {
  router.push('/download')
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
    getPerformanceProfile(),
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
  if (results[3].status === 'fulfilled') {
    performanceProfile.value = results[3].value
  } else {
    performanceProfile.value = null
    errors.value.push('训练指数模型暂时不可用')
  }
  loading.value = false
}

onMounted(loadToday)
</script>

<style scoped>
.today-download-entry {
  width: 100%;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

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

.training-index-panel {
  gap: 16px;
  padding: 20px 18px 22px;
}

.training-index-panel .rq-overview-panel__top {
  align-items: center;
}

.training-index-panel .status-chip {
  padding-inline: 15px;
}

.training-index-greeting {
  margin: 0;
  color: var(--app-green);
  font-size: 17px;
  font-weight: 900;
  letter-spacing: 0;
}

.training-index-panel .rq-overview-panel__score {
  align-items: end;
  margin-top: 2px;
}

.training-index-panel .rq-overview-panel__score span {
  color: var(--muted);
  font-size: 16px;
  font-weight: 900;
}

.training-index-panel .rq-overview-panel__score strong {
  letter-spacing: 0;
  line-height: 0.9;
}

.performance-gradient-track {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: center;
  min-height: 40px;
  overflow: visible;
  border-radius: 999px;
  background:
    linear-gradient(90deg, rgb(255 255 255 / 0.2), rgb(255 255 255 / 0)),
    linear-gradient(90deg, #38bdf8 0%, #16c784 47%, #f59e0b 76%, #ef4444 100%);
  box-shadow:
    inset 0 0 0 1px rgb(255 255 255 / 0.2),
    0 8px 18px rgb(16 185 129 / 0.14);
}

.performance-gradient-track span {
  position: relative;
  z-index: 1;
  min-width: 0;
  color: #fff;
  font-size: 12px;
  font-weight: 900;
  text-align: center;
  text-shadow: 0 1px 2px rgb(0 0 0 / 0.18);
}

.performance-gradient-track .score-band__marker {
  top: 50%;
  left: var(--score-position);
  width: 18px;
  height: 18px;
  border: 3px solid #fff;
  border-radius: 999px;
  background: var(--app-green-dark);
  box-shadow:
    0 0 0 3px rgb(16 185 129 / 0.16),
    0 6px 14px rgb(15 23 42 / 0.24);
  transform: translate(-50%, -50%);
}

.performance-gradient-track .score-band__marker::after {
  content: "";
  position: absolute;
  left: 50%;
  bottom: -8px;
  width: 3px;
  height: 8px;
  border-radius: 999px;
  background: var(--app-green-dark);
  transform: translateX(-50%);
}

.training-index-copy {
  display: grid;
  gap: 6px;
  padding-top: 2px;
}

.training-index-copy h2 {
  margin: 0;
  font-size: 27px;
  line-height: 1.18;
}

.training-index-copy p {
  margin: 0;
  color: var(--muted);
  font-size: 16px;
  line-height: 1.55;
}

.training-index-panel .rq-overview-panel__stats {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 2px;
}

.training-index-panel .rq-overview-panel__stats span {
  padding: 13px 12px;
  border: 1px solid color-mix(in srgb, var(--app-green) 10%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--app-green) 7%, var(--panel-soft));
}

.training-index-panel .rq-overview-panel__stats small {
  font-size: 12px;
  font-weight: 800;
}

.training-index-panel .rq-overview-panel__stats b {
  color: var(--text);
  font-size: 17px;
  line-height: 1.15;
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
