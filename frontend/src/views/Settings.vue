<template>
  <div class="page-stack">
    <StateBlock
      v-if="loading"
      title="正在加载设置"
      message="正在读取个人设置。"
    />
    <StateBlock
      v-else-if="error"
      title="设置加载失败"
      :message="error"
      action-label="重试"
      tone="danger"
      @action="load"
    />

    <form
      v-else
      class="settings-profile-form"
      :class="{ 'settings-profile-form--body-entry': isBodyEntry }"
      @submit.prevent="save"
    >
      <section class="profile-setting-section">
        <h2>个人信息</h2>
        <div class="profile-setting-card">
          <label>
            <span>性别</span>
            <button class="profile-select-button" type="button" @click="openSelect('gender')">
              <span>{{ selectedOptionLabel('gender') }}</span>
              <ChevronDown :size="18" aria-hidden="true" />
            </button>
          </label>
          <label>
            <span>出生日期</span>
            <div class="profile-date-control">
              <span :class="{ muted: !athleteProfile.birthDate }">{{ birthDateText }}</span>
              <CalendarDays :size="18" aria-hidden="true" />
              <input v-model="athleteProfile.birthDate" type="date" aria-label="出生日期" />
            </div>
          </label>
          <label>
            <span>年龄</span>
            <input :value="ageText" type="text" readonly />
          </label>
        </div>
      </section>

      <section ref="bodyProfileRef" class="profile-setting-section">
        <h2>身体数据</h2>
        <div class="profile-setting-card">
          <label>
            <span>身高</span>
            <input v-model.number="athleteProfile.heightCm" type="number" min="80" max="240" inputmode="decimal" placeholder="-" />
            <b>cm</b>
          </label>
          <label>
            <span>体重</span>
            <input v-model.number="athleteProfile.weightKg" type="number" min="20" max="250" inputmode="decimal" placeholder="-" />
            <b>kg</b>
          </label>
        </div>
      </section>

      <section class="profile-setting-section">
        <h2>偏好设置</h2>
        <div class="profile-setting-card">
          <label>
            <span>每周起始日</span>
            <button class="profile-select-button" type="button" @click="openSelect('weekStartsOn')">
              <span>{{ selectedOptionLabel('weekStartsOn') }}</span>
              <ChevronDown :size="18" aria-hidden="true" />
            </button>
          </label>
          <label>
            <span>运动水平</span>
            <button class="profile-select-button" type="button" @click="openSelect('activityLevel')">
              <span>{{ selectedOptionLabel('activityLevel') }}</span>
              <ChevronDown :size="18" aria-hidden="true" />
            </button>
          </label>
        </div>
      </section>

      <section class="profile-setting-section">
        <h2>生理指标</h2>
        <div class="profile-setting-card">
          <label>
            <span>静息心率</span>
            <input v-model.number="athleteProfile.restingHeartRate" type="number" min="30" max="120" inputmode="numeric" placeholder="-" />
            <b>bpm</b>
          </label>
          <label>
            <span>最大心率</span>
            <input v-model.number="athleteProfile.maxHeartRate" type="number" min="80" max="230" inputmode="numeric" placeholder="-" />
            <b>bpm</b>
          </label>
        </div>
      </section>

      <section class="profile-setting-section">
        <h2>性能阈值</h2>
        <div class="profile-setting-card">
          <label>
            <span>阈值配速 (LTP)</span>
            <input v-model.trim="athleteProfile.thresholdPace" type="text" placeholder="-" />
            <b>/km</b>
          </label>
          <label>
            <span>阈值功率 (FTP)</span>
            <input v-model.number="athleteProfile.thresholdPower" type="number" min="0" inputmode="numeric" placeholder="-" />
            <b>W</b>
          </label>
        </div>
      </section>

      <section class="profile-setting-section">
        <h2>体能水平</h2>
        <div class="profile-setting-card">
          <label>
            <span>最大摄氧量 (跑步)</span>
            <input v-model.number="athleteProfile.vo2maxRun" type="number" min="10" max="90" inputmode="decimal" placeholder="-" />
            <b>ml/kg/min</b>
          </label>
          <label>
            <span>最大摄氧量 (骑行)</span>
            <input v-model.number="athleteProfile.vo2maxRide" type="number" min="10" max="90" inputmode="decimal" placeholder="-" />
            <b>ml/kg/min</b>
          </label>
        </div>
      </section>

      <div class="settings-actions settings-save-card">
        <div>
          <strong>保存偏好</strong>
        </div>
        <button class="primary-link" type="submit" :disabled="saving">{{ saving ? '保存中' : '保存设置' }}</button>
        <span v-if="saved" class="success-copy">设置已保存。</span>
      </div>
    </form>

    <Teleport to=".phone-frame">
      <div
        v-if="activeSelectKey"
        class="settings-select-backdrop"
        role="presentation"
        @click.self="closeSelect"
      >
        <section class="settings-select-sheet" role="dialog" aria-modal="true" :aria-label="activeSelectTitle">
          <header>
            <strong>{{ activeSelectTitle }}</strong>
            <button type="button" aria-label="关闭" @click="closeSelect">
              <X :size="20" aria-hidden="true" />
            </button>
          </header>
          <div class="settings-select-options">
            <button
              v-for="option in activeSelectOptions"
              :key="option.value"
              type="button"
              :class="{ active: option.value === athleteProfile[activeSelectKey] }"
              @click="chooseOption(option.value)"
            >
              <span>{{ option.label }}</span>
              <Check v-if="option.value === athleteProfile[activeSelectKey]" :size="20" aria-hidden="true" />
            </button>
          </div>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { CalendarDays, Check, ChevronDown, X } from '@lucide/vue'

import StateBlock from '@/components/StateBlock.vue'

const route = useRoute()
const ATHLETE_PROFILE_STORAGE_KEY = 'motioncare-athlete-profile'
const athleteProfile = reactive({
  gender: '',
  birthDate: '',
  heightCm: '',
  weightKg: '',
  weekStartsOn: '',
  activityLevel: '',
  restingHeartRate: '',
  maxHeartRate: '',
  thresholdPace: '',
  thresholdPower: '',
  vo2maxRun: '',
  vo2maxRide: '',
})
const bodyProfileRef = ref(null)
const error = ref('')
const loading = ref(false)
const saving = ref(false)
const saved = ref(false)
const activeSelectKey = ref('')
const selectGroups = {
  gender: {
    title: '选择性别',
    options: [
      { value: '', label: '保密' },
      { value: 'male', label: '男' },
      { value: 'female', label: '女' },
      { value: 'other', label: '其他' },
    ],
  },
  weekStartsOn: {
    title: '每周起始日',
    options: [
      { value: '', label: '-' },
      { value: 'monday', label: '周一' },
      { value: 'sunday', label: '周日' },
    ],
  },
  activityLevel: {
    title: '运动水平',
    options: [
      { value: '', label: '-' },
      { value: 'beginner', label: '入门' },
      { value: 'regular', label: '规律训练' },
      { value: 'advanced', label: '进阶' },
      { value: 'competitive', label: '竞赛' },
    ],
  },
}
const isBodyEntry = computed(() => route.query.section === 'body')
const activeSelectTitle = computed(() => selectGroups[activeSelectKey.value]?.title || '')
const activeSelectOptions = computed(() => selectGroups[activeSelectKey.value]?.options || [])
const ageText = computed(() => {
  if (!athleteProfile.birthDate) return '-'
  const birth = new Date(athleteProfile.birthDate)
  if (Number.isNaN(birth.getTime())) return '-'
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const beforeBirthday = today.getMonth() < birth.getMonth()
    || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
  if (beforeBirthday) age -= 1
  return age > 0 ? `${age}` : '-'
})
const birthDateText = computed(() => athleteProfile.birthDate || '选择日期')

function selectedOptionLabel(key) {
  const group = selectGroups[key]
  return group?.options.find((option) => option.value === athleteProfile[key])?.label || '-'
}

function openSelect(key) {
  activeSelectKey.value = key
}

function closeSelect() {
  activeSelectKey.value = ''
}

function chooseOption(value) {
  if (!activeSelectKey.value) return
  athleteProfile[activeSelectKey.value] = value
  closeSelect()
}

function syncNavTitle() {
  const title = isBodyEntry.value ? '身体数据' : ''
  window.dispatchEvent(new CustomEvent('motioncare:nav-title', { detail: { title } }))
}

function loadAthleteProfile() {
  try {
    const raw = window.localStorage.getItem(ATHLETE_PROFILE_STORAGE_KEY)
    if (!raw) return
    const data = JSON.parse(raw)
    Object.keys(athleteProfile).forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(data, key)) athleteProfile[key] = data[key] ?? ''
    })
  } catch {
    window.localStorage.removeItem(ATHLETE_PROFILE_STORAGE_KEY)
  }
}

function saveAthleteProfile() {
  window.localStorage.setItem(ATHLETE_PROFILE_STORAGE_KEY, JSON.stringify({ ...athleteProfile }))
}

function scrollToRouteSection() {
  if (route.query.section === 'body') {
    nextTick(() => bodyProfileRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
}

function load() {
  loading.value = true
  error.value = ''
  saved.value = false
  try {
    loadAthleteProfile()
  } catch (err) {
    error.value = err instanceof Error ? err.message : '设置加载失败'
  } finally {
    loading.value = false
    scrollToRouteSection()
  }
}

function save() {
  saving.value = true
  error.value = ''
  saved.value = false
  try {
    saveAthleteProfile()
    saved.value = true
  } catch (err) {
    error.value = err instanceof Error ? err.message : '设置保存失败'
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  syncNavTitle()
  load()
})

watch(() => route.query.section, () => {
  syncNavTitle()
})

watch(activeSelectKey, (key) => {
  document.body.style.overflow = key ? 'hidden' : ''
})

onBeforeUnmount(() => {
  window.dispatchEvent(new CustomEvent('motioncare:nav-title', { detail: { title: '' } }))
  document.body.style.overflow = ''
})
</script>

<style scoped>
.settings-profile-form {
  display: grid;
  gap: 18px;
}

.settings-profile-form--body-entry {
  padding-top: 18px;
}

.profile-setting-section {
  display: grid;
  gap: 10px;
  scroll-margin-top: 112px;
}

.profile-setting-section h2 {
  margin: 0;
  padding: 0 2px;
  color: var(--muted);
  font-size: 15px;
  font-weight: 900;
  line-height: 1.2;
}

.profile-setting-card {
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--app-green) 12%, var(--border));
  border-radius: var(--radius-lg);
  background: var(--panel);
  box-shadow: var(--shadow-sm);
}

.profile-setting-card label {
  min-height: 64px;
  display: grid;
  grid-template-columns: minmax(110px, 1fr) minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  color: var(--text);
}

.profile-setting-card label + label {
  border-top: 1px solid color-mix(in srgb, var(--text) 12%, transparent);
}

.profile-setting-card span {
  font-size: 16px;
  font-weight: 850;
}

.profile-setting-card :is(input, select) {
  min-width: 0;
  width: 100%;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-weight: 800;
  text-align: right;
}

.profile-select-button,
.profile-date-control {
  position: relative;
  min-width: 0;
  width: 100%;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-weight: 850;
  text-align: right;
}

.profile-select-button {
  padding: 0;
  cursor: pointer;
}

.profile-select-button:focus-visible,
.profile-date-control:focus-within {
  border-color: color-mix(in srgb, var(--app-green) 60%, transparent);
  background: color-mix(in srgb, var(--app-green) 8%, transparent);
  outline: none;
}

.profile-date-control {
  overflow: hidden;
  padding: 0;
}

.profile-date-control > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-date-control .muted {
  color: var(--muted);
}

.profile-date-control input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.profile-setting-card input[readonly] {
  color: var(--muted);
}

.profile-setting-card b {
  color: var(--muted);
  font-size: 13px;
  font-weight: 800;
}

.settings-select-backdrop {
  position: absolute;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: flex-end;
  padding: 14px;
  padding-bottom: calc(14px + var(--safe-bottom));
  background: rgb(6 20 14 / 0.34);
}

.settings-select-sheet {
  width: 100%;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--app-green) 18%, var(--border));
  border-radius: 18px;
  background: var(--panel);
  box-shadow: 0 24px 70px rgb(15 23 42 / 0.24);
}

.settings-select-sheet header {
  min-height: 58px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--text) 10%, transparent);
}

.settings-select-sheet header strong {
  color: var(--text);
  font-size: 17px;
  font-weight: 900;
}

.settings-select-sheet header button {
  width: 38px;
  height: 38px;
  display: inline-grid;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--text) 10%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-green) 6%, transparent);
  color: var(--text);
}

.settings-select-options {
  display: grid;
  padding: 8px;
}

.settings-select-options button {
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 16px;
  font-weight: 800;
  text-align: left;
}

.settings-select-options button.active {
  background: color-mix(in srgb, var(--app-green) 13%, transparent);
  color: var(--app-green-dark);
}

@container phone-frame (max-width: 390px) {
  .profile-setting-card label {
    grid-template-columns: minmax(96px, 1fr) minmax(0, 1fr) auto;
    min-height: 60px;
    padding-inline: 14px;
  }

  .profile-setting-card span {
    font-size: 15px;
  }
}
</style>
