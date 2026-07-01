<template>
  <div class="app-shell">
    <aside class="sidebar">
      <RouterLink class="brand" to="/today">
        <span class="brand-mark">MC</span>
        <span>
          <strong>MotionCare</strong>
        </span>
      </RouterLink>

      <nav class="nav-list" aria-label="主导航">
        <RouterLink v-for="item in navItems" :key="item.to" :to="item.to">
          <component :is="iconMap[item.icon]" :size="18" aria-hidden="true" />
          {{ item.label }}
        </RouterLink>
      </nav>
    </aside>

    <div class="content-shell">
      <header class="topbar">
        <h1>MotionCare</h1>
        <div class="topbar-actions">
          <button class="theme-toggle" type="button" @click="toggleTheme">
            <component :is="isNightTheme ? Sun : Moon" :size="16" />
            {{ isNightTheme ? '日间' : '夜晚' }}
          </button>
          <div class="user-chip" :title="authSession.user?.email">
            <UserRound :size="16" />
            <span>{{ userLabel }}</span>
            <small>{{ roleLabel }}</small>
          </div>
          <RouterLink class="topbar-start" to="/record">
            <CirclePlus :size="16" />
            记录运动
          </RouterLink>
          <button class="topbar-logout" type="button" @click="handleLogout">
            <LogOut :size="16" />
            退出
          </button>
        </div>
      </header>

      <main class="page-frame">
        <RouterView />
        <footer class="app-footer">
          <span>MotionCare · 每一天都更懂自己的状态</span>
        </footer>
      </main>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import {
  Activity,
  Bot,
  CirclePlus,
  Gauge,
  HeartPulse,
  LogOut,
  Moon,
  Sun,
  UserRound,
} from '@lucide/vue'

import { primaryNavigation } from '@/constants/product'
import { authSession, signOut } from '@/stores/authStore'
import { useThemeMode } from '@/composables/useThemeMode'

const { isNightTheme, toggleTheme } = useThemeMode()
const userLabel = computed(() => authSession.user?.username || '已登录用户')
const roleLabel = computed(() => authSession.user?.role === 'admin' ? '管理员' : '用户')

function handleLogout() {
  signOut()
  window.location.assign('/login')
}

const iconMap = {
  today: HeartPulse,
  activities: Activity,
  status: Gauge,
  coach: Bot,
  me: UserRound,
}
const navItems = primaryNavigation
</script>
