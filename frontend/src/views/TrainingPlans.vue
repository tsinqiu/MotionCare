<template>
  <div class="training-plan-page" :class="{ 'training-plan-page--detail': selectedPlan }">
    <template v-if="selectedPlan">
      <header class="training-detail-hero">
        <span class="training-detail-icon" :style="{ '--plan-color': typeMeta(selectedPlan.type).color }">
          <component :is="typeMeta(selectedPlan.type).icon" :size="32" aria-hidden="true" />
        </span>
        <div>
          <h2>{{ selectedPlan.name }}</h2>
          <p>{{ selectedPlan.goal }}</p>
          <span>{{ selectedDetailWeek.phase }}</span>
        </div>
      </header>

      <nav class="training-detail-weeks" aria-label="训练周次">
        <button
          v-for="week in selectedPlan.weeks"
          :key="week.week"
          type="button"
          :class="{ active: detailActiveWeek === week.week }"
          @click="detailActiveWeek = week.week"
        >
          <Check v-if="detailActiveWeek === week.week" :size="18" aria-hidden="true" />
          W{{ week.week }}
        </button>
      </nav>

      <section class="training-detail-workouts" aria-label="本周训练安排">
        <article v-for="workout in selectedDetailWeek.days" :key="`${selectedDetailWeek.week}-${workout.day}`">
          <span>{{ workout.day }}</span>
          <div>
            <strong>{{ workout.title }}</strong>
            <p>{{ workout.subtitle }}</p>
            <small v-if="workout.note">{{ workout.note }}</small>
          </div>
          <Info v-if="workout.note" :size="19" aria-hidden="true" />
        </article>
      </section>

      <div class="training-detail-actions">
        <button type="button" @click="closePlan">Back</button>
        <button type="button" @click="startPlan(selectedPlan)">
          <Play :size="18" fill="currentColor" aria-hidden="true" />
          开始执行
        </button>
      </div>
    </template>

    <template v-else>
      <section v-if="plans.length === 0" class="training-empty-state">
        <span class="training-empty-icon">
          <CalendarDays :size="76" aria-hidden="true" />
        </span>
        <h2>暂无训练课表</h2>
        <p>选择数据源或创建一个新的训练课表以开始。</p>
      </section>

      <template v-else>
        <section class="training-section-title">
          <span aria-hidden="true"></span>
          <h2>即将开始</h2>
        </section>

        <section class="training-plan-list" aria-label="已安排训练计划">
          <article
            v-for="plan in plans"
            :key="plan.id"
            class="training-plan-card"
            role="button"
            tabindex="0"
            @click="openPlan(plan)"
            @keydown.enter.prevent="openPlan(plan)"
          >
          <div class="training-plan-card__accent" aria-hidden="true"></div>
          <div class="training-plan-card__top">
            <span class="training-type-label" :style="{ '--plan-color': typeMeta(plan.type).color }">
              <component :is="typeMeta(plan.type).icon" :size="26" aria-hidden="true" />
              {{ typeMeta(plan.type).english }}
            </span>
            <span class="training-status-pill">已排期</span>
          </div>

          <div class="training-plan-card__title">
            <h3>{{ plan.name }}</h3>
            <ChevronRight :size="28" aria-hidden="true" />
          </div>

          <div class="training-phase-grid">
            <span v-for="phase in phaseSummary(plan)" :key="phase.label">
              <i :style="{ background: phase.color }" aria-hidden="true"></i>
              <b>{{ phase.label }}</b>
              <small>{{ phase.range }}</small>
            </span>
          </div>

          <div class="training-progress-row">
            <div class="training-progress-track">
              <i :style="{ width: `${plan.progress || 0}%` }" aria-hidden="true"></i>
            </div>
            <b>{{ plan.progress || 0 }}%</b>
          </div>

          <div class="training-plan-card__bottom">
            <span>W{{ plan.currentWeek || 1 }} / {{ plan.weeks.length }}</span>
            <button type="button" @click.stop="startPlan(plan)">
              <Play :size="18" fill="currentColor" aria-hidden="true" />
              开始执行
            </button>
          </div>
          </article>
        </section>
      </template>

      <div class="training-plan-actions">
        <button type="button" class="training-import-btn" @click="showImportSheet = true">
          <FolderOpen :size="22" aria-hidden="true" />
          导入常用计划
        </button>
        <button type="button" class="training-custom-btn" @click="openCustomCreator">
          <Sparkles :size="22" aria-hidden="true" />
          自定义创建计划
        </button>
      </div>
    </template>

    <Teleport to=".phone-frame">
      <div v-if="showImportSheet" class="training-sheet-backdrop" role="presentation" @click.self="showImportSheet = false">
        <section class="training-sheet" role="dialog" aria-modal="true" aria-label="导入常用计划">
          <header>
            <strong>导入常用计划</strong>
            <button type="button" aria-label="关闭" @click="showImportSheet = false">
              <X :size="20" aria-hidden="true" />
            </button>
          </header>
          <div class="training-template-list">
            <button
              v-for="course in trainingPlanTemplates"
              :key="course.id"
              type="button"
              class="training-template-row"
              @click="importTemplate(course)"
            >
              <span :style="{ '--plan-color': course.color }">
                <component :is="course.icon" :size="26" aria-hidden="true" />
              </span>
              <div>
                <strong>{{ course.name }}</strong>
                <small>{{ course.typeLabel }} · {{ course.weeks.length }}周</small>
              </div>
              <Plus :size="22" aria-hidden="true" />
            </button>
          </div>
        </section>
      </div>
    </Teleport>

    <Teleport to=".phone-frame">
      <div v-if="customOpen" class="training-sheet-backdrop" role="presentation" @click.self="closeCustomCreator">
        <section class="training-sheet training-custom-sheet" role="dialog" aria-modal="true" aria-label="自定义创建计划">
          <header>
            <strong>自定义创建计划</strong>
            <button type="button" aria-label="关闭" @click="closeCustomCreator">
              <X :size="20" aria-hidden="true" />
            </button>
          </header>

          <form v-if="customStep === 1" class="training-custom-form" @submit.prevent="goCustomSchedule">
            <label>
              <span>计划名称</span>
              <input v-model.trim="customDraft.name" type="text" placeholder="例如 8周入门跑步" required />
            </label>
            <label>
              <span>运动类别</span>
              <select v-model="customDraft.type">
                <option value="running">跑步</option>
                <option value="cycling">骑行</option>
                <option value="swimming">游泳</option>
              </select>
            </label>
            <label>
              <span>周期时间</span>
              <input v-model.number="customDraft.weekCount" type="number" min="1" max="24" inputmode="numeric" required />
            </label>
            <button class="training-custom-primary" type="submit">下一步</button>
          </form>

          <form v-else class="training-custom-schedule" @submit.prevent="saveCustomPlan">
            <nav class="training-custom-weeks" aria-label="自定义周次">
              <button
                v-for="week in customWeeks"
                :key="week.week"
                type="button"
                :class="{ active: customActiveWeek === week.week }"
                @click="customActiveWeek = week.week"
              >
                W{{ week.week }}
              </button>
            </nav>
            <div class="training-day-editor">
              <label v-for="(day, index) in activeCustomDays" :key="`${customActiveWeek}-${index}`">
                <b>{{ day.day }}</b>
                <input v-model.trim="day.title" type="text" placeholder="名称，例如 轻松跑30分钟" />
                <input v-model.trim="day.subtitle" type="text" placeholder="小字说明，例如 有氧 · RPE 3-4/10" />
              </label>
            </div>
            <div class="training-custom-actions">
              <button type="button" @click="customStep = 1">上一步</button>
              <button type="submit">保存计划</button>
            </div>
          </form>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { showToast } from 'vant'
import {
  Activity,
  Bike,
  CalendarDays,
  Check,
  ChevronRight,
  FolderOpen,
  Info,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Waves,
  X,
} from '@lucide/vue'

import { trainingPlanTemplates } from '@/data/trainingPlanTemplates'

const STORAGE_KEY = 'motioncare-training-plans'
const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const typeMap = {
  running: { label: '跑步', english: 'RUNNING', icon: Activity, color: '#16a34a' },
  cycling: { label: '骑行', english: 'CYCLING', icon: Bike, color: '#f59e0b' },
  swimming: { label: '游泳', english: 'SWIMMING', icon: Waves, color: '#0ea5e9' },
}

const plans = ref(loadPlans())
const selectedPlan = ref(null)
const detailActiveWeek = ref(1)
const showImportSheet = ref(false)
const customOpen = ref(false)
const customStep = ref(1)
const customActiveWeek = ref(1)
const customWeeks = ref([])
const customDraft = reactive({
  name: '',
  type: 'running',
  weekCount: 4,
})

const activeCustomDays = computed(() => (
  customWeeks.value.find((week) => week.week === customActiveWeek.value)?.days || []
))
const selectedDetailWeek = computed(() => (
  selectedPlan.value?.weeks.find((week) => week.week === detailActiveWeek.value) || selectedPlan.value?.weeks[0]
))

function typeMeta(type) {
  return typeMap[type] || typeMap.running
}

function phaseSummary(plan) {
  const seen = []
  plan.weeks.forEach((week) => {
    const raw = week.phase || `第${week.week}周`
    if (!seen.some((item) => item.raw === raw)) {
      const match = raw.match(/^(.+?)\s*\((.+)\)$/)
      seen.push({
        raw,
        label: match?.[1] || raw,
        range: match?.[2] || `W${week.week}`,
      })
    }
  })
  const fallback = [{ label: '训练期', range: `W1-W${plan.weeks.length}` }]
  return (seen.length ? seen : fallback).slice(0, 3).map((item, index) => ({
    ...item,
    color: ['#0ea5e9', '#0ea5e9', '#f59e0b'][index] || '#16a34a',
  }))
}

function loadPlans() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    window.localStorage.removeItem(STORAGE_KEY)
    return []
  }
}

function persistPlans() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(plans.value))
}

function refreshPlans() {
  plans.value = loadPlans()
  if (selectedPlan.value) {
    selectedPlan.value = plans.value.find((plan) => plan.id === selectedPlan.value.id) || null
  }
  showToast('训练计划已刷新')
}

function normalizeWeeks(weeks) {
  return weeks.map((week) => ({
    week: week.week,
    phase: week.phase,
    days: week.days.map((day) => ({
      day: day.day,
      title: day.title,
      subtitle: day.subtitle,
      note: day.note || '',
    })),
  }))
}

function importTemplate(course) {
  const nextPlan = {
    id: `template-${course.id}-${Date.now()}`,
    source: 'template',
    templateId: course.id,
    name: course.name,
    type: course.type,
    typeLabel: course.typeLabel,
    goal: course.goal,
    weeks: normalizeWeeks(course.weeks),
    currentWeek: 1,
    progress: 0,
    status: 'scheduled',
    createdAt: new Date().toISOString(),
  }
  plans.value = [nextPlan, ...plans.value]
  persistPlans()
  showImportSheet.value = false
  showToast('已导入训练计划')
}

function openPlan(plan) {
  selectedPlan.value = plan
  detailActiveWeek.value = plan.currentWeek || 1
}

function closePlan() {
  selectedPlan.value = null
}

function openCustomCreator() {
  customOpen.value = true
  customStep.value = 1
  customActiveWeek.value = 1
}

function closeCustomCreator() {
  customOpen.value = false
}

function goCustomSchedule() {
  const count = Math.min(Math.max(Number(customDraft.weekCount) || 1, 1), 24)
  customDraft.weekCount = count
  customWeeks.value = Array.from({ length: count }, (_, index) => ({
    week: index + 1,
    phase: `自定义期 (W${index + 1})`,
    days: dayLabels.map((day) => ({
      day,
      title: '',
      subtitle: '',
      note: '',
    })),
  }))
  customActiveWeek.value = 1
  customStep.value = 2
}

function saveCustomPlan() {
  const meta = typeMeta(customDraft.type)
  const weeks = customWeeks.value.map((week) => ({
    ...week,
    days: week.days.map((day) => ({
      ...day,
      title: day.title || '休息日',
      subtitle: day.subtitle || '休息日',
      note: '',
    })),
  }))
  plans.value = [{
    id: `custom-${Date.now()}`,
    source: 'custom',
    name: customDraft.name || '自定义训练计划',
    type: customDraft.type,
    typeLabel: meta.label,
    goal: `${customDraft.weekCount}周自定义训练安排`,
    weeks,
    currentWeek: 1,
    progress: 0,
    status: 'scheduled',
    createdAt: new Date().toISOString(),
  }, ...plans.value]
  persistPlans()
  Object.assign(customDraft, { name: '', type: 'running', weekCount: 4 })
  customWeeks.value = []
  customOpen.value = false
  showToast('训练计划已保存')
}

function startPlan(plan) {
  plans.value = plans.value.map((item) => (
    item.id === plan.id ? { ...item, status: 'active', progress: item.progress || 0 } : item
  ))
  if (selectedPlan.value?.id === plan.id) {
    selectedPlan.value = plans.value.find((item) => item.id === plan.id) || selectedPlan.value
  }
  persistPlans()
  showToast('计划已开始')
}

function handleNavAction() {
  refreshPlans()
}

function handleShellBack(event) {
  if (!selectedPlan.value) return
  event.preventDefault()
  closePlan()
}

onMounted(() => {
  window.dispatchEvent(new CustomEvent('motioncare:nav-action', { detail: { icon: RefreshCw, label: '刷新' } }))
  window.addEventListener('motioncare:nav-action-click', handleNavAction)
  window.addEventListener('motioncare:nav-back', handleShellBack)
})

onBeforeUnmount(() => {
  window.dispatchEvent(new CustomEvent('motioncare:nav-action', { detail: null }))
  window.removeEventListener('motioncare:nav-action-click', handleNavAction)
  window.removeEventListener('motioncare:nav-back', handleShellBack)
})
</script>

<style scoped>
.training-plan-page {
  min-height: calc(100dvh - 120px);
  display: flex;
  flex-direction: column;
  padding-bottom: 148px;
}

.training-plan-page--detail {
  display: grid;
  gap: 20px;
  padding-bottom: 96px;
}

.training-empty-state {
  flex: 1;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 18px;
  text-align: center;
}

.training-empty-icon {
  width: 180px;
  height: 180px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: color-mix(in srgb, var(--app-green) 10%, transparent);
  color: color-mix(in srgb, var(--app-green) 78%, #7dd3fc);
}

.training-empty-state h2 {
  margin: 0;
  color: var(--text);
  font-size: 31px;
  font-weight: 950;
}

.training-empty-state p {
  margin: 0;
  color: var(--muted);
  font-size: 18px;
  line-height: 1.5;
}

.training-section-title {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 2px 12px;
}

.training-section-title span {
  width: 5px;
  height: 28px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text) 60%, var(--app-green));
}

.training-section-title h2 {
  margin: 0;
  color: color-mix(in srgb, var(--text) 72%, var(--muted));
  font-size: 22px;
  font-weight: 950;
}

.training-plan-list {
  display: grid;
  gap: 12px;
}

.training-plan-card {
  position: relative;
  overflow: hidden;
  display: grid;
  gap: 12px;
  padding: 18px 20px;
  border: 1px solid color-mix(in srgb, var(--text) 16%, transparent);
  border-radius: 20px;
  background: var(--panel);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
}

.training-plan-card:focus-visible {
  outline: 2px solid var(--app-green);
  outline-offset: 3px;
}

.training-plan-card__accent {
  position: absolute;
  inset: 0 auto 0 0;
  width: 6px;
  background: var(--app-green);
}

.training-plan-card__top,
.training-plan-card__title,
.training-plan-card__bottom,
.training-type-label,
.training-progress-row {
  display: flex;
  align-items: center;
}

.training-plan-card__top,
.training-plan-card__title,
.training-plan-card__bottom,
.training-progress-row {
  justify-content: space-between;
  gap: 14px;
}

.training-type-label {
  gap: 10px;
  color: var(--plan-color);
  font-size: 17px;
  font-weight: 950;
  letter-spacing: 0.08em;
}

.training-status-pill {
  padding: 7px 12px;
  border-radius: 10px;
  background: color-mix(in srgb, #38bdf8 14%, var(--panel));
  color: #0284c7;
  font-size: 16px;
  font-weight: 900;
}

.training-plan-card__title h3 {
  margin: 0;
  color: var(--text);
  font-size: 25px;
  line-height: 1.2;
}

.training-phase-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.training-phase-grid span {
  min-height: 56px;
  display: grid;
  grid-template-columns: 12px minmax(0, 1fr);
  align-content: center;
  align-items: center;
  column-gap: 7px;
  row-gap: 4px;
  padding: 8px 9px;
  border: 1px solid color-mix(in srgb, var(--text) 18%, transparent);
  border-radius: 12px;
}

.training-phase-grid i {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.training-phase-grid b,
.training-phase-grid small {
  color: var(--text);
  font-size: 14px;
  line-height: 1.1;
}

.training-phase-grid small {
  grid-column: 2;
  color: var(--muted);
}

.training-progress-track {
  flex: 1;
  height: 9px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text) 10%, transparent);
}

.training-progress-track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--app-green);
}

.training-progress-row b {
  color: var(--text);
  font-size: 18px;
}

.training-plan-card__bottom span {
  padding: 8px 16px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--app-green) 12%, transparent);
  color: var(--app-green-dark);
  font-size: 18px;
  font-weight: 950;
}

.training-plan-card__bottom button {
  min-height: 50px;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 0 22px;
  border: 0;
  border-radius: 16px;
  background: color-mix(in srgb, var(--app-green) 18%, var(--panel));
  color: var(--text);
  font: inherit;
  font-size: 18px;
  font-weight: 900;
}

.training-detail-hero {
  display: grid;
  grid-template-columns: 74px minmax(0, 1fr);
  align-items: start;
  gap: 16px;
  padding-top: 18px;
}

.training-detail-icon {
  width: 70px;
  height: 70px;
  display: grid;
  place-items: center;
  border-radius: 18px;
  background: color-mix(in srgb, var(--plan-color) 12%, #f8fafc);
  color: var(--plan-color);
}

.training-detail-hero div {
  min-width: 0;
  display: grid;
  gap: 9px;
}

.training-detail-hero h2 {
  margin: 0;
  color: var(--text);
  font-size: 30px;
  font-weight: 950;
  line-height: 1.16;
}

.training-detail-hero p {
  margin: 0;
  color: var(--muted);
  font-size: 17px;
  line-height: 1.45;
}

.training-detail-hero div > span {
  width: fit-content;
  padding: 8px 18px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-green) 15%, var(--panel));
  color: var(--app-green-dark);
  font-size: 16px;
  font-weight: 900;
}

.training-detail-weeks {
  display: flex;
  gap: 12px;
  margin-inline: calc(-1 * var(--space-4));
  padding: 2px var(--space-4) 8px;
  overflow-x: auto;
  scrollbar-width: none;
}

.training-detail-weeks::-webkit-scrollbar {
  width: 0;
  height: 0;
}

.training-detail-weeks button {
  flex: 0 0 116px;
  min-height: 62px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  border: 1px solid color-mix(in srgb, var(--text) 18%, transparent);
  border-radius: 14px;
  background: var(--panel);
  color: var(--text);
  font: inherit;
  font-size: 20px;
  font-weight: 900;
}

.training-detail-weeks button.active {
  border-color: transparent;
  background: color-mix(in srgb, var(--app-green) 16%, var(--panel));
}

.training-detail-workouts {
  display: grid;
  overflow: hidden;
  border-radius: 22px;
  background: var(--panel);
  box-shadow: var(--shadow-sm);
}

.training-detail-workouts article {
  min-height: 112px;
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr) 22px;
  align-items: center;
  gap: 16px;
  padding: 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--text) 8%, transparent);
}

.training-detail-workouts article:last-child {
  border-bottom: 0;
}

.training-detail-workouts article > span {
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

.training-detail-workouts div {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.training-detail-workouts strong {
  color: var(--text);
  font-size: 20px;
  line-height: 1.35;
}

.training-detail-workouts p,
.training-detail-workouts small {
  margin: 0;
  color: var(--muted);
  font-size: 15px;
  line-height: 1.45;
}

.training-detail-workouts svg {
  color: var(--app-green);
}

.training-detail-actions {
  position: fixed;
  left: max(18px, calc((100vw - var(--phone-max)) / 2 + 18px));
  right: max(18px, calc((100vw - var(--phone-max)) / 2 + 18px));
  bottom: calc(16px + var(--safe-bottom));
  z-index: 20;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
}

.training-detail-actions button {
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

.training-detail-actions button:first-child {
  border: 1px solid color-mix(in srgb, var(--text) 34%, transparent);
  background: var(--panel);
  color: var(--text);
}

.training-detail-actions button:last-child {
  border: 1px solid var(--app-green);
  background: var(--app-green);
  color: #fff;
}

.training-plan-actions {
  position: fixed;
  left: max(18px, calc((100vw - var(--phone-max)) / 2 + 18px));
  right: max(18px, calc((100vw - var(--phone-max)) / 2 + 18px));
  bottom: calc(16px + var(--safe-bottom));
  z-index: 20;
  display: grid;
  gap: 14px;
}

.training-plan-actions button {
  min-height: 58px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  border-radius: 18px;
  font: inherit;
  font-size: 18px;
  font-weight: 900;
}

.training-import-btn {
  border: 1px solid color-mix(in srgb, var(--text) 52%, transparent);
  background: var(--panel);
  color: var(--text);
}

.training-custom-btn {
  border: 1px solid var(--app-green);
  background: #12c96b;
  color: #fff;
}

.training-sheet-backdrop {
  position: absolute;
  inset: 0;
  z-index: 90;
  display: flex;
  align-items: flex-end;
  padding: 12px;
  padding-bottom: calc(12px + var(--safe-bottom));
  background: rgb(6 20 14 / 0.34);
}

.training-sheet {
  width: 100%;
  max-height: min(78dvh, 680px);
  display: grid;
  overflow: hidden;
  border-radius: 22px;
  border: 1px solid color-mix(in srgb, var(--text) 14%, transparent);
  background: var(--panel);
  box-shadow: 0 24px 70px rgb(15 23 42 / 0.24);
}

.training-sheet header {
  min-height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--text) 10%, transparent);
}

.training-sheet header strong {
  color: var(--text);
  font-size: 18px;
  font-weight: 950;
}

.training-sheet header button {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text) 6%, transparent);
  color: var(--text);
}

.training-template-list,
.training-custom-form,
.training-custom-schedule {
  overflow-y: auto;
  padding: 14px;
}

.training-template-list {
  display: grid;
  gap: 12px;
}

.training-template-row {
  min-height: 82px;
  display: grid;
  grid-template-columns: 54px minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--text) 14%, transparent);
  border-radius: 18px;
  background: var(--panel);
  color: var(--text);
  text-align: left;
}

.training-template-row > span {
  width: 54px;
  height: 54px;
  display: grid;
  place-items: center;
  border-radius: 15px;
  background: color-mix(in srgb, var(--plan-color) 12%, #f8fafc);
  color: var(--plan-color);
}

.training-template-row div {
  min-width: 0;
  display: grid;
  gap: 5px;
}

.training-template-row strong {
  overflow: hidden;
  color: var(--text);
  font-size: 18px;
  font-weight: 950;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.training-template-row small {
  color: var(--muted);
  font-size: 14px;
}

.training-custom-form {
  display: grid;
  gap: 14px;
}

.training-custom-form label {
  display: grid;
  gap: 7px;
}

.training-custom-form span {
  color: var(--muted);
  font-size: 13px;
  font-weight: 850;
}

.training-custom-form :is(input, select),
.training-day-editor input {
  width: 100%;
  min-width: 0;
  border: 1px solid color-mix(in srgb, var(--app-green) 18%, var(--border));
  border-radius: 14px;
  background: color-mix(in srgb, var(--panel-soft) 65%, var(--panel));
  color: var(--text);
  font: inherit;
  padding: 12px;
}

.training-custom-primary,
.training-custom-actions button:last-child {
  min-height: 50px;
  border: 0;
  border-radius: 14px;
  background: var(--app-green);
  color: #fff;
  font: inherit;
  font-weight: 900;
}

.training-custom-weeks {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 10px;
}

.training-custom-weeks button {
  flex: 0 0 64px;
  min-height: 42px;
  border: 1px solid color-mix(in srgb, var(--text) 16%, transparent);
  border-radius: 12px;
  background: var(--panel);
  color: var(--text);
  font: inherit;
  font-weight: 900;
}

.training-custom-weeks button.active {
  background: color-mix(in srgb, var(--app-green) 16%, var(--panel));
}

.training-day-editor {
  display: grid;
  gap: 10px;
}

.training-day-editor label {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
}

.training-day-editor b {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text) 7%, transparent);
}

.training-day-editor input:last-child {
  grid-column: 2;
}

.training-custom-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 12px;
}

.training-custom-actions button:first-child {
  min-height: 50px;
  border: 1px solid color-mix(in srgb, var(--text) 22%, transparent);
  border-radius: 14px;
  background: var(--panel);
  color: var(--text);
  font: inherit;
  font-weight: 900;
}

@container phone-frame (max-width: 390px) {
  .training-plan-card {
    padding: 16px 14px 16px 18px;
  }

  .training-plan-card__title h3 {
    font-size: 22px;
  }

  .training-phase-grid {
    grid-template-columns: 1fr;
  }

  .training-detail-hero {
    grid-template-columns: 58px minmax(0, 1fr);
    gap: 12px;
  }

  .training-detail-icon {
    width: 56px;
    height: 56px;
    border-radius: 15px;
  }

  .training-detail-hero h2 {
    font-size: 24px;
  }

  .training-detail-workouts article {
    grid-template-columns: 46px minmax(0, 1fr) 20px;
    gap: 12px;
    padding: 15px 12px;
  }

  .training-detail-workouts strong {
    font-size: 18px;
  }
}
</style>
