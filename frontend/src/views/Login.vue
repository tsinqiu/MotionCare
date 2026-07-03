<template>
  <main class="auth-page auth-page--login">
    <section class="auth-card auth-card--quiet">
      <div class="auth-topline auth-topline--center">
        <div class="auth-brand auth-brand--plain">
          <img class="auth-brand__icon" src="/icons/motioncare-icon.svg" alt="" />
          <span>
            <strong>MotionCare</strong>
          </span>
        </div>
      </div>

      <div class="auth-login-mark">
        <img src="/icons/motioncare-icon.svg" alt="" />
      </div>

      <div class="auth-heading auth-heading--center">
        <h1>欢迎回来</h1>
        <p>登录后查看训练记录与恢复状态。</p>
      </div>

      <ServerHealthBadge />

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
import { Eye, EyeOff, LockKeyhole, LogIn, Mail } from '@lucide/vue'

import ServerHealthBadge from '@/components/ServerHealthBadge.vue'
import { authSession, normalizeRedirect, signIn } from '@/stores/authStore'

const route = useRoute()
const router = useRouter()
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
