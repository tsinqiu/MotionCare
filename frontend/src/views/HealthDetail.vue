<template>
  <div class="page-stack training-health-page">
    <section class="training-health-hero">
      <div class="range-stepper">
        <button type="button" aria-label="上一周期">
          <ChevronLeft :size="22" aria-hidden="true" />
        </button>
        <strong>{{ rangeLabel }}</strong>
        <button type="button" aria-label="下一周期">
          <ChevronRight :size="22" aria-hidden="true" />
        </button>
      </div>
      <div class="range-pills" aria-label="时间范围">
        <button
          v-for="item in ranges"
          :key="item.value"
          type="button"
          :class="{ active: range === item.value }"
          @click="range = item.value"
        >
          {{ item.label }}
        </button>
      </div>
    </section>

    <StateBlock v-if="loading" title="正在加载健康度" message="正在读取训练负荷数据。" />
    <StateBlock v-else-if="error" title="健康度加载失败" :message="error" tone="danger" action-label="重试" @action="load" />
    <StateBlock v-else-if="!chartRows.length" title="暂无训练负荷数据" message="同步运动数据后，这里会展示 CTL、ATL 和 TSB 状态。" />

    <template v-else>
      <ChartPanel class="training-health-chart" title="训练负荷状态" eyebrow="" :option="loadChartOption" />

      <section class="training-health-status">
        <div class="section-heading">
          <div>
            <h2>今日状态</h2>
          </div>
          <span class="status-chip" :class="statusTone">{{ statusLabel }}</span>
        </div>
        <div class="training-health-metrics">
          <span>
            <small>体能（CTL）</small>
            <b class="ctl">{{ metricValue(latestLoad.ctl) }}</b>
          </span>
          <span>
            <small>疲劳（ATL）</small>
            <b class="atl">{{ metricValue(latestLoad.atl) }}</b>
          </span>
          <span>
            <small>状态（TSB）</small>
            <b class="tsb">{{ metricValue(latestLoad.tsb) }}</b>
          </span>
        </div>
        <div class="training-health-advice">
          <h3>行动建议</h3>
          <p>{{ adviceText }}</p>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { ChevronLeft, ChevronRight } from '@lucide/vue'

import ChartPanel from '@/components/ChartPanel.vue'
import StateBlock from '@/components/StateBlock.vue'
import { getDashboardOverview } from '@/services/dashboard'

const ranges = [
  { label: '42天', value: '42d', days: 42 },
  { label: '3个月', value: '3m', days: 90 },
  { label: '6个月', value: '6m', days: 183 },
  { label: '1年', value: '1y', days: 365 },
  { label: '2年', value: '2y', days: 730 },
]

const range = ref('3m')
const loading = ref(false)
const error = ref('')
const trainingLoad = ref([])
const tsbZones = [
  { label: '过渡期', min: 25, max: 90, color: '#d97706', fill: '#fdecc8' },
  { label: '精力充沛', min: 10, max: 25, color: '#0284c7', fill: '#dff4ff' },
  { label: '灰色地带', min: -10, max: 10, color: '#475569', fill: '#edf2f7' },
  { label: '最优', min: -30, max: -10, color: '#15803d', fill: '#dcfce7' },
  { label: '高风险', min: -120, max: -30, color: '#dc2626', fill: '#fee2e2' },
]

const activeRange = computed(() => ranges.find((item) => item.value === range.value) || ranges[1])
const chartRows = computed(() => {
  const rows = (trainingLoad.value || []).filter((row) => normalizeDateKey(row.date))
  return rows.slice(-activeRange.value.days)
})
const latestLoad = computed(() => chartRows.value.at(-1) || {})
const rangeLabel = computed(() => {
  const first = chartRows.value[0]
  const last = chartRows.value.at(-1)
  if (!first || !last) return activeRange.value.label
  return `${formatSlashDate(first.date)} - ${formatSlashDate(last.date)}`
})
const statusLabel = computed(() => {
  const tsb = Number(latestLoad.value.tsb)
  if (!Number.isFinite(tsb)) return '待评估'
  if (tsb < -30) return '高风险'
  if (tsb < -10) return '最优'
  if (tsb <= 10) return '灰色地带'
  if (tsb <= 25) return '精力充沛'
  return '过渡期'
})
const statusTone = computed(() => {
  const tsb = Number(latestLoad.value.tsb)
  if (!Number.isFinite(tsb)) return 'neutral'
  if (tsb < -30) return 'danger'
  if (tsb < -10) return 'good'
  if (tsb <= 10) return 'steady'
  return 'warning'
})
const adviceText = computed(() => {
  const tsb = Number(latestLoad.value.tsb)
  if (!Number.isFinite(tsb)) return '当前训练负荷数据不足，建议先同步运动记录。'
  if (tsb < -30) return '疲劳明显偏高，今天优先恢复、拉伸或非常轻松的有氧。'
  if (tsb < -10) return '你正处于较好的体能提升窗口，保持当前训练节奏，避免连续高强度。'
  if (tsb <= 10) return '状态较平衡，适合稳定训练，也可以根据体感安排轻中强度内容。'
  if (tsb <= 25) return '精力较充沛，可以安排质量课，但注意不要突然增加总量。'
  return '近期负荷偏低，适合循序渐进恢复训练节奏。'
})
const loadChartOption = computed(() => {
  const dates = chartRows.value.map((row) => formatShortDate(row.date))
  const ctl = chartRows.value.map((row) => roundNumber(row.ctl))
  const atl = chartRows.value.map((row) => roundNumber(row.atl))
  const tsb = chartRows.value.map((row) => roundNumber(row.tsb))
  return {
    color: ['#2f9de0', '#a855b1', '#22a85a'],
    tooltip: { trigger: 'axis' },
    visualMap: {
      show: false,
      seriesIndex: 2,
      dimension: 1,
      pieces: tsbZones.map((zone) => ({
        gt: zone.min,
        lte: zone.max,
        color: zone.color,
      })),
      outOfRange: { color: '#15803d' },
    },
    graphic: createTsbZoneLegendGraphic(),
    legend: {
      top: 2,
      right: 4,
      textStyle: { color: '#64748b' },
      data: ['体能（CTL）', '疲劳（ATL）', '状态（TSB）'],
    },
    grid: [
      { left: 58, right: 18, top: 40, height: '36%' },
      { left: 58, right: 18, top: '64%', height: '25%' },
    ],
    xAxis: [
      {
        type: 'category',
        data: dates,
        boundaryGap: false,
        axisLabel: { show: false },
        axisLine: { lineStyle: { color: '#94a3b8' } },
        axisTick: { show: false },
      },
      {
        type: 'category',
        gridIndex: 1,
        data: dates,
        boundaryGap: false,
        axisLabel: { color: '#64748b', hideOverlap: true },
        axisLine: { lineStyle: { color: '#94a3b8' } },
        axisTick: { show: false },
      },
    ],
    yAxis: [
      {
        type: 'value',
        name: '训练负荷',
        nameLocation: 'middle',
        nameGap: 42,
        nameRotate: 90,
        axisLabel: { color: '#64748b', interval: 1 },
        splitNumber: 4,
        splitLine: { show: false },
      },
      {
        type: 'value',
        gridIndex: 1,
        name: '状态（TSB）',
        nameLocation: 'middle',
        nameGap: 42,
        nameRotate: 90,
        min: -120,
        max: 90,
        interval: 60,
        axisLabel: { color: '#64748b', interval: 1 },
        splitNumber: 3,
        splitLine: { show: false },
      },
    ],
    series: [
      { name: '体能（CTL）', type: 'line', data: ctl, smooth: true, symbol: 'none', areaStyle: { opacity: 0.08 }, lineStyle: { width: 3 } },
      { name: '疲劳（ATL）', type: 'line', data: atl, smooth: true, symbol: 'none', lineStyle: { width: 2 } },
      {
        name: '状态（TSB）',
        type: 'line',
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: tsb.map((value, index) => [dates[index], value]),
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 3.5 },
        markArea: {
          silent: true,
          itemStyle: { opacity: 0.16 },
          label: { show: false },
          data: [
            ...tsbZones.map((zone) => ([
              { yAxis: zone.min, itemStyle: { color: zone.fill } },
              { yAxis: zone.max },
            ])),
          ],
        },
      },
    ],
  }
})

function createTsbZoneLegendGraphic() {
  const itemWidth = 52
  const itemGap = 6
  const labelOffset = itemWidth / 2

  return [{
    type: 'group',
    left: 56,
    top: '55%',
    bounding: 'raw',
    children: tsbZones.map((zone, index) => ({
      type: 'group',
      x: index * (itemWidth + itemGap),
      y: 0,
      children: [
        {
          type: 'rect',
          shape: { x: 0, y: 0, width: itemWidth, height: 22, r: 11 },
          style: { fill: zone.fill, stroke: 'transparent' },
        },
        {
          type: 'text',
          style: {
            x: labelOffset,
            y: 12,
            text: zone.label,
            fill: zone.color,
            fontSize: 10,
            fontWeight: 800,
            align: 'center',
            verticalAlign: 'middle',
          },
        },
      ],
    })),
  }]
}

function metricValue(value) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.round(number) : '--'
}

function roundNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.round(number * 10) / 10 : null
}

function normalizeDateKey(value) {
  if (!value) return ''
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatSlashDate(value) {
  return normalizeDateKey(value).replaceAll('-', '/')
}

function formatShortDate(value) {
  const key = normalizeDateKey(value)
  return key ? key.slice(5).replace('-', '/') : ''
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const overview = await getDashboardOverview({ training_load_range: activeRange.value.value })
    trainingLoad.value = overview.trainingLoad || []
  } catch (err) {
    error.value = err instanceof Error ? err.message : '健康度加载失败'
  } finally {
    loading.value = false
  }
}

watch(range, load, { immediate: true })
</script>

<style scoped>
.training-health-hero,
.training-health-status {
  display: grid;
  gap: 14px;
  padding: var(--space-5);
  border: 1px solid color-mix(in srgb, var(--app-green) 16%, var(--border));
  border-radius: 18px;
  background: var(--panel);
  box-shadow: var(--shadow-sm);
}

.training-health-chart :deep(.panel-heading .overline:empty) {
  display: none;
}

.training-health-chart :deep(.panel-heading) {
  margin-bottom: 4px;
}

.training-health-chart :deep(.chart-canvas) {
  min-height: 400px;
}

.training-health-status {
  padding-top: 18px;
}

.training-health-status .section-heading {
  align-items: center;
  margin: 0;
}

.training-health-status .section-heading h2 {
  margin: 0;
  font-size: 26px;
  line-height: 1.15;
}

.range-stepper {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 44px;
  align-items: center;
}

.range-stepper button {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border: 0;
  background: transparent;
  color: var(--text);
}

.range-stepper strong {
  min-width: 0;
  color: var(--text);
  font-size: 22px;
  line-height: 1.2;
  text-align: center;
}

.range-pills {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}

.range-pills button {
  min-height: 38px;
  border: 0;
  border-radius: 999px;
  background: var(--panel-soft);
  color: var(--text);
  font-weight: 900;
}

.range-pills button.active {
  background: var(--app-green);
  color: #fff;
}

.training-health-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.training-health-metrics span {
  display: grid;
  justify-items: center;
  gap: 8px;
  min-width: 0;
  padding: 14px 8px;
  border-radius: 14px;
  background: var(--panel-soft);
}

.training-health-metrics small {
  color: var(--text);
  font-weight: 800;
  text-align: center;
}

.training-health-metrics b {
  font-size: 34px;
  line-height: 1;
}

.training-health-metrics .ctl { color: #2f9de0; }
.training-health-metrics .atl { color: #a855b1; }
.training-health-metrics .tsb { color: #22a85a; }

.training-health-advice {
  padding-top: 14px;
  border-top: 1px solid var(--border);
}

.training-health-advice h3,
.training-health-advice p {
  margin: 0;
}

.training-health-advice h3 {
  font-size: 20px;
}

.training-health-advice p {
  margin-top: 10px;
  color: var(--text);
  font-size: 16px;
  line-height: 1.65;
}
</style>
