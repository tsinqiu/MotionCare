<template>
  <article
    class="activity-card rq-activity-card"
    :class="sportClass"
    :style="{ '--sport-color': sportColor }"
    role="button"
    tabindex="0"
    @click="$emit('select', activity)"
    @keydown.enter="$emit('select', activity)"
    @keydown.space.prevent="$emit('select', activity)"
  >
    <time class="activity-card-time">{{ formattedCardTime }}</time>
    <div class="activity-card-main">
      <span class="activity-accent" aria-hidden="true"></span>
      <span class="activity-icon" aria-hidden="true">
        <img v-if="activity.photo_path" :src="photoUrl(activity.photo_path)" class="activity-thumb" alt="" />
        <component :is="sportIcon" v-else :size="22" />
      </span>
      <span class="activity-copy">
        <span class="activity-title">
          <strong>{{ displayTitle }}</strong>
        </span>
        <span class="activity-subtitle">
          {{ activity.activity_type }}
        </span>
      </span>
    </div>

    <div class="activity-metrics">
      <span v-for="metric in metricItems" :key="metric.label">
        <small>{{ metric.label }}</small>
        <b>{{ metric.value }}</b>
      </span>
    </div>

    <div v-if="$slots.actions" class="activity-card-actions">
      <slot name="actions" />
    </div>
  </article>
</template>

<script setup>
import { computed } from 'vue'
import { Bike, Dumbbell, Footprints, Waves } from '@lucide/vue'

import {
  formatCalories,
  formatClockDuration,
  formatDateTime,
  formatDistance,
  formatPace,
  formatSpeed,
} from '@/utils/formatters'
import { resolveMediaUrl } from '@/services/http'

const props = defineProps({
  activity: {
    type: Object,
    required: true,
  },
})

defineEmits(['select'])

const sportClass = computed(() => {
  if (props.activity.raw_activity_type?.includes('cycling') || props.activity.activity_type === '骑行') return 'ride'
  if (props.activity.raw_activity_type?.includes('swim') || props.activity.activity_type === '游泳') return 'swim'
  if (props.activity.raw_activity_type === 'strength_training' || props.activity.activity_type === '力量训练') return 'strength'
  return 'run'
})

const sportColor = computed(() => ({
  run: '#21d47b',
  ride: '#ff9d19',
  swim: '#33b5ff',
  strength: '#8b5cf6',
}[sportClass.value] || '#94a3b8'))

const sportIcon = computed(() => ({
  run: Footprints,
  ride: Bike,
  swim: Waves,
  strength: Dumbbell,
}[sportClass.value] || Footprints))

const displayTitle = computed(() => (
  props.activity.activity_name || props.activity.location_name || props.activity.activity_type
))
const formattedCardTime = computed(() => formatCardDateTime(props.activity.local_start_time))

const speedLabel = computed(() => (sportClass.value === 'ride' ? '速度' : '配速'))
const speedValue = computed(() => (sportClass.value === 'ride'
  ? formatSpeed(props.activity.avg_speed_mps)
  : formatPace(props.activity.avg_speed_mps)))
const trainingLoadValue = computed(() => {
  const load = props.activity.activity_training_load
  if (load === null || load === undefined || load === '') return '--'
  const numeric = Number(load)
  return Number.isFinite(numeric) ? `${Math.round(numeric)}` : '--'
})

const weatherText = computed(() => {
  const condition = props.activity.weather_condition || '--'
  const temp = props.activity.temperature_c
  return temp === null || temp === undefined ? condition : `${condition} ${Math.round(temp)}°C`
})
const metricItems = computed(() => [
  { label: '距离', value: formatDistance(props.activity.total_distance_m) },
  { label: '时长', value: formatClockDuration(props.activity.total_timer_time_s) },
  { label: speedLabel.value, value: speedValue.value },
  { label: '卡路里', value: formatCalories(props.activity.total_calories) },
  { label: '训练负荷', value: trainingLoadValue.value },
  { label: '天气', value: weatherText.value },
])

function photoUrl(path) {
  return resolveMediaUrl(path)
}

function formatCardDateTime(value) {
  if (!value) return '--'
  const normalized = typeof value === 'string' ? value.replace(' ', 'T') : value
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return formatDateTime(value)
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()]
  const dateText = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`
  const timeText = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  return `${dateText}（${week}） ${timeText}`
}
</script>

<style scoped>
.activity-thumb { width: 32px; height: 32px; border-radius: 6px; object-fit: cover; }
</style>
