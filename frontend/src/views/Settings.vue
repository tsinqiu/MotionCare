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

    <form v-else class="settings-grid" @submit.prevent="save">
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
      <div class="settings-actions settings-save-card">
        <div>
          <strong>保存偏好</strong>
          <small>同步资料、单位和隐私设置</small>
        </div>
        <button class="primary-link" type="submit" :disabled="saving">{{ saving ? '保存中' : '保存设置' }}</button>
        <span v-if="saved" class="success-copy">设置已保存。</span>
      </div>
    </form>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import StateBlock from '@/components/StateBlock.vue'
import { updateCurrentUserProfile } from '@/services/auth'
import { getSettings, updateSettings } from '@/services/settings'
import { authSession, signOut } from '@/stores/authStore'

const router = useRouter()
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
    Boolean(settings.distanceUnit),
    Boolean(settings.paceUnit),
  ]
  return Math.round((fields.filter(Boolean).length / fields.length) * 100)
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
  load()
})
</script>
