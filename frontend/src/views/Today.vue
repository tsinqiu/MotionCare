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
    <StateBlock
      v-else-if="!hasData"
      title="还没有今日数据"
      message="同步 Garmin 或记录一次运动后，这里会给出更贴合你的建议。"
      action-label="记录运动"
      @action="router.push('/record')"
    />

    <template v-else>
      <p v-if="errors.length" class="soft-note">部分内容暂时不可用，已用现有数据为你生成建议。</p>

      <section class="today-hero">
        <div class="today-hero__top">
          <p class="overline">{{ greeting }}</p>
          <span class="status-chip" :class="statusBadge.tone">{{ statusBadge.label }}</span>
        </div>
        <h2 class="today-hero__headline">{{ recommendationHeadline }}</h2>
        <p class="today-hero__text">{{ recommendationText }}</p>
        <RouterLink class="primary-link today-hero__cta" to="/record">
          <CirclePlus :size="18" />
          记录一次运动
        </RouterLink>
        <small class="today-hero__note">
          {{ briefAvailable ? '建议已结合你的近期运动生成' : '基于身体状态与训练负荷生成' }}
        </small>
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
          <RouterLink class="link-more" to="/status/health">查看详情</RouterLink>
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
          <RouterLink class="link-more" to="/activities">全部</RouterLink>
        </div>
        <StateBlock
          v-if="recentActivities.length === 0"
          title="还没有运动记录"
          message="同步 Garmin 或手工添加一次已完成的运动。"
          action-label="记录运动"
          @action="router.push('/record')"
        />
        <div v-else class="activity-list">
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
const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 6) return '凌晨好，注意休息'
  if (hour < 11) return '早上好，今天适合怎么运动'
  if (hour < 14) return '中午好，今天适合怎么运动'
  if (hour < 18) return '下午好，今天适合怎么运动'
  return '晚上好，回顾今天的状态'
})
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
.soft-note {
  margin: 0;
  padding: 10px 14px;
  font-size: 13px;
  color: var(--muted);
  background: var(--panel-soft);
  border-radius: var(--radius-lg);
}

.today-hero {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: var(--space-5);
  border-radius: var(--radius-xl);
  border: 1px solid var(--border);
  background:
    radial-gradient(140% 120% at 100% 0%, rgb(33 212 123 / 0.16), transparent 55%),
    var(--panel);
  box-shadow: var(--shadow-sm);
}
.today-hero__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.today-hero__top .overline { margin: 0; }
.today-hero__headline {
  margin: 0;
  font-size: var(--fs-display);
  line-height: 1.15;
  letter-spacing: -0.02em;
}
.today-hero__text {
  margin: 0;
  color: var(--muted);
  line-height: 1.55;
}
.today-hero__cta {
  align-self: flex-start;
  margin-top: 4px;
}
.today-hero__note {
  color: var(--faint);
  font-size: 12px;
}

.link-more { color: var(--green); font-weight: 600; font-size: 13px; }

.health-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.health-grid span {
  display: grid;
  gap: 4px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--panel-soft);
}
.health-grid small { color: var(--muted); font-size: 12px; }
.health-grid b { font-size: var(--fs-title); }

.activity-list { display: grid; gap: 12px; }
</style>
