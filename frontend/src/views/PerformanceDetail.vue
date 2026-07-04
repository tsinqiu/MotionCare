<template>
  <div class="page-stack performance-detail-page">
    <StateBlock v-if="loading" title="正在加载跑力详情" message="正在读取表现模型、五力拆解和数据质量。" />
    <StateBlock
      v-else-if="error"
      title="跑力详情加载失败"
      :message="error"
      action-label="重试"
      tone="danger"
      @action="load"
    />
    <template v-else>
      <section class="performance-hero">
        <div class="performance-hero__top">
          <div>
            <p class="overline">跑力模型</p>
            <h2>当前跑力</h2>
          </div>
          <span class="status-chip">{{ runningPower.label || '--' }}</span>
        </div>
        <strong>{{ runningPower.score ?? '--' }}</strong>
        <div class="performance-gradient-track" :style="{ '--score-position': `${runningPower.score ?? 0}%` }">
          <span>基础</span>
          <span>稳定</span>
          <span>强劲</span>
          <span>巅峰</span>
          <i class="score-band__marker" aria-hidden="true"></i>
        </div>
        <p>{{ modelText }}</p>
      </section>

      <section class="detail-panel">
        <div class="section-heading">
          <div>
            <p class="overline">跑步五力</p>
            <h2>模型拆解</h2>
          </div>
          <span class="status-chip">{{ profile?.model?.modelVersion || 'performance-v1' }}</span>
        </div>
        <div class="five-power-detail">
          <article v-for="item in fivePower" :key="item.key">
            <div>
              <span>{{ item.label }}</span>
              <strong>{{ item.score }}</strong>
            </div>
            <i :style="{ '--axis-score': `${item.score}%` }"></i>
            <p>{{ item.detail }}</p>
          </article>
        </div>
      </section>

      <section class="detail-panel">
        <div class="section-heading">
          <div>
            <p class="overline">关键因素</p>
            <h2>为什么是这个跑力</h2>
          </div>
        </div>
        <div class="factor-list">
          <span v-for="factor in runningPower.factors || []" :key="factor">{{ factor }}</span>
          <span v-if="!(runningPower.factors || []).length">跑步样本仍在积累中</span>
        </div>
      </section>

      <section class="detail-panel">
        <div class="section-heading">
          <div>
            <p class="overline">数据质量</p>
            <h2>{{ dataQuality.score ?? '--' }}</h2>
          </div>
          <span class="status-chip">{{ profile?.model?.provider === 'local_performance_model' ? '本地模型' : '基础模型' }}</span>
        </div>
        <div class="quality-grid">
          <span><small>跑步样本</small><b>{{ coverage.runningActivities28d ?? '--' }}</b></span>
          <span><small>心率跑步</small><b>{{ coverage.heartRateRuns ?? '--' }}</b></span>
          <span><small>VO2max</small><b>{{ coverage.vo2maxDays ?? '--' }}</b></span>
          <span><small>动作数据</small><b>{{ coverage.cadenceRuns ?? '--' }}</b></span>
        </div>
        <p v-for="warning in dataQuality.warnings || []" :key="warning" class="quality-warning">{{ warning }}</p>
      </section>

      <section class="detail-panel">
        <div class="section-heading">
          <div>
            <p class="overline">主要输入</p>
            <h2>模型使用的数据</h2>
          </div>
        </div>
        <div class="quality-grid">
          <span><small>VO2max</small><b>{{ metricValue(metrics.vo2max) }}</b></span>
          <span><small>28天跑量</small><b>{{ metricValue(metrics.totalDistance28d, ' km') }}</b></span>
          <span><small>最长距离</small><b>{{ metricValue(metrics.longestDistanceKm, ' km') }}</b></span>
          <span><small>状态余量</small><b>{{ metricValue(metrics.tsb) }}</b></span>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'

import StateBlock from '@/components/StateBlock.vue'
import { getPerformanceProfile } from '@/services/performance'

const profile = ref(null)
const loading = ref(false)
const error = ref('')

const runningPower = computed(() => profile.value?.runningPower || {})
const fivePower = computed(() => profile.value?.fivePower || [])
const dataQuality = computed(() => profile.value?.dataQuality || {})
const coverage = computed(() => dataQuality.value.coverage || {})
const metrics = computed(() => profile.value?.keyMetrics || {})
const modelText = computed(() => {
  const confidence = profile.value?.model?.confidence
  const confidenceText = confidence == null ? '置信度待积累' : `置信度 ${Math.round(confidence * 100)}%`
  return `模型综合近期配速、心率、VO2max、训练负荷、恢复信号和外部参考生成。${confidenceText}。`
})

function metricValue(value, unit = '') {
  return value === null || value === undefined || value === '' ? '--' : `${value}${unit}`
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    profile.value = await getPerformanceProfile()
  } catch (err) {
    profile.value = null
    error.value = err instanceof Error ? err.message : '跑力详情加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.performance-detail-page {
  padding-bottom: 24px;
}

.performance-hero,
.detail-panel {
  display: grid;
  gap: 14px;
  padding: var(--space-5);
  border: 1px solid color-mix(in srgb, var(--app-green) 16%, var(--border));
  border-top: 4px solid var(--app-green);
  border-radius: 12px;
  background: var(--panel);
  box-shadow: var(--shadow-sm);
}

.performance-hero__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.performance-hero__top .overline,
.performance-hero__top h2,
.detail-panel .overline,
.detail-panel h2 {
  margin: 0;
}

.performance-hero strong {
  color: var(--green-strong);
  font-size: clamp(56px, 24vw, 96px);
  line-height: 0.95;
}

.performance-hero p,
.detail-panel p {
  margin: 0;
  color: var(--muted);
  line-height: 1.55;
}

.performance-gradient-track {
  position: relative;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  align-items: center;
  min-height: 36px;
  overflow: visible;
  border-radius: 999px;
  background: linear-gradient(90deg, #38bdf8 0%, #10b981 50%, #f59e0b 74%, #ef4444 100%);
}

.performance-gradient-track span {
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

.five-power-detail,
.quality-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.five-power-detail article,
.quality-grid span {
  display: grid;
  gap: 8px;
  min-width: 0;
  padding: 12px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--app-green) 7%, var(--panel-soft));
}

.five-power-detail article > div {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.five-power-detail span,
.quality-grid small {
  color: var(--muted);
  font-size: 12px;
  font-weight: 800;
}

.five-power-detail strong,
.quality-grid b {
  color: var(--text);
  font-size: 18px;
}

.five-power-detail i {
  display: block;
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background:
    linear-gradient(90deg, var(--app-green), var(--app-blue)) 0 / var(--axis-score) 100% no-repeat,
    color-mix(in srgb, var(--border) 62%, transparent);
}

.factor-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.factor-list span {
  padding: 8px 10px;
  border-radius: 999px;
  color: var(--green-strong);
  background: color-mix(in srgb, var(--app-green) 10%, var(--panel-soft));
  font-size: 12px;
  font-weight: 800;
}

.quality-warning {
  padding: 10px 12px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--app-amber) 10%, var(--panel-soft));
}
</style>
