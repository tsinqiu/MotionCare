<template>
  <div class="page-stack">
    <section class="dark-panel today-hero">
      <div>
        <p class="overline">今天适合怎么运动</p>
        <h2>今日</h2>
        <p>先看恢复状态，再决定今天的运动强度。</p>
      </div>
      <RouterLink class="primary-link" to="/record">
        <CirclePlus :size="18" />
        记录运动
      </RouterLink>
    </section>

    <StateBlock v-if="loading" title="正在准备今日建议" message="正在读取身体状态、训练负荷和最近运动。" />
    <StateBlock
      v-else-if="!hasData && errors.length"
      title="今日数据加载失败"
      :message="errors.join('；')"
      action-label="重试"
      tone="danger"
      @action="loadToday"
    />
    <StateBlock
      v-else-if="!hasData"
      title="还没有今日数据"
      message="同步 Garmin 或记录一次运动后，这里会给出更贴合你的建议。"
      action-label="记录运动"
      @action="router.push('/record')"
    />

    <template v-else>
      <p v-if="errors.length" class="form-error">部分内容暂时不可用：{{ errors.join('；') }}</p>

      <section class="dark-panel recommendation-panel">
        <div class="section-heading">
          <div>
            <p class="overline">今日建议</p>
            <h2>{{ recommendationHeadline }}</h2>
          </div>
          <span class="status-chip" :class="statusBadge.tone">{{ statusBadge.label }}</span>
        </div>
        <p>{{ recommendationText }}</p>
        <small v-if="briefAvailable">建议已结合你的近期运动生成</small>
        <small v-else>当前使用身体状态与训练负荷生成基础建议</small>
      </section>

      <div class="metric-grid">
        <MetricCard label="睡眠分数" :value="metricValue(health.sleepScore)" />
        <MetricCard label="静息心率" :value="metricValue(health.restingHeartRateBpm, ' bpm')" />
        <MetricCard label="平均压力" :value="metricValue(health.avgStressLevel)" />
        <MetricCard label="状态 TSB" :value="metricValue(currentLoad.tsb)" />
      </div>

      <section class="dark-panel">
        <div class="section-heading">
          <div><h2>今日身体摘要</h2></div>
          <RouterLink to="/status/health">完整健康数据</RouterLink>
        </div>
        <div class="health-grid">
          <span><small>步数</small><b>{{ metricValue(health.steps) }}</b></span>
          <span><small>活跃卡路里</small><b>{{ metricValue(health.activeCalories) }}</b></span>
          <span><small>强度分钟</small><b>{{ intensityMinutes }}</b></span>
          <span><small>HRV</small><b>{{ metricValue(health.avgHrv) }}</b></span>
        </div>
      </section>

      <section class="dark-panel">
        <div class="section-heading">
          <div><h2>最近运动</h2></div>
          <RouterLink to="/activities">全部运动</RouterLink>
        </div>
        <StateBlock
          v-if="recentActivities.length === 0"
          title="还没有运动记录"
          message="同步 Garmin 或手工添加一次已完成的运动。"
          action-label="记录运动"
          @action="router.push('/record')"
        />
        <div v-else class="activity-card-grid">
          <ActivityCard
            v-for="activity in recentActivities"
            :key="activity.id"
            :activity="activity"
            @select="router.push(`/activities/${activity.id}`)"
          />
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { CirclePlus } from '@lucide/vue'
import { useRouter } from 'vue-router'

import ActivityCard from '@/components/ActivityCard.vue'
import MetricCard from '@/components/MetricCard.vue'
import StateBlock from '@/components/StateBlock.vue'
import { getDailyBrief } from '@/services/ai'
import { getDashboardOverview, getTodayHealth } from '@/services/dashboard'
import { deriveStatusBadge } from '@/utils/productInsights'

const router = useRouter()
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
const intensityMinutes = computed(() => {
  const moderate = Number(health.value.moderateIntensityMinutes || 0)
  const vigorous = Number(health.value.vigorousIntensityMinutes || 0)
  return `${moderate + vigorous} 分钟`
})

function metricValue(value, unit = '') {
  return value === null || value === undefined || value === '' ? '--' : `${value}${unit}`
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
.today-hero { display: flex; justify-content: space-between; align-items: center; gap: 18px; }
.health-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.health-grid span {
  display: grid;
  gap: 5px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--panel-soft);
}
.health-grid b { font-size: 18px; }
@media (max-width: 760px) {
  .today-hero { align-items: flex-start; flex-direction: column; }
  .health-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
