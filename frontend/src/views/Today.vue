<template>
  <div class="page-stack today-home">
    <StateBlock v-if="loading" title="正在准备今日建议" message="正在读取身体状态、训练负荷和最近运动。" />
    <StateBlock
      v-else-if="!hasData && errors.length"
      title="今日数据加载失败"
      message="连接暂时不可用，稍后再试一次。"
      action-label="重试"
      tone="danger"
      @action="loadToday"
    />

    <template v-else>
      <p v-if="errors.length" class="soft-note">部分内容暂时不可用，已用现有数据为你生成建议。</p>

      <header class="today-date-nav" aria-label="日期切换">
        <button type="button" aria-label="前一天" @click="shiftSelectedDate(-1)">
          <ChevronLeft :size="24" />
        </button>
        <strong>{{ selectedDateLabel }}</strong>
        <button type="button" aria-label="后一天" :disabled="!canShiftNextDate" @click="shiftSelectedDate(1)">
          <ChevronRight :size="24" />
        </button>
      </header>

      <RouterLink v-if="showApkDownloadEntry" class="today-apk-entry" :to="{ name: 'download' }">
        <span class="today-apk-entry__icon" aria-hidden="true">
          <DownloadIcon :size="22" />
        </span>
        <span class="today-apk-entry__copy">
          <strong>下载安卓版 APK</strong>
          <small>手机安装包</small>
        </span>
      </RouterLink>

      <section class="today-weather-card">
        <div class="today-weather-card__top">
          <span class="weather-pin" aria-hidden="true">
            <MapPin :size="24" />
          </span>
          <div class="weather-copy">
            <h2>{{ weatherCard.location }}</h2>
            <p>{{ weatherCard.message }}</p>
          </div>
          <div class="weather-temp" aria-label="当前温度">
            <Sun :size="34" />
            <strong>{{ weatherCard.temperature }}</strong>
          </div>
        </div>
        <div class="today-weather-card__bottom">
          <div>
            <span>体感 {{ weatherCard.feelsLike }}</span>
            <span>风力 {{ weatherCard.wind }}</span>
          </div>
          <button type="button" class="location-pill">
            <Crosshair :size="18" />
            开启定位
          </button>
        </div>
      </section>

      <nav class="today-action-grid" aria-label="今日快捷入口">
        <RouterLink v-for="item in todayActions" :key="item.label" :to="item.to">
          <component :is="item.icon" :size="32" :style="{ color: item.color }" aria-hidden="true" />
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <section class="today-activity-section">
        <ActivityCard
          v-for="activity in selectedDateActivities"
          :key="activity.id || activity.activity_key"
          :activity="activity"
          @select="openActivity"
        />
        <article v-if="!selectedDateActivities.length" class="today-no-activity-card">
          <span aria-hidden="true">
            <CalendarDays :size="34" />
          </span>
          <strong>今日无训练安排</strong>
        </article>
      </section>

      <section class="rq-overview-panel training-index-panel">
        <div class="rq-overview-panel__top">
          <h2 class="training-index-title">训练指数</h2>
        </div>
        <div class="rq-overview-panel__score training-index-score">
          <span class="training-index-advice">{{ compactTrainingAdvice }}</span>
          <strong>{{ trainingIndexDisplay }}</strong>
        </div>
        <div class="performance-gradient-track" :style="trainingIndexStyle" aria-label="训练指数">
          <span>恢复</span>
          <span>稳态</span>
          <span>训练</span>
          <i class="score-band__marker" aria-hidden="true"></i>
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
            <h2>本周负荷</h2>
          </div>
          <span class="status-chip" :class="weekSummary.tone">{{ weekSummary.label }}</span>
        </div>
        <div class="microcycle-summary">
          <span><small>周负荷</small><b>{{ weekSummary.load }}</b></span>
          <span><small>训练日</small><b>{{ weekSummary.activeDays }}</b></span>
          <span><small>完成度</small><b>{{ weekSummary.completion }}</b></span>
        </div>
        <div class="microcycle-bars" aria-label="本周训练负荷">
          <span
            v-for="bar in weeklyLoadBars"
            :key="bar.key"
            :class="{ today: bar.isToday, active: bar.hasLoad }"
            :title="bar.tooltip"
            :aria-label="bar.tooltip"
          >
            <i :style="{ '--bar-height': bar.height }" aria-hidden="true"></i>
            <small>{{ bar.label }}</small>
          </span>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { Capacitor } from '@capacitor/core'
import { computed, onMounted, ref } from 'vue'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Crosshair,
  Download as DownloadIcon,
  HeartPulse,
  MapPin,
  Sun,
  TrendingUp,
} from '@lucide/vue'
import { useRouter } from 'vue-router'

import ActivityCard from '@/components/ActivityCard.vue'
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
const selectedDate = ref(startOfDay(new Date()))
const showApkDownloadEntry = !Capacitor.isNativePlatform()

const recentActivities = computed(() => (overview.value.recentActivities || []).slice(0, 6))
const selectedDateActivities = computed(() => recentActivities.value.filter((activity) => (
  normalizeDateKey(activity.local_start_time || activity.start_time_utc) === formatDateKey(selectedDate.value)
)))
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
const compactTrainingAdvice = computed(() => {
  const text = trainingIndex.value?.recommendation || brief.value?.recommendation || statusBadge.value.message || ''
  const advice = text.replace(/[。.!！]$/, '')
  const label = trainingIndexLabel.value || ''
  if (!label) return advice
  if (!advice) return label
  return advice.startsWith(label) ? advice : `${label}，${advice}`
})
const trainingIndexStyle = computed(() => ({
  '--score-position': `${trainingIndexScore.value ?? 0}%`,
}))
const selectedDateLabel = computed(() => {
  const date = selectedDate.value
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()]
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}，${week}`
})
const canShiftNextDate = computed(() => formatDateKey(selectedDate.value) < formatDateKey(startOfDay(new Date())))
const todayActions = [
  { label: '运动日历', to: { path: '/status/calendar', query: { from: 'today' } }, icon: CalendarDays, color: '#2563eb' },
  { label: '健康度', to: { path: '/status/health', query: { from: 'today' } }, icon: HeartPulse, color: '#f59e0b' },
  { label: '趋势', to: { path: '/status/trends', query: { from: 'today' } }, icon: TrendingUp, color: '#0ea5e9' },
  { label: '训练计划', to: { path: '/training-plans', query: { from: 'today' } }, icon: ClipboardList, color: '#16a34a' },
]
const latestWeatherActivity = computed(() => recentActivities.value.find((activity) => (
  activity.weather_condition || activity.temperature_c != null || activity.feels_like_c != null || activity.humidity_percent != null
)) || recentActivities.value[0] || null)
const weatherCard = computed(() => {
  const activity = latestWeatherActivity.value
  const temperature = activity?.temperature_c
  const feelsLike = activity?.feels_like_c ?? temperature
  const humidity = activity?.humidity_percent
  const location = activity?.location_name || '最近运动地点'
  const hasWeather = activity && (activity.weather_condition || temperature != null || feelsLike != null || humidity != null)
  return {
    location,
    message: hasWeather ? weatherMessage(temperature, humidity, activity.weather_condition) : '天气数据待同步，建议运动前确认天气。',
    temperature: temperature == null ? '--°' : `${Math.round(temperature)}°`,
    feelsLike: feelsLike == null ? '--°C' : `${Math.round(feelsLike)}°C`,
    wind: '--级',
  }
})
const weeklyLoadBars = computed(() => {
  const rows = buildWeekRows()
  const maxLoad = Math.max(...rows.map((row) => row.load), 1)
  return rows.map((row) => ({
    ...row,
    hasLoad: row.load > 0,
    height: `${Math.max(10, Math.min(100, Math.round((row.load / maxLoad) * 100)))}%`,
    tooltip: `${row.label}：训练负荷 ${Math.round(row.load)}`,
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

function shiftSelectedDate(offset) {
  const next = new Date(selectedDate.value)
  next.setDate(next.getDate() + offset)
  const normalized = startOfDay(next)
  const today = startOfDay(new Date())
  selectedDate.value = normalized > today ? today : normalized
}

function openActivity(activity) {
  if (activity?.id) router.push(`/activities/${activity.id}`)
}

function weatherMessage(temperature, humidity, condition) {
  const temp = Number(temperature)
  const humid = Number(humidity)
  const riskyCondition = /雨|雪|雷|storm|rain|snow/i.test(condition || '')
  if (riskyCondition) return '天气不稳，户外运动注意安全。'
  if (Number.isFinite(temp) && (temp < 3 || temp > 32)) return '气温不太理想，建议降低训练强度。'
  if (Number.isFinite(humid) && humid >= 85) return '湿度偏高，运动时注意补水和降强度。'
  return '天气适宜，适合户外运动。'
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
.today-home {
  gap: 16px;
}

.today-date-nav {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 44px;
  align-items: center;
  min-height: 56px;
  border: 1px solid color-mix(in srgb, var(--app-green) 12%, var(--border));
  border-radius: 14px;
  background: var(--panel);
  box-shadow: var(--shadow-sm);
}

.today-date-nav button {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border: 0;
  background: transparent;
  color: var(--text);
  cursor: pointer;
}

.today-date-nav button:disabled {
  color: color-mix(in srgb, var(--muted) 48%, transparent);
  cursor: not-allowed;
  opacity: 0.42;
}

.today-date-nav strong {
  min-width: 0;
  color: var(--text);
  font-size: 20px;
  line-height: 1.2;
  text-align: center;
}

.today-apk-entry {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  min-height: 62px;
  padding: 12px 16px;
  border: 1px solid color-mix(in srgb, var(--app-green) 20%, var(--border));
  border-radius: 16px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--app-green) 13%, var(--panel)), var(--panel));
  color: var(--text);
  text-decoration: none;
  box-shadow: var(--shadow-sm);
}

.today-apk-entry__icon {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 14px;
  background: var(--app-green);
  color: #fff;
}

.today-apk-entry__copy {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.today-apk-entry__copy strong {
  color: var(--text);
  font-size: 17px;
  line-height: 1.2;
}

.today-apk-entry__copy small {
  color: var(--muted);
  font-size: 12px;
  font-weight: 800;
}

.today-weather-card {
  display: grid;
  gap: 16px;
  padding: 18px;
  border: 1px solid color-mix(in srgb, var(--app-green) 18%, var(--border));
  border-radius: 18px;
  background: var(--panel);
  box-shadow: 0 14px 34px rgb(15 23 42 / 0.08);
}

.today-weather-card__top {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
}

.weather-pin {
  width: 54px;
  height: 54px;
  display: grid;
  place-items: center;
  border-radius: 18px;
  background: color-mix(in srgb, var(--app-green) 12%, var(--panel-soft));
  color: var(--app-green);
}

.weather-copy {
  min-width: 0;
}

.weather-copy h2 {
  margin: 0;
  color: var(--text);
  font-size: 22px;
  line-height: 1.2;
}

.weather-copy p {
  margin: 6px 0 0;
  color: var(--muted);
  line-height: 1.45;
}

.weather-temp {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: #f59e0b;
}

.weather-temp strong {
  color: var(--text);
  font-size: 42px;
  line-height: 1;
}

.today-weather-card__bottom {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  padding-top: 14px;
  border-top: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
}

.today-weather-card__bottom div {
  display: grid;
  gap: 4px;
  color: var(--text);
  line-height: 1.35;
}

.location-pill {
  min-height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 18px;
  border: 0;
  border-radius: 999px;
  background: var(--app-green);
  color: #fff;
  font-weight: 900;
  white-space: nowrap;
  cursor: pointer;
}

.today-action-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  padding: 2px 0;
}

.today-action-grid a {
  display: grid;
  justify-items: center;
  gap: 9px;
  min-width: 0;
  padding: 10px 4px;
  color: var(--text);
  font-weight: 900;
  line-height: 1.2;
  text-align: center;
  text-decoration: none;
}

.today-action-grid span {
  min-width: 0;
  font-size: 14px;
  overflow-wrap: anywhere;
}

.today-activity-section {
  display: grid;
  gap: 12px;
}

.today-no-activity-card {
  min-height: 92px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 16px;
  padding: 18px;
  border: 1px solid color-mix(in srgb, var(--border) 80%, var(--app-green));
  border-radius: 18px;
  background: var(--panel);
  box-shadow: var(--shadow-sm);
}

.today-no-activity-card span {
  width: 58px;
  height: 58px;
  display: grid;
  place-items: center;
  border-radius: 16px;
  background: color-mix(in srgb, var(--muted) 10%, var(--panel-soft));
  color: var(--muted);
}

.today-no-activity-card strong {
  color: var(--text);
  font-size: 20px;
  line-height: 1.25;
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
  gap: 12px;
  padding: 18px;
}

.training-index-panel .rq-overview-panel__top {
  display: block;
  margin-bottom: -2px;
}

.training-index-title {
  margin: 0;
  color: var(--text);
  font-size: 24px;
  line-height: 1.12;
  font-weight: 900;
  letter-spacing: 0;
}

.training-index-panel .rq-overview-panel__score {
  align-items: start;
  margin-top: -12px;
}

.training-index-panel .rq-overview-panel__score span {
  color: var(--muted);
  font-size: 16px;
  font-weight: 400;
}

.training-index-panel .rq-overview-panel__score strong {
  letter-spacing: 0;
  line-height: 0.82;
  transform: translateY(-18px);
}

.training-index-score {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 16px;
  min-height: 62px;
}

.training-index-advice {
  max-width: 250px;
  padding-top: 20px;
  color: var(--muted);
  line-height: 1.5;
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

.training-index-panel .rq-overview-panel__stats {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 0;
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
  gap: 16px;
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
  font-size: 25px;
  line-height: 1.14;
}

.microcycle-panel .status-chip {
  font-size: 15px;
  font-weight: 500;
}
.microcycle-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.microcycle-summary span {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 12px 11px;
  border-radius: 12px;
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
  height: 108px;
  padding: 12px 10px 0;
  border-radius: 14px;
  background: color-mix(in srgb, var(--app-green) 7%, var(--panel-soft));
}
.microcycle-bars span {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  align-items: end;
  gap: 6px;
  min-width: 0;
  height: 100%;
  cursor: default;
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
