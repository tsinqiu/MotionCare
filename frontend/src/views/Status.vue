<template>
  <div class="page-stack">
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

      <section class="rq-score-panel">
        <div class="rq-score-panel__title">
          <span>当前跑力</span>
          <button type="button" class="rq-detail-link" @click="goPerformanceDetail">详情</button>
        </div>
        <strong>{{ runningPowerDisplay }}</strong>
        <div class="performance-gradient-track" :style="scoreMarkerStyle" aria-label="跑力等级">
          <span>基础</span>
          <span>稳定</span>
          <span>强劲</span>
          <span>巅峰</span>
          <i class="score-band__marker" aria-hidden="true"></i>
        </div>
      </section>

      <section class="rq-five-power-panel">
        <div class="rq-five-power-panel__head">
          <div>
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

      <div class="metric-grid status-health-grid">
        <MetricCard label="睡眠分数" :value="metricValue(health.sleepScore)" />
        <MetricCard label="静息心率" :value="metricValue(health.restingHeartRateBpm, ' 次/分')" />
        <MetricCard label="平均压力" :value="metricValue(health.avgStressLevel)" />
        <MetricCard label="心率变异" :value="metricValue(health.avgHrv)" />
      </div>

      <section class="dark-panel training-load-panel">
        <div class="section-heading">
          <div><h2>训练负荷</h2></div>
          <span class="status-chip" :class="loadBalanceTone">{{ loadBalanceLabel }}</span>
        </div>
        <p class="load-reading">{{ loadReading }}</p>
        <div class="training-targets training-load-targets">
          <span><small>体能（CTL）</small><b>{{ metricValue(currentLoad.ctl) }}</b></span>
          <span><small>疲劳（ATL）</small><b>{{ metricValue(currentLoad.atl) }}</b></span>
          <span><small>状态（TSB）</small><b>{{ metricValue(currentLoad.tsb) }}</b></span>
          <span><small>今日负荷</small><b>{{ metricValue(currentLoad.dailyTrainingLoad) }}</b></span>
        </div>
      </section>

      <section class="status-hero status-hero--bottom">
        <div class="status-hero__top">
          <p class="overline">身体与训练</p>
          <span class="status-chip" :class="statusBadge.tone">{{ statusBadge.label }}</span>
        </div>
        <p class="status-hero__message">{{ statusBadge.message }}</p>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import MetricCard from '@/components/MetricCard.vue'
import StateBlock from '@/components/StateBlock.vue'
import { getTodayHealth } from '@/services/dashboard'
import { getCalendarStats, getPersonalBests } from '@/services/stats'
import { getLoadBalance } from '@/services/training'
import { getPerformanceProfile } from '@/services/performance'
import { deriveStatusBadge } from '@/utils/productInsights'

const router = useRouter()
const health = ref({})
const loadRows = ref([])
const personalBests = ref({})
const calendar = ref({ days: [] })
const performanceProfile = ref(null)
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
const loadBalanceLabel = computed(() => {
  const tsb = currentLoad.value.tsb
  if (tsb === null || tsb === undefined || tsb === '') return '待同步'
  const value = Number(tsb)
  if (value <= -20) return '恢复优先'
  if (value < -8) return '负荷累积'
  if (value <= 10) return '平衡'
  return '状态轻松'
})
const loadBalanceTone = computed(() => {
  const tsb = currentLoad.value.tsb
  if (tsb === null || tsb === undefined || tsb === '') return 'neutral'
  const value = Number(tsb)
  if (value <= -20) return 'danger'
  if (value < -8) return 'warning'
  return 'good'
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
const runningPower = computed(() => performanceProfile.value?.runningPower || null)
const runningPowerScore = computed(() => {
  const value = Number(runningPower.value?.score)
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : null
})
const runningPowerDisplay = computed(() => runningPowerScore.value ?? '--')
const runningPowerLevel = computed(() => runningPower.value?.label || '数据不足')
const scoreMarkerStyle = computed(() => ({
  '--score-position': `${runningPowerScore.value ?? 0}%`,
}))
const rqPowerAxes = computed(() => {
  const axes = performanceProfile.value?.fivePower
  if (Array.isArray(axes) && axes.length) {
    return axes.map((axis) => ({
      label: axis.label,
      value: Math.max(0, Math.min(100, Math.round(Number(axis.score) || 0))),
      detail: axis.detail || '模型综合评估',
    }))
  }
  return ['耐力', '速度', '技术', '肌力', '稳定'].map((label) => ({ label, value: 0, detail: '等待模型数据' }))
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
const hasData = computed(() => (
  Object.keys(health.value || {}).length > 0
  || loadRows.value.length > 0
  || pbHighlights.value.length > 0
  || activeDays.value.length > 0
  || performanceProfile.value
))

function metricValue(value, unit = '') {
  return value === null || value === undefined || value === '' ? '--' : `${value}${unit}`
}

function coordinate(value) {
  return Number(value.toFixed(1))
}

function goPerformanceDetail() {
  router.push('/status/performance')
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
    getPerformanceProfile(),
  ])
  const targets = [health, loadRows, personalBests, calendar, performanceProfile]
  const fallbacks = [{}, [], {}, { days: [] }, null]
  const labels = ['健康数据', '训练负荷', '个人纪录', '运动日历', '跑力模型']

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

.status-chip.neutral {
  color: var(--muted);
}

.status-chip.warning {
  color: var(--app-amber);
  border-color: color-mix(in srgb, var(--app-amber) 40%, var(--border));
  background: color-mix(in srgb, var(--app-amber) 10%, var(--panel));
}

.status-chip.good {
  background: color-mix(in srgb, var(--app-green) 10%, var(--panel));
}

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

.rq-detail-link {
  min-height: 34px;
  padding: 0 14px;
  border: 1px solid color-mix(in srgb, var(--app-green) 30%, var(--border));
  border-radius: 999px;
  color: var(--green-strong);
  background: var(--panel);
  font: inherit;
  font-size: 13px;
  font-weight: 900;
  cursor: pointer;
}

.performance-gradient-track {
  position: relative;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  align-items: center;
  min-height: 34px;
  overflow: visible;
  border-radius: 999px;
  background: linear-gradient(90deg, #38bdf8 0%, #10b981 50%, #f59e0b 74%, #ef4444 100%);
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.18);
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
  transform: translate(-50%, -50%);
}

.status-health-grid {
  order: 0;
}

.training-load-panel {
  position: relative;
  overflow: hidden;
  border-left: 4px solid var(--app-green);
}

.training-load-panel::before {
  content: "";
  position: absolute;
  inset: 0 0 auto;
  height: 74px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--app-green) 8%, transparent), transparent);
  pointer-events: none;
}

.training-load-panel > * {
  position: relative;
}

.training-load-panel .section-heading {
  align-items: center;
}

.load-reading {
  margin: -4px 0 16px;
  color: var(--muted);
  line-height: 1.55;
}

.training-load-targets {
  gap: 10px;
}

.training-load-targets span {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 6px 10px;
  min-width: 0;
  padding: 12px;
  border-color: color-mix(in srgb, var(--app-green) 18%, var(--border));
  background: color-mix(in srgb, var(--app-green) 5%, var(--panel-soft));
}

.training-load-targets small {
  grid-column: 1 / -1;
}

.training-load-targets b {
  min-width: 0;
  font-size: 20px;
}
</style>
