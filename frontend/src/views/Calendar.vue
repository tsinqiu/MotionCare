<template>
  <div class="page-stack">
    <section class="dark-panel">
      <div class="section-heading">
        <div>
          <h2>运动日历</h2>
        </div>
        <RouterLink class="primary-link" to="/record">
          <CirclePlus :size="17" />
          记录运动
        </RouterLink>
      </div>
      <div class="date-stepper">
        <button type="button" @click="stepMonth(-1)">‹</button>
        <strong>{{ monthLabel }}</strong>
        <button type="button" @click="stepMonth(1)">›</button>
      </div>
    </section>

    <StateBlock v-if="loading" title="正在加载日历" message="正在读取本月运动记录。" />
    <StateBlock v-else-if="error" title="日历加载失败" :message="error" action-label="重试" tone="danger" @action="load" />

    <template v-else>
      <section class="calendar-grid-panel">
        <div class="calendar-week">
          <span v-for="day in weekDays" :key="day">{{ day }}</span>
        </div>
        <div class="calendar-grid">
          <span v-for="blank in leadingBlanks" :key="`blank-${blank}`" class="calendar-blank"></span>
          <button
            v-for="day in calendar.days || []"
            :key="day.date"
            type="button"
            class="calendar-day"
            :class="{ active: selectedDate === day.date }"
            @click="selectedDate = day.date"
          >
            <b>{{ Number(day.date.slice(-2)) }}</b>
            <span class="day-icons">
              <i v-for="type in day.activityTypes" :key="type" :class="iconClass(type)"></i>
            </span>
          </button>
        </div>
      </section>

      <section class="dark-panel">
        <div class="section-heading">
          <div>
            <h2>{{ selectedDate || monthLabel }}</h2>
          </div>
        </div>
        <StateBlock
          v-if="selectedActivities.length === 0"
          title="当天暂无运动"
          message="这一天还没有运动记录，可以同步或手工补充。"
          action-label="记录运动"
          @action="router.push('/record')"
        />
        <div v-else class="activity-card-grid">
          <ActivityCard
            v-for="activity in selectedActivities"
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
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { CirclePlus } from '@lucide/vue'

import ActivityCard from '@/components/ActivityCard.vue'
import StateBlock from '@/components/StateBlock.vue'
import { getCalendarStats } from '@/services/stats'

const router = useRouter()
const weekDays = ['日', '一', '二', '三', '四', '五', '六']
const today = new Date()
const month = ref(formatMonthKey(today))
const calendar = ref({ days: [] })
const selectedDate = ref(`${formatMonthKey(today)}-${String(today.getDate()).padStart(2, '0')}`)
const error = ref('')
const loading = ref(false)

const monthLabel = computed(() => `${month.value.slice(0, 4)}年${Number(month.value.slice(5, 7))}月`)
const leadingBlanks = computed(() => new Date(`${month.value}-01T00:00:00`).getDay())
const selectedActivities = computed(() =>
  (calendar.value.days || []).find((day) => day.date === selectedDate.value)?.activities || [],
)

function iconClass(type) {
  if (String(type).includes('cycling')) return 'ride'
  if (String(type).includes('swim')) return 'swim'
  if (String(type).includes('strength')) return 'strength'
  return 'run'
}

function stepMonth(offset) {
  const date = new Date(`${month.value}-01T00:00:00`)
  date.setMonth(date.getMonth() + offset)
  month.value = formatMonthKey(date)
  selectedDate.value = `${month.value}-01`
}

function formatMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    calendar.value = await getCalendarStats({ month: month.value })
  } catch (err) {
    error.value = err instanceof Error ? err.message : '日历加载失败'
  } finally {
    loading.value = false
  }
}

watch(month, load, { immediate: true })
</script>
