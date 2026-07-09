<template>
  <div v-if="selectedCourse" class="course-detail-page">
    <header class="course-detail-hero">
      <span class="course-detail-icon" :style="{ '--course-color': selectedCourse.color }">
        <component :is="selectedCourse.icon" :size="32" aria-hidden="true" />
      </span>
      <div class="course-detail-copy">
        <h2>{{ selectedCourse.name }}</h2>
        <p>{{ selectedCourse.goal }}</p>
        <span class="course-phase-chip">{{ selectedWeek.phase }}</span>
      </div>
    </header>

    <nav class="course-week-tabs" aria-label="训练周次">
      <button
        v-for="week in selectedCourse.weeks"
        :key="week.week"
        type="button"
        :class="{ active: activeWeek === week.week }"
        @click="activeWeek = week.week"
      >
        <Check v-if="activeWeek === week.week" :size="18" aria-hidden="true" />
        <span>W{{ week.week }}</span>
      </button>
    </nav>

    <section class="course-workout-list" aria-label="本周训练安排">
      <article v-for="workout in selectedWeek.days" :key="`${selectedWeek.week}-${workout.day}`" class="course-workout-row">
        <span class="course-day-badge">{{ workout.day }}</span>
        <div>
          <strong>{{ workout.title }}</strong>
          <p>{{ workout.subtitle }}</p>
          <small v-if="workout.note">{{ workout.note }}</small>
        </div>
        <Info v-if="workout.note" :size="19" aria-hidden="true" />
      </article>
    </section>

    <div class="course-detail-actions">
      <button type="button" class="course-back-button" @click="closeDetail">Back</button>
      <button type="button" class="course-save-button" @click="savePlan">
        <Check :size="20" aria-hidden="true" />
        <span>保存计划</span>
      </button>
    </div>
  </div>

  <div v-else class="page-stack course-page">
    <div class="course-layout">
      <nav class="course-rail" aria-label="课程分类">
        <button
          v-for="filter in trainingPlanFilters"
          :key="filter.key"
          type="button"
          :class="{ active: activeFilter === filter.key }"
          @click="activeFilter = filter.key"
        >
          <component :is="filter.icon" :size="filter.key === 'all' ? 28 : 32" aria-hidden="true" />
          <span>{{ filter.label }}</span>
        </button>
      </nav>

      <main class="course-content">
        <section class="course-list" aria-label="常用训练计划">
          <button
            v-for="course in filteredTemplates"
            :key="course.id"
            type="button"
            class="course-entry-card"
            @click="openCourse(course)"
          >
            <span class="course-entry-card__icon" :style="{ '--course-color': course.color }">
              <component :is="course.icon" :size="30" aria-hidden="true" />
            </span>
            <span class="course-entry-card__body">
              <strong>{{ course.name }}</strong>
              <small>{{ course.typeLabel }}</small>
            </span>
            <ChevronRight :size="28" aria-hidden="true" />
          </button>
        </section>
      </main>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { showToast } from 'vant'
import { Check, ChevronRight, Info } from '@lucide/vue'
import { trainingPlanFilters, trainingPlanTemplates } from '@/data/trainingPlanTemplates'

const activeFilter = ref('all')
const selectedCourse = ref(null)
const activeWeek = ref(1)

const filteredTemplates = computed(() => {
  if (activeFilter.value === 'all') return trainingPlanTemplates
  return trainingPlanTemplates.filter((course) => course.type === activeFilter.value)
})

const selectedWeek = computed(() => (
  selectedCourse.value?.weeks.find((week) => week.week === activeWeek.value) || selectedCourse.value?.weeks[0]
))

function openCourse(course) {
  selectedCourse.value = course
  activeWeek.value = 1
}

function closeDetail() {
  selectedCourse.value = null
}

function savePlan() {
  showToast('计划已保存')
}

function handleShellBack(event) {
  if (!selectedCourse.value) return
  event.preventDefault()
  closeDetail()
}

onMounted(() => {
  window.addEventListener('motioncare:nav-back', handleShellBack)
})

onBeforeUnmount(() => {
  window.removeEventListener('motioncare:nav-back', handleShellBack)
})
</script>

<style scoped>
.course-page {
  min-height: calc(100dvh - 96px);
  gap: 0;
}

.course-layout {
  width: calc(100% + (2 * var(--space-4)));
  max-width: none !important;
  min-height: calc(100dvh - 96px);
  display: grid;
  grid-template-columns: 86px minmax(0, 1fr);
  align-items: stretch;
  margin: 16px calc(-1 * var(--space-4)) calc(-1 * var(--space-4));
}

.course-rail {
  position: sticky;
  top: 0;
  min-height: calc(100dvh - 52px);
  align-self: start;
  display: grid;
  align-content: start;
  overflow: hidden;
  background: color-mix(in srgb, var(--panel-soft) 72%, #f8fafc);
  border-right: 1px solid color-mix(in srgb, var(--text) 16%, transparent);
}

.course-rail button {
  min-height: 98px;
  display: grid;
  place-items: center;
  gap: 8px;
  border: 0;
  border-left: 5px solid transparent;
  background: transparent;
  color: color-mix(in srgb, var(--muted) 88%, #111827);
  font: inherit;
  font-size: 15px;
  font-weight: 900;
}

.course-rail button.active {
  border-left-color: var(--app-green);
  background: color-mix(in srgb, var(--app-green) 12%, var(--panel));
  color: var(--app-green-dark);
}

.course-content {
  min-width: 0;
  padding: 32px 6px 28px 18px;
  background: color-mix(in srgb, var(--panel-soft) 55%, var(--bg));
}

.course-list {
  display: grid;
  gap: 18px;
}

.course-entry-card {
  width: 100%;
  min-height: 92px;
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr) 24px;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border: 2px solid color-mix(in srgb, var(--text) 18%, transparent);
  border-radius: 22px;
  background: color-mix(in srgb, var(--panel) 96%, #f8fafc);
  color: var(--text);
  box-shadow: none;
  text-align: left;
}

.course-entry-card:active {
  transform: translateY(1px);
}

.course-entry-card__icon,
.course-detail-icon {
  width: 58px;
  height: 58px;
  display: grid;
  place-items: center;
  border-radius: 16px;
  background: color-mix(in srgb, var(--course-color) 12%, #f8fafc);
  color: var(--course-color);
}

.course-entry-card__body {
  min-width: 0;
  display: grid;
  gap: 8px;
}

.course-entry-card strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  writing-mode: horizontal-tb;
  color: var(--text);
  font-size: 20px;
  font-weight: 950;
  line-height: 1.2;
}

.course-entry-card small {
  color: var(--muted);
  font-size: 15px;
  font-weight: 700;
  white-space: nowrap;
}

.course-detail-page {
  display: grid;
  gap: 22px;
  padding-bottom: 96px;
}

.course-detail-hero {
  display: grid;
  grid-template-columns: 74px minmax(0, 1fr);
  align-items: start;
  gap: 16px;
  padding: 20px 0 6px;
}

.course-detail-copy {
  min-width: 0;
  display: grid;
  gap: 10px;
}

.course-detail-hero h2 {
  margin: 0;
  color: var(--text);
  font-size: 30px;
  font-weight: 950;
  line-height: 1.15;
}

.course-detail-hero p {
  margin: 0;
  color: var(--muted);
  font-size: 18px;
  line-height: 1.5;
}

.course-phase-chip {
  width: fit-content;
  padding: 8px 18px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-green) 15%, var(--panel));
  color: var(--app-green-dark);
  font-size: 17px;
  font-weight: 900;
}

.course-week-tabs {
  display: flex;
  gap: 12px;
  margin-inline: calc(-1 * var(--space-4));
  padding: 4px var(--space-4) 8px;
  overflow-x: auto;
  scrollbar-width: none;
}

.course-week-tabs::-webkit-scrollbar {
  width: 0;
  height: 0;
}

.course-week-tabs button {
  flex: 0 0 116px;
  min-height: 64px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border: 1px solid color-mix(in srgb, var(--text) 18%, transparent);
  border-radius: 14px;
  background: var(--panel);
  color: var(--text);
  font: inherit;
  font-size: 20px;
  font-weight: 900;
}

.course-week-tabs button.active {
  border-color: transparent;
  background: color-mix(in srgb, var(--app-green) 16%, var(--panel));
  color: var(--text);
}

.course-workout-list {
  display: grid;
  border-radius: 22px;
  overflow: hidden;
  background: var(--panel);
  box-shadow: var(--shadow-sm);
}

.course-workout-row {
  min-height: 118px;
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr) 24px;
  align-items: center;
  gap: 18px;
  padding: 18px;
  border-bottom: 1px solid color-mix(in srgb, var(--text) 8%, transparent);
}

.course-workout-row:last-child {
  border-bottom: 0;
}

.course-day-badge {
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text) 7%, transparent);
  color: var(--text);
  font-size: 18px;
  font-weight: 950;
}

.course-workout-row div {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.course-workout-row strong {
  color: var(--text);
  font-size: 21px;
  line-height: 1.35;
}

.course-workout-row p,
.course-workout-row small {
  margin: 0;
  color: var(--muted);
  font-size: 16px;
  line-height: 1.45;
}

.course-workout-row > svg {
  color: var(--app-green);
}

.course-detail-actions {
  position: fixed;
  left: max(18px, calc((100vw - var(--phone-max)) / 2 + 18px));
  right: max(18px, calc((100vw - var(--phone-max)) / 2 + 18px));
  bottom: calc(16px + var(--safe-bottom));
  z-index: 10;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
}

.course-back-button,
.course-save-button {
  min-height: 58px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border-radius: 999px;
  font: inherit;
  font-size: 18px;
  font-weight: 900;
}

.course-back-button {
  border: 1px solid color-mix(in srgb, var(--text) 34%, transparent);
  background: var(--panel);
  color: var(--text);
}

.course-save-button {
  border: 1px solid var(--app-green);
  background: var(--app-green);
  color: #fff;
  box-shadow: 0 12px 28px rgb(22 163 74 / 0.22);
}

@container phone-frame (max-width: 390px) {
  .course-layout {
    grid-template-columns: 76px minmax(0, 1fr);
  }

  .course-rail button {
    min-height: 90px;
    font-size: 14px;
  }

  .course-content {
    padding: 28px 6px 24px 14px;
  }

  .course-list {
    gap: 16px;
  }

  .course-entry-card {
    min-height: 82px;
    grid-template-columns: 48px minmax(0, 1fr) 22px;
    gap: 12px;
    padding: 12px 12px;
    border-radius: 20px;
  }

  .course-entry-card__icon,
  .course-detail-icon {
    width: 48px;
    height: 48px;
    border-radius: 14px;
  }

  .course-entry-card strong {
    font-size: 17px;
  }

  .course-entry-card small {
    font-size: 13px;
  }

  .course-detail-hero h2 {
    font-size: 24px;
  }

  .course-workout-row {
    grid-template-columns: 48px minmax(0, 1fr) 20px;
    gap: 12px;
    padding: 16px 14px;
  }

  .course-workout-row strong {
    font-size: 18px;
  }

  .course-workout-row p,
  .course-workout-row small {
    font-size: 15px;
  }
}
</style>
