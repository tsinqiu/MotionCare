<template>
  <div class="page-stack">
    <section class="dark-panel">
      <div class="section-heading">
        <div>
          <p class="overline">身体与训练</p>
          <h2>状态</h2>
          <p>看看身体恢复和近期训练是否平衡。</p>
        </div>
        <span class="status-chip" :class="statusBadge.tone">{{ statusBadge.label }}</span>
      </div>
      <p>{{ statusBadge.message }}</p>
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
    <StateBlock
      v-else-if="!hasData"
      title="还没有状态数据"
      message="同步 Garmin 或记录一次运动后，这里会显示恢复和训练趋势。"
      action-label="记录运动"
      @action="router.push('/record')"
    />

    <template v-else>
      <p v-if="errors.length" class="form-error">部分数据暂时不可用：{{ errors.join('；') }}</p>

      <div class="metric-grid">
        <MetricCard label="睡眠分数" :value="metricValue(health.sleepScore)" />
        <MetricCard label="静息心率" :value="metricValue(health.restingHeartRateBpm, ' bpm')" />
        <MetricCard label="平均压力" :value="metricValue(health.avgStressLevel)" />
        <MetricCard label="HRV" :value="metricValue(health.avgHrv)" />
      </div>

      <section class="dark-panel">
        <div class="section-heading">
          <div><h2>训练负荷</h2></div>
          <RouterLink to="/status/training-load">查看详情</RouterLink>
        </div>
        <div class="training-targets">
          <span><small>体能 CTL</small><b>{{ metricValue(currentLoad.ctl) }}</b></span>
          <span><small>疲劳 ATL</small><b>{{ metricValue(currentLoad.atl) }}</b></span>
          <span><small>状态 TSB</small><b>{{ metricValue(currentLoad.tsb) }}</b></span>
          <span><small>今日负荷</small><b>{{ metricValue(currentLoad.dailyTrainingLoad) }}</b></span>
        </div>
      </section>

      <div class="status-summary-grid">
        <section class="dark-panel">
          <div class="section-heading">
            <div><h2>个人纪录</h2></div>
            <RouterLink to="/status/records">全部纪录</RouterLink>
          </div>
          <StateBlock v-if="pbHighlights.length === 0" title="暂无个人纪录" message="完成并同步运动后会自动生成。" />
          <div v-else class="log-list">
            <span v-for="item in pbHighlights" :key="`${item.group}-${item.key || item.label}`">
              {{ item.group }} · {{ item.label }}：{{ item.value }}{{ item.unit ? ` ${item.unit}` : '' }}
            </span>
          </div>
        </section>

        <section class="dark-panel">
          <div class="section-heading">
            <div><h2>本月运动</h2></div>
            <RouterLink to="/status/calendar">查看日历</RouterLink>
          </div>
          <StateBlock v-if="activeDays.length === 0" title="本月还没有运动" message="记录运动后会在日历中显示。" />
          <div v-else class="log-list">
            <span v-for="day in activeDays.slice(0, 6)" :key="day.date">
              {{ day.date }} · {{ day.activities?.length || 0 }} 次运动
            </span>
          </div>
        </section>
      </div>

      <section class="dark-panel">
        <div class="section-heading"><div><h2>继续查看</h2></div></div>
        <div class="secondary-link-grid">
          <RouterLink to="/status/health">健康详情</RouterLink>
          <RouterLink to="/status/trends">运动趋势</RouterLink>
          <RouterLink to="/status/training-load">训练负荷</RouterLink>
          <RouterLink to="/status/calendar">运动日历</RouterLink>
        </div>
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
import { deriveStatusBadge } from '@/utils/productInsights'

const router = useRouter()
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
const pbHighlights = computed(() => {
  const groups = [
    ['跑步', personalBests.value.running],
    ['骑行', personalBests.value.cycling],
    ['游泳', personalBests.value.swimming],
    ['综合', personalBests.value.overall],
  ]
  return groups.flatMap(([group, items]) => (items || []).slice(0, 2).map((item) => ({ ...item, group }))).slice(0, 6)
})
const hasData = computed(() => (
  Object.keys(health.value || {}).length > 0
  || loadRows.value.length > 0
  || pbHighlights.value.length > 0
  || activeDays.value.length > 0
))

function metricValue(value, unit = '') {
  return value === null || value === undefined || value === '' ? '--' : `${value}${unit}`
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
.status-summary-grid,
.secondary-link-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.secondary-link-grid a {
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--panel-soft);
}
@media (max-width: 760px) {
  .status-summary-grid,
  .secondary-link-grid { grid-template-columns: 1fr; }
}
</style>
