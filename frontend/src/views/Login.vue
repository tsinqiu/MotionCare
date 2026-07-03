<template>
  <main class="auth-page">
    <section class="auth-card">
      <div class="auth-topline">
        <RouterLink class="auth-brand" to="/login">
          <span class="brand-mark">MC</span>
          <span>
            <strong>MotionCare</strong>
          </span>
        </RouterLink>
        <button class="theme-toggle auth-theme-toggle" type="button" @click="toggleTheme">
          <component :is="isNightTheme ? Sun : Moon" :size="16" />
          {{ isNightTheme ? '日间' : '夜晚' }}
        </button>
      </div>

      <div class="auth-heading">
        <p class="overline">跑者工作台</p>
        <h1>登录 MotionCare</h1>
        <p>跑力、恢复与训练负荷汇总成今天的训练判断。</p>
      </div>

      <ServerHealthBadge />

      <a class="android-download-link" href="/downloads/motioncare-release.apk" download>
        <span>
          <small>移动应用</small>
          <strong>下载安卓应用</strong>
        </span>
        <Download :size="18" />
      </a>

      <section class="auth-rq-panel">
        <div class="auth-rq-panel__score">
          <span>今日跑力</span>
          <strong>68</strong>
        </div>
        <div class="score-band" style="--score-position: 68%">
          <span class="score-band__segment score-band__segment--base">基础</span>
          <span class="score-band__segment score-band__segment--steady">稳定</span>
          <span class="score-band__segment score-band__segment--strong">强化</span>
          <span class="score-band__segment score-band__segment--peak">冲刺</span>
          <i class="score-band__marker" />
        </div>
        <div class="auth-runner-grid">
          <span>
            <small>恢复</small>
            <b>良好</b>
          </span>
          <span>
            <small>训练负荷</small>
            <b>适中</b>
          </span>
          <span>
            <small>今日建议</small>
            <b>轻松跑</b>
          </span>
        </div>
      </section>

      <form class="auth-form" @submit.prevent="submit">
        <label>
          <span>邮箱</span>
          <div class="input-with-icon">
            <Mail :size="18" />
            <input v-model.trim="form.email" type="email" autocomplete="email" placeholder="name@example.com" required />
          </div>
        </label>

        <label>
          <span>密码</span>
          <div class="input-with-icon">
            <LockKeyhole :size="18" />
            <input
              v-model="form.password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              placeholder="请输入密码"
              required
            />
            <button class="icon-button subtle" type="button" :aria-label="showPassword ? '隐藏密码' : '显示密码'" @click="showPassword = !showPassword">
              <EyeOff v-if="showPassword" :size="17" />
              <Eye v-else :size="17" />
            </button>
          </div>
        </label>

        <p v-if="localError || authSession.error" class="form-error">{{ localError || authSession.error }}</p>

        <button class="auth-submit" type="submit" :disabled="authSession.loading">
          <LogIn :size="18" />
          {{ authSession.loading ? '登录中' : '登录' }}
        </button>
      </form>

      <p class="auth-switch">
        还没有账号？
        <RouterLink :to="{ name: 'register', query: route.query }">立即注册</RouterLink>
      </p>
    </section>
  </main>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Download, Eye, EyeOff, LockKeyhole, LogIn, Mail, Moon, Sun } from '@lucide/vue'

import ServerHealthBadge from '@/components/ServerHealthBadge.vue'
import { useThemeMode } from '@/composables/useThemeMode'
import { authSession, normalizeRedirect, signIn } from '@/stores/authStore'

const route = useRoute()
const router = useRouter()
const { isNightTheme, toggleTheme } = useThemeMode()
const showPassword = ref(false)
const localError = ref('')
const form = reactive({
  email: '',
  password: '',
})

function validate() {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    return '请输入有效邮箱'
  }
  if (!form.password) {
    return '请输入密码'
  }
  return ''
}

async function submit() {
  localError.value = validate()
  if (localError.value) return

  try {
    await signIn({
      email: form.email,
      password: form.password,
    })
    router.replace(normalizeRedirect(route.query.redirect))
  } catch {
    // authSession.error is rendered above.
  }
}
</script>
