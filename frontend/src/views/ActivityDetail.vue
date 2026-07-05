<template>
  <div class="activity-detail-page" :style="{ '--sport-color': sportColor }">
    <StateBlock
      v-if="loading"
      title="正在加载运动详情"
      message="正在读取活动摘要、轨迹点、心率、速度和分段数据。"
    />
    <StateBlock
      v-else-if="error"
      title="运动详情加载失败"
      :message="error"
      action-label="重试"
      tone="danger"
      @action="loadActivity(route.params.id)"
    />
    <StateBlock
      v-else-if="!activity"
      title="未找到该活动"
      message="当前活动不存在，或没有可查看的记录。"
    />

    <template v-else>
      <nav class="activity-detail-tabs" aria-label="运动详情页签">
        <button
          v-for="tab in detailTabs"
          :key="tab.key"
          type="button"
          :class="{ active: activeTab === tab.key }"
          @click="selectTab(tab.key)"
        >
          {{ tab.label }}
        </button>
      </nav>

      <section v-if="activeTab === 'overview'" class="detail-tab-panel overview-tab">
        <RoutePreview class="detail-overview-map" :points="trackPoints" />

        <section class="activity-title-card">
          <span class="activity-type-icon">
            <Activity :size="30" aria-hidden="true" />
          </span>
          <div>
            <h1>{{ activityTitle }}</h1>
            <p>{{ formatDetailDateTime(activity.local_start_time, true) }}</p>
          </div>
        </section>

        <section class="overview-metric-grid" aria-label="运动核心指标">
          <article v-for="metric in overviewMetricItems" :key="metric.label">
            <small>{{ metric.label }}</small>
            <strong class="overview-metric-value">
              <span>{{ metric.valueText }}</span>
              <em v-if="metric.unitText">{{ metric.unitText }}</em>
            </strong>
          </article>
        </section>

        <section class="detail-action-row" aria-label="运动操作">
          <button class="coach-action" type="button" @click="selectTab('analysis')">
            <Sparkles :size="18" aria-hidden="true" />
            AI 教练
          </button>
          <button type="button" @click="placeholderAction('海报功能建设中')">
            <Image :size="18" aria-hidden="true" />
            海报
          </button>
          <button type="button" :disabled="isSharingActivity" @click="shareActivityToCommunity">
            <Share2 :size="18" aria-hidden="true" />
            {{ isSharingActivity ? '分享中' : '分享' }}
          </button>
        </section>

      </section>

      <section v-else-if="activeTab === 'charts'" class="detail-tab-panel chart-tab">
        <template v-if="chartBlocks.length">
          <template v-for="block in chartBlocks" :key="block.key">
            <section v-if="block.type === 'zones'" class="chart-section zone-chart-section">
              <div class="chart-section-heading">
                <h2>{{ block.title }}</h2>
                <span>{{ block.summary }}</span>
              </div>
              <div class="zone-list-detail">
                <div v-for="row in heartRateZoneRows" :key="row.label" class="zone-row-detail">
                  <div>
                    <b>{{ row.label }}</b>
                    <small>{{ row.caption }}</small>
                  </div>
                  <div class="zone-bar-detail" aria-hidden="true">
                    <span :style="{ width: `${row.percent}%`, background: row.color }"></span>
                  </div>
                  <strong>{{ formatDurationShort(row.durationS) }}</strong>
                  <em>{{ Math.round(row.percent) }}%</em>
                </div>
              </div>
            </section>
            <section v-else class="chart-section">
              <div class="chart-section-heading">
                <h2>{{ block.title }}</h2>
                <span>{{ block.summary }}</span>
              </div>
              <ChartPanel class="activity-chart-panel" :title="block.title" eyebrow="" :option="block.option" />
            </section>
          </template>
        </template>
        <StateBlock
          v-else
          title="暂无图表数据"
          message="当前运动缺少可绘制的心率、速度、步频、海拔或功率采样。"
        />
      </section>

      <section v-else-if="activeTab === 'details'" class="detail-tab-panel details-tab">
        <section v-for="group in detailGroups" :key="group.title" class="detail-info-group">
          <h2>{{ group.title }}</h2>
          <div class="detail-info-list">
            <div v-for="item in group.items" :key="item.label" class="detail-info-row">
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
            </div>
          </div>
        </section>

        <section v-if="isRunningActivity" class="detail-info-group">
          <h2>跑鞋</h2>
          <div class="shoe-bind">
            <select v-model="selectedShoeId" @change="bindShoe">
              <option :value="null">不绑定</option>
              <option v-for="s in shoes" :key="s.id" :value="s.id" :disabled="s.isRetired">
                {{ s.name }} {{ s.isRetired ? '(已退役)' : '' }}
              </option>
            </select>
            <span v-if="activity.shoe_name || activity.shoeName" class="shoe-bind-info">
              当前：{{ activity.shoe_name || activity.shoeName }}
            </span>
          </div>
          <p v-if="shoeError" class="form-error">{{ shoeError }}</p>
        </section>

      </section>

      <section v-else-if="activeTab === 'analysis'" class="detail-tab-panel analysis-tab">
        <section class="training-analysis-card">
          <div class="section-heading compact-heading">
            <div>
              <p class="overline">训练分析</p>
              <h2>{{ trainingLoadLevel.title }}</h2>
            </div>
            <span class="status-chip">{{ trainingLoadLevel.label }}</span>
          </div>
          <p>{{ trainingLoadLevel.copy }}</p>
          <div class="analysis-factor-grid">
            <span><small>训练负荷</small><b>{{ formatTrainingLoad(activity.activity_training_load) }}</b></span>
            <span><small>配速稳定</small><b>{{ paceStability }}</b></span>
            <span><small>平均心率</small><b>{{ formatBpmShort(activity.avg_heart_rate_bpm) }}</b></span>
            <span><small>累计爬升</small><b>{{ formatMetersShort(activity.total_ascent_m) }}</b></span>
          </div>
        </section>

        <section class="analysis-result-card">
          <div class="section-heading compact-heading">
            <div>
              <p class="overline">AI 教练</p>
              <h2>运动智能分析</h2>
            </div>
            <button class="primary-link" type="button" :disabled="analysisLoading" @click="runAnalysis">
              {{ analysisLoading ? '分析中' : '运行分析' }}
            </button>
          </div>
          <StateBlock
            v-if="analysisError"
            title="智能分析失败"
            :message="analysisError"
            tone="danger"
          />
          <template v-else-if="analysis">
            <div class="analysis-insights">
              <span
                v-for="insight in analysisInsights"
                :key="insight.label"
                :class="insight.tone"
              >
                <small>{{ insight.label }}</small>
                <b>{{ insight.value }}</b>
              </span>
            </div>
            <p>{{ analysis.summary }}</p>
            <ul>
              <li v-for="suggestion in analysisSuggestions" :key="suggestion">{{ suggestion }}</li>
            </ul>
          </template>
          <p v-else class="detail-analysis-summary">点击运行分析，根据当前运动记录生成表现分析、恢复提示和下次训练建议。</p>
        </section>

        <section v-if="canEditActivity" class="detail-info-group activity-feedback-card">
          <h2>活动反馈</h2>
          <div class="edit-form edit-form--single">
            <label>
              <span>反馈体感</span>
              <input v-model.number="editForm.effort" type="number" min="1" max="10" placeholder="1-10" />
            </label>
            <div class="edit-form-actions">
              <button type="button" class="primary-link" :disabled="isSavingMeta" @click="saveMeta">
                {{ isSavingMeta ? '保存中' : '保存' }}
              </button>
            </div>
          </div>
          <div v-if="canManageManual" class="detail-action-bar">
            <button class="detail-action detail-action--edit" type="button" @click="modalOpen = true">
              <Pencil :size="16" />
              <span>编辑手动运动</span>
            </button>
            <button class="detail-action detail-action--danger" type="button" :disabled="isDeleting" @click="removeActivity">
              <Trash2 :size="16" />
              <span>{{ isDeleting ? '删除中' : '删除手动运动' }}</span>
            </button>
          </div>
        </section>

        <section v-if="canEditActivity" class="detail-info-group activity-photo-card">
          <h2>活动照片</h2>
          <div class="photo-section">
            <label class="photo-upload-label">
              <span>上传活动照片</span>
              <input type="file" accept="image/*" @change="uploadPhoto" :disabled="isUploadingPhoto" />
            </label>
            <span v-if="isUploadingPhoto" class="upload-status">上传中...</span>
            <img v-if="activity.photo_path" :src="photoUrl(activity.photo_path)" class="activity-photo" alt="活动照片" />
          </div>
        </section>
      </section>

      <section v-else class="detail-tab-panel splits-tab">
        <div v-if="isRunningActivity && laps.length" class="split-mode-toggle" aria-label="分段模式">
          <button
            v-for="option in splitModeOptions"
            :key="option.value"
            type="button"
            :class="{ active: splitMode === option.value }"
            @click="splitMode = option.value"
          >
            {{ option.label }}
          </button>
        </div>

        <section class="split-table-card">
          <div class="split-table-header">
            <span>分段</span>
            <span>距离<small>km</small></span>
            <span>时间</span>
            <span>配速<small>/km</small></span>
            <span>心率<small>bpm</small></span>
          </div>
          <div class="split-table-body">
            <div v-for="row in splitRows" :key="row.key" class="split-table-row">
              <span>{{ row.index }}</span>
              <span>{{ row.distance }}</span>
              <strong>{{ row.duration }}</strong>
              <span>{{ row.pace }}</span>
              <strong class="heart-rate-cell">{{ row.heartRate }}</strong>
            </div>
          </div>
        </section>
      </section>

      <ManualActivityModal
        v-if="modalOpen"
        :activity="activity"
        :save="(payload) => updateManualActivity(activity.id, payload)"
        @close="modalOpen = false"
        @saved="handleSaved"
      />
    </template>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import { Activity, Image, Pencil, Share2, Sparkles, Trash2 } from '@lucide/vue'

import ChartPanel from '@/components/ChartPanel.vue'
import ManualActivityModal from '@/components/ManualActivityModal.vue'
import RoutePreview from '@/components/RoutePreview.vue'
import StateBlock from '@/components/StateBlock.vue'
import { analyzeActivity } from '@/services/ai'
import { createCommunityPost } from '@/services/community'
import {
  deleteManualActivity,
  getActivity,
  getActivityZones,
  getHeartRateSeries,
  getLaps,
  getSpeedSeries,
  getTrackPoints,
  updateActivityMeta,
  updateManualActivity,
  uploadActivityPhoto,
} from '@/services/activities'
import { apiClient, resolveMediaUrl } from '@/services/http'
import { authSession } from '@/stores/authStore'
import { formatCalories, formatDistance, formatPaceSeconds } from '@/utils/formatters'

const route = useRoute()
const router = useRouter()
const activity = ref(null)
const error = ref('')
const loading = ref(false)
const modalOpen = ref(false)
const isDeleting = ref(false)
const analysis = ref(null)
const analysisError = ref('')
const analysisLoading = ref(false)
const trackPoints = ref([])
const heartRateSeries = ref([])
const speedSeries = ref([])
const laps = ref([])
const zones = ref([])
const shoes = ref([])
const shoeError = ref('')
const selectedShoeId = ref(null)
const editForm = ref({ activityName: '', effort: null })
const isSavingMeta = ref(false)
const isUploadingPhoto = ref(false)
const isSharingActivity = ref(false)
const activeTab = ref('overview')
const splitMode = ref('lap')

const detailTabs = [
  { key: 'overview', label: '概览' },
  { key: 'charts', label: '图表' },
  { key: 'details', label: '详情' },
  { key: 'analysis', label: '分析' },
  { key: 'splits', label: '分段' },
]
const splitModeOptions = [
  { value: 'lap', label: '1公里' },
  { value: '5k', label: '5公里' },
]
const ZONE_COLORS = ['#94a3b8', '#3ba7dd', '#22c55e', '#f59e0b', '#ef4444']
const HEART_RATE_ZONES = [
  { label: '区间 1', caption: '热身', min: 0, max: 136 },
  { label: '区间 2', caption: '脂肪燃烧', min: 137, max: 155 },
  { label: '区间 3', caption: '有氧', min: 156, max: 168 },
  { label: '区间 4', caption: '临界心率', min: 169, max: 173 },
  { label: '区间 5', caption: '无氧耐力', min: 174, max: Infinity },
]

const sportColor = computed(() => {
  if (activity.value?.activity_type === '骑行') return '#ff9d19'
  if (activity.value?.activity_type === '游泳') return '#33b5ff'
  if (activity.value?.activity_type === '力量训练') return '#8b5cf6'
  return '#21d47b'
})
const activityTitle = computed(() => activity.value?.activity_name || activity.value?.activity_type || '运动详情')
const canManageManual = computed(() => {
  if (!authSession.user || !activity.value?.is_manual) return false
  return authSession.user.role === 'admin'
    || Number(authSession.user.id) === Number(activity.value.ownerUserId)
})
const isRunningActivity = computed(() => {
  const rawType = activity.value?.raw_activity_type || ''
  const type = activity.value?.activity_type || ''
  return type.includes('跑步') || ['running', 'street_running', 'track_running', 'treadmill_running'].includes(rawType)
})
const canEditActivity = computed(() => {
  if (!authSession.user) return false
  if (authSession.user.role === 'admin') return true
  return Number(authSession.user.id) === Number(activity.value?.ownerUserId)
})
const analysisInsights = computed(() => analysis.value?.insights || [])
const analysisSuggestions = computed(() => analysis.value?.suggestions || [])
const trainingLoadValue = computed(() => {
  const load = Number(activity.value?.activity_training_load)
  return Number.isFinite(load) ? load : null
})
const trainingLoadLevel = computed(() => {
  const load = trainingLoadValue.value
  if (load === null) {
    return {
      label: '待评估',
      title: '等待训练负荷',
      copy: '同步更多运动后，这里会按负荷强度给出当次训练判断。',
    }
  }
  if (load < 50) {
    return {
      label: '轻松',
      title: '恢复友好',
      copy: '这次训练偏轻，适合用于恢复、技术动作或维持跑感。',
    }
  }
  if (load < 120) {
    return {
      label: '稳定',
      title: '有氧积累',
      copy: '负荷处在可持续区间，适合作为近期训练量的稳定输入。',
    }
  }
  if (load < 220) {
    return {
      label: '偏强',
      title: '重点训练',
      copy: '这次训练刺激明显，后续安排可以留意恢复和睡眠表现。',
    }
  }
  return {
    label: '高压',
    title: '需要恢复',
    copy: '训练负荷较高，建议把下一次训练安排为轻松跑或休息。',
  }
})
const paceStability = computed(() => {
  const paceValues = speedSeries.value
    .map((point) => paceSecondsFromSpeed(point.speed_mps))
    .filter(Number.isFinite)
  if (paceValues.length < 3) return '--'

  const average = paceValues.reduce((sum, value) => sum + value, 0) / paceValues.length
  if (!Number.isFinite(average) || average <= 0) return '--'

  const variance = paceValues.reduce((sum, value) => sum + ((value - average) ** 2), 0) / paceValues.length
  const coefficient = Math.sqrt(variance) / average
  const score = Math.max(55, Math.min(98, 100 - coefficient * 420))
  return `${Math.round(score)}%`
})
const overviewMetrics = computed(() => [
  { label: '距离', value: formatDistance(activity.value?.total_distance_m) },
  { label: '计时时间', value: formatActivityDuration(activity.value?.total_timer_time_s) },
  { label: '配速', value: formatPacePretty(activity.value?.avg_speed_mps) },
  { label: '平均心率', value: formatBpmShort(activity.value?.avg_heart_rate_bpm) },
  { label: '平均功率', value: formatPower(activity.value?.avg_power_w) },
  { label: '平均步频', value: formatCadence(activity.value?.avg_cadence) },
  { label: '累计爬升', value: formatMetersShort(activity.value?.total_ascent_m) },
  { label: '训练负荷', value: formatTrainingLoad(activity.value?.activity_training_load) },
  { label: '卡路里', value: formatCalories(activity.value?.total_calories) },
])
const overviewMetricItems = computed(() => overviewMetrics.value.map((metric) => ({
  ...metric,
  ...splitMetricValue(metric.value),
})))

const heartRateOption = computed(() => createLineOption('心率', 'bpm', '#ef4444', heartRateSeries.value, 'heart_rate_bpm', {
  areaColor: 'rgba(239, 68, 68, 0.22)',
}))
const paceOption = computed(() => {
  const paceValues = speedSeries.value
    .map((point) => paceSecondsFromSpeed(point.speed_mps))
    .filter(Number.isFinite)
  const slowestPace = paceValues.length ? Math.max(...paceValues) : null

  return createLineOption('配速', '/km', '#2396dc', speedSeries.value, 'speed_mps', {
    areaColor: 'rgba(35, 150, 220, 0.2)',
    valueFormatter: (value) => formatPacePrettySeconds(paceFromDisplayValue(value, slowestPace)),
    valueMapper: (point) => {
      const paceSecPerKm = paceSecondsFromSpeed(point.speed_mps)
      if (!Number.isFinite(paceSecPerKm) || !Number.isFinite(slowestPace)) return null
      return slowestPace - paceSecPerKm
    },
    yAxis: {
      min: 0,
      axisLabel: {
        formatter: (value) => formatPacePrettySeconds(paceFromDisplayValue(value, slowestPace), false),
      },
    },
  })
})
const cadenceOption = computed(() => createLineOption('步频', 'spm', '#8b5cf6', trackPoints.value, 'cadence', {
  valueMapper: (point) => {
    const cadence = Number(point.cadence)
    return Number.isFinite(cadence) && cadence > 0 ? cadence * 2 : null
  },
}))
const altitudeOption = computed(() => createLineOption('海拔', 'm', '#16a34a', trackPoints.value, 'altitude_m'))
const verticalOscillationOption = computed(() => createLineOption('垂直振幅', 'mm', '#f59e0b', trackPoints.value, 'vertical_oscillation_mm'))
const strideLengthOption = computed(() => createLineOption('步幅', 'm', '#14b8a6', trackPoints.value, 'speed_mps', {
  valueMapper: (point) => {
    const speedMps = Number(point.speed_mps)
    const cadence = Number(point.cadence)
    if (!Number.isFinite(speedMps) || !Number.isFinite(cadence) || speedMps <= 0 || cadence <= 0) return null
    return Number((speedMps * 60 / (cadence * 2)).toFixed(2))
  },
}))
const powerOption = computed(() => createLineOption('功率', 'W', '#db2777', trackPoints.value, 'power_w'))

const heartRateZoneRows = computed(() => {
  const pointRows = buildPointZoneRows(HEART_RATE_ZONES, 'heart_rate_bpm')
  if (pointRows.length) return pointRows

  const apiRows = zones.value
    .filter((zone) => String(zone.zoneType || zone.zone_type || '').includes('heart'))
    .map((zone, index) => ({
      label: `区间 ${zone.zoneIndex || zone.zone_index || index + 1}`,
      caption: '心率区间',
      durationS: Number(zone.durationS || zone.duration_s || 0),
      color: ZONE_COLORS[index % ZONE_COLORS.length],
    }))
    .filter((zone) => zone.durationS > 0)
  const total = apiRows.reduce((sum, row) => sum + row.durationS, 0)
  return apiRows.map((row) => ({ ...row, percent: total ? (row.durationS / total) * 100 : 0 }))
})
const chartBlocks = computed(() => {
  const blocks = []
  if (hasMetric(speedSeries.value, 'speed_mps')) {
    blocks.push({
      key: 'pace',
      title: '配速曲线',
      summary: `平均 ${formatPacePretty(activity.value?.avg_speed_mps)} · 最快 ${formatPacePretty(activity.value?.max_speed_mps)}`,
      option: paceOption.value,
    })
  }
  if (hasMetric(heartRateSeries.value, 'heart_rate_bpm')) {
    blocks.push({
      key: 'heart-rate',
      title: '心率曲线',
      summary: `${formatBpmShort(activity.value?.avg_heart_rate_bpm)} · 最大 ${formatBpmShort(activity.value?.max_heart_rate_bpm)}`,
      option: heartRateOption.value,
    })
    if (heartRateZoneRows.value.length) {
      blocks.push({
        key: 'heart-rate-zones',
        type: 'zones',
        title: '心率区间',
        summary: '按训练强度分布',
      })
    }
  }
  if (hasMetric(trackPoints.value, 'cadence')) {
    blocks.push({ key: 'cadence', title: '步频曲线', summary: `平均 ${formatCadence(activity.value?.avg_cadence)}`, option: cadenceOption.value })
  }
  if (hasStrideData.value) {
    blocks.push({ key: 'stride-length', title: '步幅曲线', summary: '速度与步频推算', option: strideLengthOption.value })
  }
  if (hasMetric(trackPoints.value, 'vertical_oscillation_mm')) {
    blocks.push({ key: 'vertical-oscillation', title: '垂直振幅曲线', summary: '跑步动态', option: verticalOscillationOption.value })
  }
  if (hasMetric(trackPoints.value, 'altitude_m')) {
    blocks.push({ key: 'altitude', title: '海拔曲线', summary: `累计爬升 ${formatMetersShort(activity.value?.total_ascent_m)}`, option: altitudeOption.value })
  }
  if (hasMetric(trackPoints.value, 'power_w')) {
    blocks.push({ key: 'power', title: '功率曲线', summary: `平均 ${formatPower(activity.value?.avg_power_w)}`, option: powerOption.value })
  }
  return blocks
})
const hasStrideData = computed(() =>
  trackPoints.value.some((point) => positiveNumber(point.speed_mps) && positiveNumber(point.cadence)),
)
const detailGroups = computed(() => [
  {
    title: '常规',
    items: [
      { label: '距离', value: formatDistance(activity.value?.total_distance_m) },
      { label: '计时时间', value: formatActivityDuration(activity.value?.total_timer_time_s) },
      { label: '移动时间', value: formatActivityDuration(activity.value?.total_moving_time_s) },
      { label: '总耗时', value: formatActivityDuration(activity.value?.total_elapsed_time_s) },
      { label: '卡路里', value: formatCalories(activity.value?.total_calories) },
      { label: '脂肪消耗(估算)', value: formatFat(activity.value?.total_calories) },
    ],
  },
  {
    title: '心率',
    items: [
      { label: '平均心率', value: formatBpmShort(activity.value?.avg_heart_rate_bpm) },
      { label: '最大心率', value: formatBpmShort(activity.value?.max_heart_rate_bpm) },
    ],
  },
  {
    title: '配速',
    items: [
      { label: '配速', value: formatPacePretty(activity.value?.avg_speed_mps) },
      { label: '最快', value: formatPacePretty(activity.value?.max_speed_mps) },
      { label: '配速稳定', value: paceStability.value },
    ],
  },
  {
    title: '跑步动态',
    items: [
      { label: '平均步频', value: formatCadence(activity.value?.avg_cadence) },
      { label: '最高步频', value: formatCadence(activity.value?.max_cadence) },
      averageMetric(trackPoints.value, 'vertical_oscillation_mm') === null
        ? null
        : { label: '平均垂直振幅', value: `${averageMetric(trackPoints.value, 'vertical_oscillation_mm').toFixed(1)} mm` },
    ].filter(Boolean),
  },
  {
    title: '天气',
    items: [
      { label: '天气', value: activity.value?.weather_condition || '--' },
      { label: '温度', value: formatTemperature(activity.value?.temperature_c) },
      { label: '湿度', value: formatPercent(activity.value?.humidity_percent) },
      { label: '体感', value: formatTemperature(activity.value?.feels_like_c) },
    ],
  },
])
const splitRows = computed(() => {
  const source = isRunningActivity.value
    ? buildDistanceGroups(laps.value, splitMode.value === '5k' ? 5000 : 1000)
    : laps.value

  if (source.length) {
    return source.map((lap, index) => ({
      key: `${splitMode.value}-${index}-${lap.lap_index ?? 'lap'}`,
      index: splitMode.value === '5k' ? lap.lap_index : index + 1,
      distance: formatDistanceKm(lap.total_distance_m),
      duration: formatLapDuration(lap.total_timer_time_s),
      pace: formatPacePretty(lap.avg_speed_mps, false),
      heartRate: formatNumber(lap.avg_heart_rate_bpm, 0),
    }))
  }

  return [{
    key: 'full',
    index: '全程',
    distance: formatDistanceKm(activity.value?.total_distance_m),
    duration: formatActivityDuration(activity.value?.total_timer_time_s),
    pace: formatPacePretty(activity.value?.avg_speed_mps, false),
    heartRate: formatNumber(activity.value?.avg_heart_rate_bpm, 0),
  }]
})

function selectTab(key) {
  activeTab.value = key
  document.querySelector('.page-frame')?.scrollTo({ top: 0, behavior: 'smooth' })
}

function placeholderAction(message) {
  showToast(message)
}

function splitMetricValue(value) {
  const text = String(value || '--')
  if (text === '--') return { valueText: '--', unitText: '' }

  const unitMatch = text.match(/^(.+?)\s+(km|m|kcal|bpm|W|g|\/km)$/)
  if (unitMatch) {
    return { valueText: unitMatch[1], unitText: unitMatch[2] }
  }
  return { valueText: text, unitText: '' }
}

function toTimestamp(value) {
  if (!value) return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

function formatActivityDuration(seconds) {
  const value = Number(seconds)
  if (!Number.isFinite(value) || value < 0) return '--'
  const rounded = Math.round(value)
  const hours = Math.floor(rounded / 3600)
  const minutes = Math.floor((rounded % 3600) / 60)
  const rest = rounded % 60
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

function formatDurationShort(seconds) {
  return formatActivityDuration(seconds)
}

function formatMetersShort(value) {
  const meters = Number(value)
  return Number.isFinite(meters) ? `${Math.round(meters)} m` : '--'
}

function formatBpmShort(value) {
  const bpm = Number(value)
  return Number.isFinite(bpm) && bpm > 0 ? `${Math.round(bpm)} bpm` : '--'
}

function formatPower(value) {
  const power = Number(value)
  return Number.isFinite(power) && power > 0 ? `${Math.round(power)} W` : '--'
}

function formatCadence(value) {
  const cadence = Number(value)
  if (!Number.isFinite(cadence) || cadence <= 0) return '--'
  const fullCadence = cadence < 130 ? cadence * 2 : cadence
  return `${Math.round(fullCadence)}`
}

function formatFat(calories) {
  const value = Number(calories)
  if (!Number.isFinite(value) || value <= 0) return '--'
  return `${(value / 9.0).toFixed(1)} g`
}

function formatTemperature(value) {
  const number = Number(value)
  return Number.isFinite(number) ? `${Math.round(number)}°C` : '--'
}

function formatPercent(value) {
  const number = Number(value)
  return Number.isFinite(number) ? `${Math.round(number)}%` : '--'
}

function formatTrainingLoad(value) {
  if (value === null || value === undefined || value === '') return '--'
  const load = Number(value)
  return Number.isFinite(load) ? load.toFixed(load >= 100 ? 0 : 1) : '--'
}

function formatNumber(value, digits = 0) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return '--'
  return number.toFixed(digits)
}

function positiveNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

function paceSecondsFromSpeed(speedMps) {
  const speed = Number(speedMps)
  if (!Number.isFinite(speed) || speed <= 0) return null
  const paceSecPerKm = 1000 / speed
  return paceSecPerKm <= 900 ? paceSecPerKm : null
}

function formatPacePretty(speedMps, withUnit = true) {
  return formatPacePrettySeconds(paceSecondsFromSpeed(speedMps), withUnit)
}

function formatPacePrettySeconds(secondsPerKm, withUnit = true) {
  const seconds = Number(secondsPerKm)
  if (!Number.isFinite(seconds) || seconds <= 0) return '--'
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60).toString().padStart(2, '0')
  return withUnit ? `${minutes}'${rest}" /km` : `${minutes}'${rest}"`
}

function paceFromDisplayValue(value, slowestPace) {
  const displayValue = Number(value)
  if (!Number.isFinite(displayValue) || !Number.isFinite(slowestPace)) return null
  return slowestPace - displayValue
}

function formatDistanceKm(value) {
  const distance = Number(value)
  return Number.isFinite(distance) ? (distance / 1000).toFixed(2) : '--'
}

function formatLapDuration(value) {
  return formatActivityDuration(value)
}

function formatDetailDateTime(value, withSeconds = false) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'

  const dateText = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
  const weekday = new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(date)
  const timeText = new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: withSeconds ? '2-digit' : undefined,
    hour12: false,
  }).format(date)

  return `${dateText}（${weekday}） ${timeText}`
}

function elapsedLabels(source) {
  const firstTimestamp = source.map((point) => toTimestamp(point.sample_time_utc)).find(Number.isFinite)
  return source.map((point, index) => {
    const timestamp = toTimestamp(point.sample_time_utc)
    if (Number.isFinite(timestamp) && Number.isFinite(firstTimestamp)) {
      return formatActivityDuration((timestamp - firstTimestamp) / 1000)
    }
    return formatActivityDuration(index)
  })
}

function niceStep(value) {
  if (!Number.isFinite(value) || value <= 0) return 1

  const magnitude = 10 ** Math.floor(Math.log10(value))
  const normalized = value / magnitude
  if (normalized <= 1) return magnitude
  if (normalized <= 2) return 2 * magnitude
  if (normalized <= 5) return 5 * magnitude
  return 10 * magnitude
}

function niceAxisMin(values) {
  if (!values.length) return undefined

  const min = Math.min(...values)
  const max = Math.max(...values)
  if (min >= 0) return 0

  const span = Math.max(max - min, Math.abs(min), 1)
  const step = niceStep(span / 5)
  return Math.floor(min / step) * step
}

function hasMetric(source, field) {
  return source.some((point) => positiveNumber(point[field]) !== null)
}

function averageMetric(source, field) {
  const values = source.map((point) => positiveNumber(point[field])).filter((value) => value !== null)
  if (!values.length) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function createLineOption(name, unit, color, source, field, options = {}) {
  const orderedSource = orderedChartSource(source)
  const rawValues = orderedSource.map((point) => (
    options.valueMapper ? options.valueMapper(point) : point[field]
  ))
  const values = options.smoothData === false
    ? rawValues
    : smoothNumericValues(rawValues, options.smoothWindow ?? 5)
  const numericValues = values
    .filter((value) => value !== null && value !== undefined)
    .map(Number)
    .filter(Number.isFinite)
  const axisMin = options.yAxis?.min ?? niceAxisMin(numericValues)
  const areaOrigin = axisMin ?? 'auto'
  const yAxis = {
    type: 'value',
    name: unit,
    min: axisMin,
    axisLabel: { color: '#4b5563' },
    splitLine: { lineStyle: { color: '#e5e7eb' } },
    ...options.yAxis,
    axisLabel: {
      color: '#4b5563',
      ...(options.yAxis?.axisLabel || {}),
    },
  }

  return {
    color: [color],
    tooltip: {
      trigger: 'axis',
      formatter: (items) => {
        const item = Array.isArray(items) ? items[0] : items
        const value = item?.data
        const formattedValue = options.valueFormatter
          ? options.valueFormatter(value)
          : `${value ?? '--'} ${unit}`
        return `${item?.axisValue || ''}<br/>${item?.marker || ''}${name}: ${formattedValue}`
      },
    },
    grid: { left: 42, right: 18, top: 18, bottom: 30 },
    xAxis: {
      type: 'category',
      data: elapsedLabels(orderedSource),
      axisLine: { lineStyle: { color: '#cbd5e1' } },
      axisLabel: { color: '#4b5563' },
    },
    yAxis,
    series: [
      {
        name,
        type: 'line',
        smooth: true,
        symbol: 'none',
        data: values,
        lineStyle: { width: 2 },
        areaStyle: options.showArea === false ? undefined : {
          color: options.areaColor || color,
          opacity: 0.18,
          origin: areaOrigin,
        },
      },
    ],
  }
}

function orderedChartSource(source) {
  return [...source].sort((a, b) => {
    const timeA = toTimestamp(a.sample_time_utc)
    const timeB = toTimestamp(b.sample_time_utc)
    if (Number.isFinite(timeA) && Number.isFinite(timeB) && timeA !== timeB) return timeA - timeB
    return Number(a.sample_index ?? a.sequence ?? 0) - Number(b.sample_index ?? b.sequence ?? 0)
  })
}

function smoothNumericValues(values, windowSize) {
  const size = Math.max(1, Math.floor(Number(windowSize) || 1))
  if (size <= 1) return values
  const radius = Math.floor(size / 2)
  return values.map((value, index) => {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return value

    const samples = []
    for (let offset = -radius; offset <= radius; offset += 1) {
      const neighbor = Number(values[index + offset])
      if (Number.isFinite(neighbor)) samples.push(neighbor)
    }
    if (!samples.length) return value
    return Number((samples.reduce((sum, item) => sum + item, 0) / samples.length).toFixed(2))
  })
}

function durationForPoint(point, nextPoint) {
  const current = toTimestamp(point.sample_time_utc)
  const next = toTimestamp(nextPoint?.sample_time_utc)
  if (Number.isFinite(current) && Number.isFinite(next) && next > current) {
    return Math.min((next - current) / 1000, 10)
  }
  return 1
}

function valueInZone(value, zone) {
  return value >= zone.min && value <= zone.max
}

function buildPointZoneRows(zoneDefs, field) {
  const durations = zoneDefs.map(() => 0)

  trackPoints.value.forEach((point, index) => {
    const value = Number(point[field])
    if (!Number.isFinite(value) || value <= 0) return

    const zoneIndex = zoneDefs.findIndex((zone) => valueInZone(value, zone))
    if (zoneIndex < 0) return
    durations[zoneIndex] += durationForPoint(point, trackPoints.value[index + 1])
  })

  const total = durations.reduce((sum, value) => sum + value, 0)
  if (total <= 0) return []

  return zoneDefs.map((zone, index) => ({
    ...zone,
    color: ZONE_COLORS[index],
    durationS: durations[index],
    percent: total ? (durations[index] / total) * 100 : 0,
  })).reverse()
}

function weightedAverage(items, field) {
  let weightedSum = 0
  let weightSum = 0
  items.forEach((item) => {
    const value = positiveNumber(item[field])
    const weight = positiveNumber(item.total_timer_time_s)
    if (value === null || weight === null) return
    weightedSum += value * weight
    weightSum += weight
  })
  return weightSum > 0 ? weightedSum / weightSum : null
}

function buildDistanceGroups(sourceLaps, targetDistanceM) {
  const groups = []
  let current = []
  let currentDistance = 0

  sourceLaps.forEach((lap) => {
    const distance = positiveNumber(lap.total_distance_m) || 0
    current.push(lap)
    currentDistance += distance

    if (currentDistance >= targetDistanceM) {
      groups.push(createDistanceGroup(current, groups.length, currentDistance, targetDistanceM))
      current = []
      currentDistance = 0
    }
  })

  if (current.length) {
    groups.push(createDistanceGroup(current, groups.length, currentDistance, targetDistanceM))
  }

  return groups
}

function createDistanceGroup(groupLaps, index, distanceM, targetDistanceM) {
  const durationS = groupLaps.reduce((sum, lap) => sum + (positiveNumber(lap.total_timer_time_s) || 0), 0)
  const segmentKm = Math.max(1, Math.round(targetDistanceM / 1000))
  const startKm = index * segmentKm + 1
  const endKm = index * segmentKm + Math.max(1, Math.round(distanceM / 1000))
  return {
    lap_index: segmentKm === 1 ? startKm : `${startKm}-${endKm}`,
    total_distance_m: distanceM,
    total_timer_time_s: durationS,
    avg_speed_mps: durationS > 0 ? distanceM / durationS : null,
    avg_heart_rate_bpm: weightedAverage(groupLaps, 'avg_heart_rate_bpm'),
  }
}

async function loadActivity(id) {
  loading.value = true
  error.value = ''
  analysis.value = null
  analysisError.value = ''
  activeTab.value = 'overview'
  splitMode.value = 'lap'
  setNavTitle('运动详情')

  try {
    const nextActivity = await getActivity(id)
    activity.value = nextActivity || null
    setNavTitle(nextActivity?.activity_name || nextActivity?.activity_type || '运动详情')

    if (!nextActivity) {
      trackPoints.value = []
      heartRateSeries.value = []
      speedSeries.value = []
      laps.value = []
      zones.value = []
      return
    }

    editForm.value.activityName = nextActivity.activity_name || ''
    editForm.value.effort = nextActivity.perceived_effort || null

    selectedShoeId.value = nextActivity.shoe_id || nextActivity.shoeId || null
    shoeError.value = ''
    try {
      const { data } = await apiClient.get('/shoes')
      shoes.value = data?.data || data || []
    } catch (err) {
      shoes.value = []
      shoeError.value = err instanceof Error ? err.message : '跑鞋列表暂时无法加载'
    }

    const [points, heartRate, speed, lapRows, zoneRows] = await Promise.all([
      getTrackPoints(id),
      getHeartRateSeries(id),
      getSpeedSeries(id),
      getLaps(id),
      getActivityZones(id).catch(() => []),
    ])

    trackPoints.value = points
    heartRateSeries.value = heartRate
    speedSeries.value = speed
    laps.value = lapRows
    zones.value = zoneRows
  } catch (err) {
    error.value = err instanceof Error ? err.message : '详情加载失败'
  } finally {
    loading.value = false
  }
}

async function runAnalysis() {
  analysisError.value = ''
  analysisLoading.value = true
  try {
    const envelope = await analyzeActivity(activity.value.id)
    analysis.value = envelope.data
    showToast('分析完成')
  } catch (err) {
    analysisError.value = err instanceof Error ? err.message : '智能分析失败'
  } finally {
    analysisLoading.value = false
  }
}

async function saveMeta() {
  isSavingMeta.value = true
  try {
    const updated = await updateActivityMeta(activity.value.id, {
      perceivedEffort: editForm.value.effort || null,
    })
    activity.value = updated
    setNavTitle(updated.activity_name || updated.activity_type || '运动详情')
    editForm.value.activityName = updated.activity_name || ''
    editForm.value.effort = updated.perceived_effort || null
    showToast('已保存')
  } catch (err) {
    error.value = err instanceof Error ? err.message : '保存失败'
  } finally {
    isSavingMeta.value = false
  }
}

async function shareActivityToCommunity() {
  if (!activity.value?.id) return

  isSharingActivity.value = true
  error.value = ''
  try {
    await createCommunityPost({
      content: buildCommunityShareText(),
      visibility: 'public',
      activityId: activity.value.id,
    })
    showToast('已分享到运动圈')
    router.push('/community')
  } catch (err) {
    error.value = err instanceof Error ? err.message : '分享到运动圈失败'
  } finally {
    isSharingActivity.value = false
  }
}

function buildCommunityShareText() {
  return '分享了一次运动'
}

function photoUrl(path) {
  return resolveMediaUrl(path)
}

async function uploadPhoto(e) {
  const file = e.target.files?.[0]
  if (!file) return
  isUploadingPhoto.value = true
  try {
    const updated = await uploadActivityPhoto(activity.value.id, file)
    activity.value = updated
    editForm.value.activityName = updated.activity_name || ''
    editForm.value.effort = updated.perceived_effort || null
    showToast('照片已上传')
  } catch (err) {
    error.value = err instanceof Error ? err.message : '照片上传失败'
  } finally {
    isUploadingPhoto.value = false
    e.target.value = ''
  }
}

async function removeActivity() {
  if (!canManageManual.value) {
    error.value = '无法删除不属于你的手动运动记录'
    return
  }
  if (!window.confirm('确定删除这条手动运动记录吗？')) return
  isDeleting.value = true
  try {
    await deleteManualActivity(activity.value.id)
    router.push('/activities')
  } catch (err) {
    error.value = err instanceof Error ? err.message : '删除失败'
  } finally {
    isDeleting.value = false
  }
}

async function handleSaved(nextActivity) {
  modalOpen.value = false
  activity.value = nextActivity
  await loadActivity(nextActivity.id)
}

async function bindShoe() {
  await apiClient.post(`/activities/${activity.value.id}/shoe`, { shoeId: selectedShoeId.value })
  const shoe = shoes.value.find((item) => item.id === selectedShoeId.value)
  activity.value.shoeName = shoe?.name || null
  activity.value.shoe_name = shoe?.name || null
  showToast(shoe ? '已绑定跑鞋' : '已取消跑鞋绑定')
}

function setNavTitle(title) {
  window.dispatchEvent(new CustomEvent('motioncare:nav-title', { detail: { title } }))
}

watch(() => route.params.id, loadActivity, { immediate: true })
watch(isRunningActivity, (nextIsRunning) => {
  if (!nextIsRunning) splitMode.value = 'lap'
})

onBeforeUnmount(() => {
  setNavTitle('')
})
</script>

<style scoped>
.activity-detail-page {
  --activity-detail-gutter: var(--space-4);

  display: grid;
  gap: 0;
  margin: calc(var(--activity-detail-gutter) * -1);
  padding-bottom: var(--space-5);
  background: #f2f4f7;
  color: #111827;
}

.activity-detail-tabs {
  position: sticky;
  top: calc(28px - var(--activity-detail-gutter));
  z-index: 4;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  border-bottom: 1px solid #d7dce3;
  background: #f2f4f7;
}

.activity-detail-tabs::before {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  top: -28px;
  height: 28px;
  background: var(--app-top-green);
  pointer-events: none;
}

.activity-detail-tabs button {
  position: relative;
  min-height: 58px;
  border: 0;
  background: transparent;
  color: #3f4652;
  font-size: 17px;
  font-weight: 500;
}

.activity-detail-tabs button.active {
  color: #16b96f;
  font-weight: 800;
}

.activity-detail-tabs button.active::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 4px;
  background: #19c77b;
}

.detail-tab-panel {
  display: grid;
  gap: 18px;
}

.overview-tab {
  gap: 0;
}

.detail-overview-map {
  border-radius: 0;
  border: 0;
  box-shadow: none;
}

.detail-overview-map :deep(.panel-heading) {
  display: none;
}

.detail-overview-map :deep(.route-map) {
  min-height: 292px;
  border-radius: 0;
}

.activity-title-card {
  display: grid;
  grid-template-columns: 82px minmax(0, 1fr);
  align-items: center;
  gap: 14px;
  padding: 20px 22px;
  border-bottom: 1px solid #d7dce3;
  background: #f8fafc;
}

.activity-type-icon {
  width: 64px;
  height: 64px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: color-mix(in srgb, var(--sport-color) 12%, #fff);
  color: var(--sport-color);
}

.activity-title-card h1 {
  margin: 0;
  color: #111827;
  font-size: 25px;
  line-height: 1.15;
}

.activity-title-card p {
  margin: 8px 0 0;
  color: #4b5563;
  font-size: 16px;
}

.overview-metric-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 30px 18px;
  padding: 26px 22px 28px;
  background: #f2f4f7;
}

.overview-metric-grid article {
  min-width: 0;
}

.overview-metric-grid small {
  display: block;
  color: #5c6470;
  font-size: 15px;
  line-height: 1.3;
}

.overview-metric-grid strong {
  display: block;
  margin-top: 6px;
  color: #111827;
  font-size: 24px;
  font-weight: 800;
  line-height: 1.15;
}

.overview-metric-value {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
}

.overview-metric-value em {
  color: #111827;
  font-size: 14px;
  font-style: normal;
  font-weight: 500;
}

.training-analysis-card,
.analysis-result-card,
.chart-section,
.detail-info-group,
.split-table-card {
  margin: 0 16px;
  border: 1px solid #d9dee5;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 10px 24px rgb(15 23 42 / 0.06);
}

.training-analysis-card {
  display: grid;
  gap: 14px;
  padding: 20px;
}

.compact-heading {
  align-items: start;
}

.compact-heading h2 {
  margin: 2px 0 0;
  color: #111827;
  font-size: 24px;
}

.training-analysis-card p,
.analysis-result-card p,
.detail-analysis-summary {
  margin: 0;
  color: #516073;
  font-size: 15px;
  line-height: 1.7;
}

.analysis-factor-grid,
.analysis-insights {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.analysis-factor-grid span,
.analysis-insights span {
  min-width: 0;
  padding: 12px;
  border-radius: 14px;
  background: #eef8f3;
}

.analysis-factor-grid small,
.analysis-insights small {
  display: block;
  color: #66758a;
  font-size: 12px;
}

.analysis-factor-grid b,
.analysis-insights b {
  display: block;
  margin-top: 6px;
  color: #111827;
  font-size: 17px;
  line-height: 1.15;
}

.detail-action-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 14px;
  padding: 18px 20px 24px;
}

.detail-action-row button {
  min-height: 54px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid #aeb6c2;
  border-radius: 16px;
  background: transparent;
  color: #111827;
  font-size: 17px;
  font-weight: 700;
}

.detail-action-row .coach-action {
  border-color: #17bf72;
  background: #17bf72;
  color: #fff;
}

.analysis-result-card {
  display: grid;
  gap: 14px;
  padding: 18px;
}

.analysis-result-card ul,
.detail-analysis-list {
  margin: 0;
  padding-left: 18px;
  color: #516073;
  line-height: 1.7;
}

.chart-tab,
.details-tab,
.analysis-tab,
.splits-tab {
  padding: 18px 0 28px;
}

.chart-section {
  display: grid;
  gap: 8px;
  padding: 16px 14px 10px;
}

.chart-section-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.chart-section-heading h2 {
  margin: 0;
  color: #111827;
  font-size: 24px;
}

.chart-section-heading span {
  color: #111827;
  font-size: 16px;
  font-weight: 500;
  text-align: right;
}

.activity-chart-panel {
  min-height: 0;
  padding: 0;
  border: 1px solid #d7dce3;
  border-radius: 0;
  box-shadow: 0 8px 18px rgb(15 23 42 / 0.06);
}

.activity-chart-panel :deep(.panel-heading) {
  display: none;
}

.activity-chart-panel :deep(.chart-canvas) {
  height: 196px;
  background: #fff;
}

.zone-chart-section {
  padding: 18px;
}

.zone-list-detail {
  display: grid;
  gap: 18px;
  padding: 12px 0 0;
}

.zone-row-detail {
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(108px, 1.2fr) 54px 42px;
  align-items: center;
  gap: 12px;
}

.zone-row-detail b {
  display: block;
  color: #111827;
  font-size: 15px;
}

.zone-row-detail small {
  display: block;
  margin-top: 2px;
  color: #4b5563;
  font-size: 13px;
}

.zone-bar-detail {
  height: 16px;
  overflow: hidden;
  background: color-mix(in srgb, var(--zone-color, #94a3b8) 13%, #f8fafc);
}

.zone-bar-detail span {
  display: block;
  height: 100%;
}

.zone-row-detail strong,
.zone-row-detail em {
  color: #111827;
  font-style: normal;
  font-size: 15px;
  font-weight: 700;
  text-align: right;
}

.detail-info-group {
  padding: 18px 20px;
}

.detail-info-group h2 {
  margin: 0 0 14px;
  color: #111827;
  font-size: 20px;
}

.detail-info-list {
  display: grid;
  gap: 0;
}

.detail-info-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  min-height: 46px;
  padding: 6px 0;
  color: #4b5563;
  font-size: 17px;
}

.detail-info-row strong {
  color: #111827;
  font-size: 20px;
  font-weight: 800;
  text-align: right;
}

.edit-form {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-end;
  padding: 4px 0 12px;
}

.edit-form--single {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
}

.edit-form label {
  display: flex;
  flex: 1 1 140px;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: #64748b;
}

.edit-form input {
  padding: 10px 12px;
  border: 1px solid #d7dce3;
  border-radius: 10px;
  background: #f8fafc;
  color: #111827;
}

.photo-section {
  padding: 8px 0 0;
  display: grid;
  gap: 12px;
}

.photo-upload-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: #64748b;
}

.upload-status {
  font-size: 12px;
  color: #64748b;
}

.activity-photo {
  width: auto;
  max-width: 100%;
  max-height: 180px;
  border-radius: 8px;
  object-fit: cover;
  margin-top: 8px;
}

.detail-action-bar {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  width: 100%;
  margin-top: 12px;
}

.detail-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 0;
  min-height: 44px;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--sport-color) 28%, #d7dce3);
  border-radius: 12px;
  background: color-mix(in srgb, var(--sport-color) 10%, #fff);
  color: #135f3b;
  font-weight: 800;
}

.detail-action--edit {
  background: #fff;
  color: #111827;
}

.detail-action--danger {
  border-color: color-mix(in srgb, #ef4444 36%, transparent);
  background: color-mix(in srgb, #ef4444 9%, #fff);
  color: #ef4444;
}

.shoe-bind {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
}

.shoe-bind select {
  flex: 1 1 180px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid #d7dce3;
  border-radius: 10px;
  background: #f8fafc;
  color: #111827;
}

.shoe-bind-info,
.form-error {
  font-size: 13px;
  color: #64748b;
}

.form-error {
  color: #ef4444;
}

.split-mode-toggle {
  display: flex;
  gap: 10px;
  padding: 0 20px;
}

.split-mode-toggle button {
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid #d7dce3;
  border-radius: 999px;
  background: #fff;
  color: #111827;
  font-weight: 500;
}

.split-mode-toggle button.active {
  border-color: #d7dce3;
  background: #fff;
  color: #000;
}

.split-table-card {
  overflow: hidden;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.split-table-header,
.split-table-row {
  display: grid;
  grid-template-columns: 0.78fr 1fr 1.05fr 1.05fr 1fr;
  align-items: center;
  gap: 8px;
  padding: 11px 22px;
  text-align: left;
}

.split-table-header {
  color: #111827;
  font-size: 16px;
  font-weight: 800;
  border-bottom: 1px solid #e5e7eb;
}

.split-table-header small {
  display: inline;
  margin-left: 2px;
  color: #4b5563;
  font-size: 12px;
  font-weight: 500;
}

.split-table-row {
  min-height: 58px;
  color: #111827;
  font-size: 16px;
  background: #fff;
}

.split-table-row:nth-child(odd) {
  background: #f2f4f7;
}

.split-table-row strong {
  font-weight: 800;
}

.heart-rate-cell {
  color: #b42335;
  text-align: left;
}

@container phone-frame (min-width: 410px) {
  .activity-detail-page {
    --activity-detail-gutter: 18px;
  }
}

@container phone-frame (max-width: 374px) {
  .activity-title-card {
    grid-template-columns: 66px minmax(0, 1fr);
    padding: 18px 16px;
  }

  .activity-type-icon {
    width: 56px;
    height: 56px;
  }

  .overview-metric-grid,
  .analysis-factor-grid,
  .analysis-insights {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .detail-action-row {
    grid-template-columns: 1fr;
  }

  .zone-row-detail {
    grid-template-columns: 1fr;
  }

  .split-table-header,
  .split-table-row {
    grid-template-columns: 0.6fr 1fr 1fr 1fr 1fr;
    padding: 14px 16px;
    font-size: 16px;
  }
}
</style>
