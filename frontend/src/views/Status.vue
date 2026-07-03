<template>
  <div class="page-stack">
    <section class="status-hero">
      <div class="status-hero__top">
        <p class="overline">身体与训练</p>
        <span class="status-chip" :class="statusBadge.tone">{{ statusBadge.label }}</span>
      </div>
      <p class="status-hero__message">{{ statusBadge.message }}</p>
    </section>

    <StateBlock v-if="loading" title="正在加载状态" message="正在汇总健康、负荷、纪录和日历。" />
    <StateBlock
      v-else-if="!hasData && errors.length"
      title="状态加载失败"
      :message="errors.join('；')"
      action-label="重试"
      tone="danger"
      @action="load"
    />
    <template v-else-if="!hasData">
      <section class="status-empty-rq-panel" aria-label="空态也保留跑力分析入口">
        <div class="status-empty-rq-panel__head">
          <div>
            <p class="overline">跑步五力</p>
            <h2>等待跑力</h2>
          </div>
          <span class="status-chip neutral">数据不足</span>
        </div>
        <div class="status-empty-rq-panel__body">
          <div class="status-empty-radar" aria-label="空数据五力雷达">
            <svg viewBox="0 0 160 160" role="img" aria-labelledby="empty-rq-title">
              <title id="empty-rq-title">等待跑力雷达</title>
              <polygon points="80,16 140,60 117,130 43,130 20,60" />
              <polygon points="80,45 112,69 100,108 60,108 48,69" />
            </svg>
            <span>耐力</span>
            <span>速度</span>
            <span>技术</span>
            <span>肌力</span>
            <span>稳定</span>
          </div>
        <div class="status-empty-metrics">
          <span><small>恢复概览</small><b>待同步</b></span>
          <span><small>训练负荷</small><b>待记录</b></span>
          <span><small>跑力等级</small><b>--</b></span>
        </div>
      </div>
      </section>
    </template>

      <template v-else>
      <p v-if="errors.length" class="soft-note">部分数据暂时不可用，其余内容已正常显示。</p>

      <div class="metric-grid">
        <MetricCard label="睡眠分数" :value="metricValue(health.sleepScore)" />
        <MetricCard label="静息心率" :value="metricValue(health.restingHeartRateBpm, ' 次/分')" />
        <MetricCard label="平均压力" :value="metricValue(health.avgStressLevel)" />
        <MetricCard label="心率变异" :value="metricValue(health.avgHrv)" />
      </div>

      <section class="rq-score-panel">
        <div class="rq-score-panel__title">
          <span>当前跑力</span>
          <small>{{ runningPowerLevel }}</small>
        </div>
        <strong>{{ runningPowerDisplay }}</strong>
        <div class="score-band" :style="scoreMarkerStyle" aria-label="跑力等级">
          <span class="score-band__segment score-band__segment--base">基础</span>
          <span class="score-band__segment score-band__segment--steady">稳定</span>
          <span class="score-band__segment score-band__segment--strong">强劲</span>
          <span class="score-band__segment score-band__segment--peak">巅峰</span>
          <i class="score-band__marker" aria-hidden="true"></i>
        </div>
      </section>

      <section class="rq-five-power-panel">
        <div class="rq-five-power-panel__head">
          <div>
            <p class="overline">跑步五力</p>
            <h2>五力分析图</h2>
          </div>
          <span class="status-chip" :class="statusBadge.tone">{{ runningPowerLevel }}</span>
        </div>
        <div class="rq-five-power-panel__body">
          <div class="rq-five-power-radar" aria-label="跑步五力雷达">
            <svg viewBox="0 0 160 160" role="img" aria-labelledby="rq-five-power-title">
              <title id="rq-five-power-title">五力分析图</title>
              <polygon class="rq-five-power-radar__grid" points="80,14 142,59 118,132 42,132 18,59" />
              <polygon class="rq-five-power-radar__grid rq-five-power-radar__grid--inner" points="80,40 117,68 103,112 57,112 43,68" />
              <line
                v-for="axis in rqRadarAxes"
                :key="`axis-${axis.label}`"
                class="rq-five-power-radar__axis"
                x1="80"
                y1="80"
                :x2="axis.x"
                :y2="axis.y"
              />
              <polygon class="rq-five-power-radar__shape" :points="rqRadarPoints" />
              <circle
                v-for="point in rqRadarPointCoords"
                :key="`point-${point.label}`"
                class="rq-five-power-radar__point"
                :cx="point.x"
                :cy="point.y"
                r="3.2"
              />
            </svg>
            <span
              v-for="axis in rqRadarAxes"
              :key="`label-${axis.label}`"
              :style="{ '--axis-x': `${axis.labelX}%`, '--axis-y': `${axis.labelY}%` }"
            >
              {{ axis.label }}
            </span>
          </div>
          <div class="rq-five-power-list">
            <article v-for="axis in rqPowerAxes" :key="axis.label">
              <div>
                <span>{{ axis.label }}</span>
                <strong>{{ axis.value }}</strong>
              </div>
              <p>{{ axis.detail }}</p>
              <i :style="{ '--axis-score': `${axis.value}%` }" aria-hidden="true"></i>
            </article>
          </div>
        </div>
        <div class="rq-load-bars" aria-label="最近训练负荷">
          <i v-for="bar in recentLoadBars" :key="bar.key" :style="{ '--bar-height': bar.height }">
            <span>{{ bar.label }}</span>
          </i>
        </div>
      </section>

      <section class="analysis-category-grid" aria-label="跑步分析分类">
        <article
          v-for="category in analysisCategories"
          :key="category.title"
          class="analysis-category-card"
          :class="`analysis-category-card--${category.tone}`"
        >
          <span>{{ category.title }}</span>
          <strong>{{ category.value }}</strong>
          <small>{{ category.caption }}</small>
        </article>
      </section>

      <section class="dark-panel">
        <div class="section-heading">
          <div><h2>训练负荷</h2></div>
        </div>
        <p class="load-reading">{{ loadReading }}</p>
        <div class="training-targets">
          <span><small>体能储备</small><b>{{ metricValue(currentLoad.ctl) }}</b></span>
          <span><small>疲劳负荷</small><b>{{ metricValue(currentLoad.atl) }}</b></span>
          <span><small>状态余量</small><b>{{ metricValue(currentLoad.tsb) }}</b></span>
          <span><small>今日负荷</small><b>{{ metricValue(currentLoad.dailyTrainingLoad) }}</b></span>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'

import MetricCard from '@/components/MetricCard.vue'
import StateBlock from '@/components/StateBlock.vue'
import { getTodayHealth } from '@/services/dashboard'
import { getCalendarStats, getPersonalBests } from '@/services/stats'
import { getLoadBalance } from '@/services/training'
import { deriveStatusBadge } from '@/utils/productInsights'

const health = ref({})
const loadRows = ref([])
const personalBests = ref({})
const calendar = ref({ days: [] })
const errors = ref([])
const loading = ref(false)

const currentLoad = computed(() => loadRows.value.at(-1) || {})
const statusBadge = computed(() => deriveStatusBadge({
  sleepScore: health.value.sleepScore,
  avgStressLevel: health.value.avgStressLevel,
  tsb: currentLoad.value.tsb,
}))
const activeDays = computed(() => (calendar.value.days || []).filter((day) => day.activities?.length))
const loadReading = computed(() => {
  const tsb = currentLoad.value.tsb
  if (tsb === null || tsb === undefined || tsb === '') {
    return '继续记录运动，就能看到体能与疲劳之间的平衡。'
  }
  const value = Number(tsb)
  if (value <= -20) return '疲劳明显高于体能，最近练得比较猛，注意安排恢复。'
  if (value < -8) return '正在积累训练负荷，保持节奏，别忽略睡眠和放松。'
  if (value <= 10) return '体能和疲劳比较平衡，可以按计划继续训练。'
  return '身体比较轻松，适合安排一次高质量训练或比赛。'
})
const pbHighlights = computed(() => {
  const groups = [
    ['跑步', personalBests.value.running],
    ['骑行', personalBests.value.cycling],
    ['游泳', personalBests.value.swimming],
    ['综合', personalBests.value.overall],
  ]
  return groups.flatMap(([group, items]) => (items || []).slice(0, 2).map((item) => ({ ...item, group }))).slice(0, 6)
})
const runningRecord = computed(() => pbHighlights.value.find((item) => item.group === '跑步') || null)
const runningPowerScore = computed(() => {
  const ctl = Number(currentLoad.value.ctl)
  const tsb = Number(currentLoad.value.tsb)
  const dailyLoad = Number(currentLoad.value.dailyTrainingLoad)
  if (![ctl, tsb, dailyLoad].some(Number.isFinite)) return null

  const base = Number.isFinite(ctl) ? ctl : 45
  const freshness = Number.isFinite(tsb) ? Math.max(-12, Math.min(12, tsb)) * 0.35 : 0
  const stimulus = Number.isFinite(dailyLoad) ? Math.min(dailyLoad, 120) * 0.05 : 0
  return Math.round(Math.max(0, Math.min(100, base + freshness + stimulus)))
})
const runningPowerDisplay = computed(() => runningPowerScore.value ?? '--')
const runningPowerLevel = computed(() => {
  const score = runningPowerScore.value
  if (score === null) return '数据不足'
  if (score < 45) return '基础'
  if (score < 65) return '稳定'
  if (score < 82) return '强劲'
  return '巅峰'
})
const scoreMarkerStyle = computed(() => ({
  '--score-position': `${runningPowerScore.value ?? 0}%`,
}))
const rqPowerAxes = computed(() => {
  const ctl = toFiniteNumber(currentLoad.value.ctl)
  const tsb = toFiniteNumber(currentLoad.value.tsb)
  const dailyLoad = toFiniteNumber(currentLoad.value.dailyTrainingLoad)
  const sleep = toFiniteNumber(health.value.sleepScore)
  const stress = toFiniteNumber(health.value.avgStressLevel)
  const hrv = toFiniteNumber(health.value.avgHrv)
  const basePower = runningPowerScore.value ?? 48

  return [
    {
      label: '耐力',
      value: clampScore(Number.isFinite(ctl) ? ctl : basePower, 44),
      detail: '体能储备与长期负荷',
    },
    {
      label: '速度',
      value: clampScore(basePower * 0.72 + (Number.isFinite(dailyLoad) ? dailyLoad * 0.18 : 8), 42),
      detail: '跑力表现与训练刺激',
    },
    {
      label: '技术',
      value: clampScore((Number.isFinite(stress) ? 100 - stress : 58) * 0.48 + basePower * 0.38, 46),
      detail: '压力控制与动作稳定性',
    },
    {
      label: '肌力',
      value: clampScore((Number.isFinite(dailyLoad) ? dailyLoad : basePower) * 0.46 + (Number.isFinite(ctl) ? ctl * 0.34 : 18), 43),
      detail: '负荷承受与力量基础',
    },
    {
      label: '稳定',
      value: clampScore((Number.isFinite(sleep) ? sleep : 58) * 0.38 + (Number.isFinite(hrv) ? Math.min(hrv, 100) * 0.22 : 12) + (Number.isFinite(tsb) ? 50 + tsb : 46) * 0.28, 45),
      detail: '睡眠、心率变异与状态平衡',
    },
  ]
})
const rqRadarAxes = computed(() => rqPowerAxes.value.map((axis, index) => {
  const angle = -Math.PI / 2 + index * ((Math.PI * 2) / rqPowerAxes.value.length)
  const labelRadius = 45
  return {
    ...axis,
    x: coordinate(80 + Math.cos(angle) * 62),
    y: coordinate(80 + Math.sin(angle) * 62),
    labelX: coordinate(50 + Math.cos(angle) * labelRadius),
    labelY: coordinate(50 + Math.sin(angle) * labelRadius),
  }
}))
const rqRadarPointCoords = computed(() => rqPowerAxes.value.map((axis, index) => {
  const angle = -Math.PI / 2 + index * ((Math.PI * 2) / rqPowerAxes.value.length)
  const radius = Math.max(10, Math.min(62, axis.value * 0.62))
  return {
    label: axis.label,
    x: coordinate(80 + Math.cos(angle) * radius),
    y: coordinate(80 + Math.sin(angle) * radius),
  }
}))
const rqRadarPoints = computed(() => rqRadarPointCoords.value.map((point) => `${point.x},${point.y}`).join(' '))
const recentLoadBars = computed(() => {
  const rows = loadRows.value.slice(-14)
  if (!rows.length) {
    return Array.from({ length: 14 }, (_, index) => ({
      key: `empty-${index}`,
      label: '',
      height: `${16 + (index % 5) * 8}%`,
    }))
  }

  const values = rows.map((row) => Math.max(0, Number(row.dailyTrainingLoad || row.ctl || 0)))
  const max = Math.max(...values, 1)
  return rows.map((row, index) => {
    const value = values[index]
    return {
      key: row.date || `load-${index}`,
      label: index === rows.length - 1 ? '今' : '',
      height: `${Math.max(12, Math.min(100, Math.round((value / max) * 100)))}%`,
    }
  })
})
const analysisCategories = computed(() => [
  {
    title: '体能',
    value: metricValue(currentLoad.value.ctl),
    caption: '长期体能储备',
    tone: 'fitness',
  },
  {
    title: '跑力',
    value: runningRecord.value?.value ? `${runningRecord.value.value}${runningRecord.value.unit ? ` ${runningRecord.value.unit}` : ''}` : '--',
    caption: runningRecord.value?.label || '等待跑步纪录',
    tone: 'power',
  },
  {
    title: '技术',
    value: metricValue(currentLoad.value.dailyTrainingLoad),
    caption: '今日负荷与动作质量线索',
    tone: 'technique',
  },
])
const hasData = computed(() => (
  Object.keys(health.value || {}).length > 0
  || loadRows.value.length > 0
  || pbHighlights.value.length > 0
  || activeDays.value.length > 0
))

function metricValue(value, unit = '') {
  return value === null || value === undefined || value === '' ? '--' : `${value}${unit}`
}

function toFiniteNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : Number.NaN
}

function clampScore(value, fallback) {
  const number = Number.isFinite(value) ? value : fallback
  return Math.round(Math.max(0, Math.min(100, number)))
}

function coordinate(value) {
  return Number(value.toFixed(1))
}

async function load() {
  loading.value = true
  errors.value = []
  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const results = await Promise.allSettled([
    getTodayHealth(),
    getLoadBalance({ range: '42d' }),
    getPersonalBests(),
    getCalendarStats({ month }),
  ])
  const targets = [health, loadRows, personalBests, calendar]
  const fallbacks = [{}, [], {}, { days: [] }]
  const labels = ['健康数据', '训练负荷', '个人纪录', '运动日历']

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      targets[index].value = result.value
    } else {
      targets[index].value = fallbacks[index]
      errors.value.push(`${labels[index]}加载失败`)
    }
  })
  loading.value = false
}

onMounted(load)
</script>

<style scoped>
.status-hero {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: var(--space-5);
  border-radius: var(--radius-xl);
  border: 1px solid var(--border);
  background:
    radial-gradient(140% 120% at 0% 0%, rgb(51 181 255 / 0.12), transparent 55%),
    var(--panel);
  box-shadow: var(--shadow-sm);
}
.status-hero__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.status-hero__top .overline { margin: 0; }
.status-hero__message {
  margin: 0;
  font-size: var(--fs-h2);
  line-height: 1.4;
  letter-spacing: -0.01em;
}

.soft-note {
  margin: 0;
  padding: 10px 14px;
  font-size: 13px;
  color: var(--muted);
  background: var(--panel-soft);
  border-radius: var(--radius-lg);
}
.load-reading { margin: 0 0 14px; color: var(--muted); line-height: 1.55; }

.status-empty-rq-panel {
  display: grid;
  gap: 14px;
  padding: var(--space-5);
  border: 1px solid color-mix(in srgb, var(--app-green) 14%, var(--border));
  border-top: 4px solid var(--app-green);
  border-radius: 12px;
  background: var(--panel);
  box-shadow: var(--shadow-sm);
}
.status-empty-rq-panel__head,
.status-empty-rq-panel__body {
  display: grid;
  gap: 14px;
}
.status-empty-rq-panel__head {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
}
.status-empty-rq-panel__head .overline,
.status-empty-rq-panel__head h2 {
  margin: 0;
}
.status-empty-rq-panel__head h2 {
  margin-top: 4px;
  font-size: var(--fs-h2);
  line-height: 1.15;
}
.status-empty-radar {
  position: relative;
  display: grid;
  place-items: center;
  aspect-ratio: 1;
  min-height: 168px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--app-green) 8%, var(--panel-soft));
}
.status-empty-radar svg {
  width: min(68%, 190px);
  height: auto;
}
.status-empty-radar polygon {
  fill: color-mix(in srgb, var(--app-green) 12%, transparent);
  stroke: color-mix(in srgb, var(--app-green) 42%, var(--border));
  stroke-width: 2;
}
.status-empty-radar span {
  position: absolute;
  color: var(--muted);
  font-size: 11px;
  font-weight: 800;
}
.status-empty-radar span:nth-of-type(1) { top: 9px; left: 50%; transform: translateX(-50%); }
.status-empty-radar span:nth-of-type(2) { top: 34%; right: 9px; }
.status-empty-radar span:nth-of-type(3) { right: 23%; bottom: 9px; }
.status-empty-radar span:nth-of-type(4) { left: 23%; bottom: 9px; }
.status-empty-radar span:nth-of-type(5) { top: 34%; left: 9px; }
.status-empty-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.status-empty-metrics span {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 10px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--app-green) 8%, var(--panel-soft));
}
.status-empty-metrics small {
  color: var(--muted);
  font-size: 11px;
}
.status-empty-metrics b {
  min-width: 0;
  color: var(--text);
  font-size: 14px;
  overflow-wrap: anywhere;
}

.analysis-category-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.analysis-category-card {
  display: grid;
  gap: 6px;
  min-width: 0;
  padding: 14px 10px;
  border: 1px solid color-mix(in srgb, var(--green) 16%, var(--border));
  border-radius: 12px;
  background: var(--panel);
  box-shadow: var(--shadow-sm);
}
.analysis-category-card span {
  font-size: 13px;
  font-weight: 800;
  color: var(--green-strong);
}
.analysis-category-card strong {
  min-width: 0;
  font-size: clamp(18px, 7cqi, 24px);
  line-height: 1;
  color: var(--text);
  overflow-wrap: anywhere;
}
.analysis-category-card small {
  color: var(--muted);
  font-size: 11px;
  line-height: 1.3;
}
.analysis-category-card--power span { color: var(--app-blue); }
.analysis-category-card--technique span { color: var(--app-amber); }
</style>
