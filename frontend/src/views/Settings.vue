<template>
  <div class="page-stack">
    <section class="settings-rq-panel">
      <div class="section-heading">
        <div>
          <p class="overline">设置偏好</p>
          <h2>跑者偏好</h2>
        </div>
        <span class="status-chip good">隐私优先</span>
      </div>
      <p class="muted-copy">MotionCare 只展示必要的账号和运动信息，不会在页面中显示密码、密钥或完整轨迹文件。</p>
      <div class="settings-preference-grid">
        <span>
          <small>资料完整度</small>
          <b>{{ profileCompletion }}%</b>
        </span>
        <span>
          <small>训练单位</small>
          <b>{{ unitSummary }}</b>
        </span>
        <span>
          <small>隐私策略</small>
          <b>{{ privacySummary }}</b>
        </span>
      </div>
    </section>

    <section class="dark-panel">
      <div class="section-heading">
        <div>
          <h2>账号信息</h2>
        </div>
        <span class="status-chip good">{{ roleLabel }}</span>
      </div>
      <div class="account-summary">
        <div class="account-avatar">{{ initials }}</div>
        <div class="account-summary__body">
          <strong>{{ authSession.user?.username || '已登录用户' }}</strong>
          <span>{{ authSession.user?.email || '未提供邮箱' }}</span>
          <small>{{ accountStatusLabel }}</small>
        </div>
        <button class="secondary-link" type="button" @click="handleLogout">退出登录</button>
      </div>
    </section>

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

    <form v-else class="settings-profile-form" @submit.prevent="save">
      <section class="profile-setting-section">
        <h2>个人信息</h2>
        <div class="profile-setting-card">
          <label>
            <span>性别</span>
            <select v-model="athleteProfile.gender">
              <option value="">保密</option>
              <option value="male">男</option>
              <option value="female">女</option>
              <option value="other">其他</option>
            </select>
          </label>
          <label>
            <span>出生日期</span>
            <input v-model="athleteProfile.birthDate" type="date" />
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
            <select v-model="athleteProfile.weekStartsOn">
              <option value="">-</option>
              <option value="monday">周一</option>
              <option value="sunday">周日</option>
            </select>
          </label>
          <label>
            <span>运动水平</span>
            <select v-model="athleteProfile.activityLevel">
              <option value="">-</option>
              <option value="beginner">入门</option>
              <option value="regular">规律训练</option>
              <option value="advanced">进阶</option>
              <option value="competitive">竞赛</option>
            </select>
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

      <section class="profile-setting-section">
        <h2>账号偏好</h2>
        <div class="settings-grid profile-unit-grid">
          <label class="settings-wide profile-bio-field">
            <span>个人介绍</span>
            <textarea v-model.trim="profile.bio" maxlength="50" placeholder="用一句话介绍你的运动偏好，最多 50 字" />
            <small>{{ profile.bio.length }}/50</small>
          </label>
          <label>
            <span>距离单位</span>
            <select v-model="settings.distanceUnit">
              <option value="km">公里</option>
              <option value="mi">英里</option>
            </select>
          </label>
          <label>
            <span>体重单位</span>
            <select v-model="settings.weightUnit">
              <option value="kg">kg</option>
              <option value="lb">lb</option>
            </select>
          </label>
          <label>
            <span>温度单位</span>
            <select v-model="settings.temperatureUnit">
              <option value="c">℃</option>
              <option value="f">℉</option>
            </select>
          </label>
          <label>
            <span>配速显示</span>
            <select v-model="settings.paceUnit">
              <option value="min_per_km">分/公里</option>
              <option value="min_per_mile">分/英里</option>
            </select>
          </label>
          <label>
            <span>默认隐私</span>
            <select v-model="settings.defaultPrivacy">
              <option value="private">私密</option>
              <option value="followers">关注者</option>
              <option value="public">公开</option>
            </select>
          </label>
          <label class="toggle-row">
            <span>隐藏地图起终点</span>
            <input v-model="settings.hideMapEndpoints" type="checkbox" />
          </label>
          <label class="toggle-row">
            <span>同步健康数据</span>
            <input v-model="settings.healthSync" type="checkbox" />
          </label>
        </div>
      </section>

      <div class="settings-actions settings-save-card">
        <div>
          <strong>保存偏好</strong>
          <small>保存个人画像、单位和隐私设置</small>
        </div>
        <button class="primary-link" type="submit" :disabled="saving">{{ saving ? '保存中' : '保存设置' }}</button>
        <span v-if="saved" class="success-copy">设置已保存。</span>
      </div>
    </form>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import StateBlock from '@/components/StateBlock.vue'
import { updateCurrentUserProfile } from '@/services/auth'
import { getSettings, updateSettings } from '@/services/settings'
import { authSession, signOut } from '@/stores/authStore'

const router = useRouter()
const route = useRoute()
const ATHLETE_PROFILE_STORAGE_KEY = 'motioncare-athlete-profile'
const settings = reactive({
  distanceUnit: 'km',
  weightUnit: 'kg',
  temperatureUnit: 'c',
  paceUnit: 'min_per_km',
  defaultPrivacy: 'private',
  hideMapEndpoints: true,
  healthSync: false,
})
const profile = reactive({
  bio: '',
})
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
const roleLabel = computed(() => authSession.user?.role === 'admin' ? '管理员' : '普通用户')
const accountStatusLabel = computed(() => (
  authSession.user?.status === 'disabled' ? '账号状态：已停用' : '账号状态：正常'
))
const initials = computed(() => String(authSession.user?.username || 'GS').slice(0, 2).toUpperCase())
const profileCompletion = computed(() => {
  const fields = [
    Boolean(authSession.user?.username),
    Boolean(authSession.user?.email),
    Boolean(profile.bio),
    Boolean(athleteProfile.heightCm),
    Boolean(athleteProfile.weightKg),
    Boolean(athleteProfile.activityLevel),
    Boolean(athleteProfile.restingHeartRate),
    Boolean(settings.distanceUnit),
  ]
  return Math.round((fields.filter(Boolean).length / fields.length) * 100)
})
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
const unitSummary = computed(() => {
  const distance = settings.distanceUnit === 'mi' ? '英里' : '公里'
  const pace = settings.paceUnit === 'min_per_mile' ? '英里配速' : '公里配速'
  return `${distance} / ${pace}`
})
const privacySummary = computed(() => {
  if (settings.defaultPrivacy === 'public') return '公开可见'
  if (settings.defaultPrivacy === 'followers') return '关注者可见'
  return '仅自己可见'
})

function syncProfile() {
  profile.bio = authSession.user?.bio || ''
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

async function load() {
  loading.value = true
  error.value = ''
  saved.value = false
  try {
    Object.assign(settings, await getSettings())
  } catch (err) {
    error.value = err instanceof Error ? err.message : '设置加载失败'
  } finally {
    loading.value = false
    scrollToRouteSection()
  }
}

async function save() {
  saving.value = true
  error.value = ''
  saved.value = false
  try {
    const [nextSettings, nextUser] = await Promise.all([
      updateSettings(settings),
      updateCurrentUserProfile({ bio: profile.bio }),
    ])
    saveAthleteProfile()
    Object.assign(settings, nextSettings)
    if (nextUser) {
      authSession.user = nextUser
      syncProfile()
    }
    saved.value = true
  } catch (err) {
    error.value = err instanceof Error ? err.message : '设置保存失败'
  } finally {
    saving.value = false
  }
}

function handleLogout() {
  signOut()
  router.push({ name: 'login' })
}

onMounted(() => {
  syncProfile()
  loadAthleteProfile()
  load()
})
</script>

<style scoped>
.settings-profile-form {
  display: grid;
  gap: 18px;
}

.profile-setting-section {
  display: grid;
  gap: 10px;
  scroll-margin-top: 88px;
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

.profile-setting-card input[readonly] {
  color: var(--muted);
}

.profile-setting-card b {
  color: var(--muted);
  font-size: 13px;
  font-weight: 800;
}

.profile-unit-grid {
  margin: 0;
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
