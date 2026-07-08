<template>
  <div class="page-stack trend-page">
    <section class="trend-control-panel">
      <div class="trend-sport-strip" aria-label="运动类型筛选">
        <button
          v-for="item in sportFilters"
          :key="item.value"
          type="button"
          :class="{ active: activityType === item.value }"
          @click="activityType = item.value"
        >
          <Check v-if="activityType === item.value" :size="16" aria-hidden="true" />
          {{ item.label }}
        </button>
      </div>
      <div class="trend-range-row" aria-label="趋势时间范围">
        <button type="button" aria-label="上一周期">
          <ChevronLeft :size="22" aria-hidden="true" />
        </button>
        <strong>{{ rangeLabel }}</strong>
        <button type="button" aria-label="下一周期">
          <ChevronRight :size="22" aria-hidden="true" />
        </button>
      </div>
      <div class="trend-range-pills">
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

    <StateBlock v-if="loading" title="正在加载趋势" message="正在读取可用运动指标。" />
    <StateBlock v-else-if="error" title="趋势加载失败" :message="error" tone="danger" action-label="重试" @action="load" />
    <StateBlock v-else-if="!availableMetrics.length" title="暂无趋势数据" message="当前筛选条件下没有可展示的指标字段。" />

    <template v-else>
      <ChartPanel :title="selectedMetricConfig.label" :eyebrow="selectedMetricConfig.unit || '趋势'" :option="trendChartOption">
        <template #action>
          <strong class="trend-average">Avg: {{ selectedMetricAverage }}</strong>
        </template>
      </ChartPanel>

      <section class="trend-metric-grid" aria-label="趋势指标">
        <button
          v-for="metric in availableMetrics"
          :key="metric.key"
          type="button"
          :class="{ active: selectedMetric === metric.key }"
          @click="selectedMetric = metric.key"
        >
          <component :is="metric.icon" :size="28" aria-hidden="true" />
          <strong>{{ metric.label }}</strong>
          <small>{{ metric.unit || '--' }}</small>
        </button>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import {
  Activity,
  BatteryCharging,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Flame,
  Gauge,
  Heart,
  Mountain,
  RadioTower,
  Route,
  Timer,
  Zap,
} from '@lucide/vue'

import ChartPanel from '@/components/ChartPanel.vue'
import StateBlock from '@/components/StateBlock.vue'
import { sportFilters } from '@/constants/sports'
import { getMetricTrend } from '@/services/stats'
import { formatDuration, formatPaceSeconds, formatSpeed } from '@/utils/formatters'

const ranges = [
  { label: '42天', value: '42d' },
  { label: '3个月', value: '3m' },
  { label: '6个月', value: '6m' },
  { label: '1年', value: '1y' },
  { label: '2年', value: '2y' },
]

const metricCatalog = [
  { key: 'avg_heart_rate_bpm', label: '平均心率', unit: 'bpm', color: '#ef4444', icon: Heart, format: (v) => `${round(v, 1)}` },
  { key: 'max_heart_rate_bpm', label: '最大心率', unit: 'bpm', color: '#be123c', icon: Heart, format: (v) => `${round(v, 0)}` },
  { key: 'activity_training_load', label: '训练负荷', unit: 'load', color: '#8b5cf6', icon: Activity, format: (v) => `${round(v, 0)}` },
  { key: 'vo2max', label: 'VO2 Max', unit: '', color: '#0ea5e9', icon: Gauge, format: (v) => `${round(v, 1)}` },
  { key: 'avg_cadence_spm', label: '平均步频', unit: 'spm', color: '#14b8a6', icon: RadioTower, format: (v) => `${round(v, 0)}` },
  { key: 'avg_speed_mps', label: '平均速度', unit: 'km/h', color: '#22c55e', icon: Gauge, format: (v) => formatSpeed(Number(v)) },
  { key: 'avg_pace_sec_per_km', label: '平均配速', unit: '/km', color: '#f59e0b', icon: Timer, format: (v) => formatPaceSeconds(Number(v)) },
  { key: 'distance_m', label: '距离', unit: 'km', color: '#2563eb', icon: Route, format: (v) => `${round(Number(v) / 1000, 2)} km` },
  { key: 'duration_s', label: '运动时长', unit: '', color: '#64748b', icon: Clock3, format: (v) => formatDuration(Number(v)) },
  { key: 'calories', label: '消耗', unit: 'kcal', color: '#f97316', icon: Flame, format: (v) => `${round(v, 0)} kcal` },
  { key: 'body_battery_delta', label: '身体电量', unit: '', color: '#16a34a', icon: BatteryCharging, format: (v) => `${round(v, 0)}` },
  { key: 'total_ascent_m', label: '总爬升', unit: 'm', color: '#475569', icon: Mountain, format: (v) => `${round(v, 0)} m`, disabled: true },
  { key: 'intensity_factor', label: '强度系数', unit: 'IF', color: '#111827', icon: Zap, format: (v) => `${round(v, 2)}`, disabled: true },
]

const range = ref('3m')
const activityType = ref('all')
const selectedMetric = ref('avg_heart_rate_bpm')
const trendMap = ref({})
const loading = ref(false)
const error = ref('')

const availableMetrics = computed(() => metricCatalog.filter((metric) => {
  if (metric.disabled) return false
  return (trendMap.value[metric.key] || []).some((row) => Number.isFinite(Number(row.value)))
}))
const selectedMetricConfig = computed(() => (
  availableMetrics.value.find((metric) => metric.key === selectedMetric.value)
  || availableMetrics.value[0]
  || metricCatalog[0]
))
const selectedRows = computed(() => trendMap.value[selectedMetricConfig.value.key] || [])
const rangeLabel = computed(() => {
  const allRows = Object.values(trendMap.value).flat()
  const dates = allRows.map((row) => row.date).filter(Boolean).sort()
  if (!dates.length) return ranges.find((item) => item.value === range.value)?.label || range.value
  return `${slashDate(dates[0])} - ${slashDate(dates.at(-1))}`
})
const selectedMetricAverage = computed(() => {
  const values = selectedRows.value.map((row) => Number(row.value)).filter(Number.isFinite)
  if (!values.length) return '--'
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length
  return selectedMetricConfig.value.format(avg)
})
const trendChartOption = computed(() => {
  const metric = selectedMetricConfig.value
  const rows = selectedRows.value
  return {
    color: [metric.color],
    tooltip: {
      trigger: 'axis',
      formatter: (params = []) => {
        const point = params[0]
        if (!point) return ''
        return `${point.axisValue}<br/>${metric.label}: ${metric.format(point.value)}`
      },
    },
    grid: { left: 48, right: 18, top: 22, bottom: 34 },
    xAxis: {
      type: 'category',
      data: rows.map((row) => shortDate(row.date)),
      boundaryGap: false,
      axisLabel: { color: '#64748b', hideOverlap: true },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#64748b' },
      splitLine: { lineStyle: { color: '#e5e7eb' } },
    },
    series: [{
      name: metric.label,
      type: 'line',
      data: rows.map((row) => Number(row.value)),
      smooth: true,
      symbolSize: 5,
      lineStyle: { width: 3 },
      areaStyle: { opacity: 0.12 },
    }],
  }
})

function round(value, digits = 1) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '--'
  const factor = 10 ** digits
  return Math.round(number * factor) / factor
}

function slashDate(value) {
  return String(value || '').replaceAll('-', '/')
}

function shortDate(value) {
  const text = String(value || '')
  return text.length >= 10 ? text.slice(5, 10).replace('-', '/') : text
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const enabledMetrics = metricCatalog.filter((metric) => !metric.disabled)
    const rows = await Promise.all(enabledMetrics.map(async (metric) => {
      try {
        const data = await getMetricTrend({
          metric: metric.key,
          range: range.value,
          activity_type: activityType.value,
        })
        return [metric.key, data || []]
      } catch {
        return [metric.key, []]
      }
    }))
    trendMap.value = Object.fromEntries(rows)
    if (!availableMetrics.value.some((metric) => metric.key === selectedMetric.value)) {
      selectedMetric.value = availableMetrics.value[0]?.key || 'avg_heart_rate_bpm'
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '趋势加载失败'
  } finally {
    loading.value = false
  }
}

watch([range, activityType], load, { immediate: true })
</script>

<style scoped>
.trend-control-panel {
  display: grid;
  gap: 16px;
}

.trend-sport-strip {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.trend-sport-strip button,
.trend-range-pills button {
  min-height: 42px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--panel);
  color: var(--text);
  font-weight: 900;
  white-space: nowrap;
}

.trend-sport-strip button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 18px;
}

.trend-sport-strip button.active,
.trend-range-pills button.active {
  border-color: transparent;
  background: color-mix(in srgb, var(--app-green) 82%, #fff);
  color: #fff;
}

.trend-range-row {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 44px;
  align-items: center;
}

.trend-range-row button {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border: 0;
  background: transparent;
  color: var(--text);
}

.trend-range-row strong {
  min-width: 0;
  color: var(--text);
  font-size: 20px;
  line-height: 1.2;
  text-align: center;
}

.trend-range-pills {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}

.trend-range-pills button {
  border-radius: 999px;
  padding: 0 8px;
}

.trend-average {
  color: var(--red);
  font-size: 15px;
  white-space: nowrap;
}

.trend-metric-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.trend-metric-grid button {
  display: grid;
  justify-items: center;
  gap: 8px;
  min-width: 0;
  min-height: 112px;
  padding: 14px 8px;
  border: 1px solid transparent;
  border-radius: 14px;
  background: var(--panel);
  color: var(--text);
  box-shadow: var(--shadow-sm);
}

.trend-metric-grid button.active {
  border-color: #ef4444;
  background: color-mix(in srgb, #ef4444 10%, var(--panel));
  color: #ef4444;
}

.trend-metric-grid strong {
  min-width: 0;
  font-size: 14px;
  line-height: 1.25;
  text-align: center;
  overflow-wrap: anywhere;
}

.trend-metric-grid small {
  color: var(--muted);
  font-weight: 800;
}
</style>
