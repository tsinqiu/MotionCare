<template>
  <div class="app-viewport">
    <div class="phone-frame">
      <van-nav-bar
        class="app-navbar"
        :title="navTitle"
        :left-arrow="showBack"
        :left-text="showBack ? '返回' : ''"
        @click-left="goBack"
      />

      <main ref="scrollEl" class="page-frame">
        <RouterView v-slot="{ Component }">
          <Transition name="page" mode="out-in">
            <component :is="Component" />
          </Transition>
        </RouterView>
      </main>

      <van-tabbar
        v-if="!hideTabbar"
        class="app-tabbar"
        :model-value="activeTab"
        :fixed="false"
        @change="goTab"
      >
        <van-tabbar-item
          v-for="item in navItems"
          :key="item.to"
          :class="{ 'app-tabbar-item--record': item.icon === 'record' }"
          :name="item.icon"
        >
          <span>{{ item.label }}</span>
          <template #icon>
            <component :is="iconMap[item.icon]" :size="22" aria-hidden="true" />
          </template>
        </van-tabbar-item>
      </van-tabbar>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { Activity, Bot, Gauge, HeartPulse, MapPin, UserRound } from '@lucide/vue'
import { useRoute, useRouter } from 'vue-router'

import { primaryNavigation } from '@/constants/product'

const route = useRoute()
const router = useRouter()
const scrollEl = ref(null)

const iconMap = {
  today: HeartPulse,
  activities: Activity,
  record: MapPin,
  status: Gauge,
  coach: Bot,
  me: UserRound,
}
const navItems = primaryNavigation
const showBack = computed(() => Boolean(route.meta.backTo || route.query.from === 'today'))
const hideTabbar = computed(() => showBack.value)
const navTitle = computed(() => (showBack.value ? route.meta.title || '返回' : 'MotionCare'))

// Highlight the tab that owns the current route, including nested pages
// (e.g. /status/health lights up 状态, /me/sync lights up 我的).
const activeTab = computed(() => {
  const segment = route.path.split('/')[1] || ''
  return navItems.some((item) => item.icon === segment) ? segment : ''
})

function goTab(name) {
  const target = navItems.find((item) => item.icon === name)
  if (target && route.path !== target.to) router.push(target.to)
}

function goBack() {
  if (route.query.from === 'today') {
    router.push('/today')
    return
  }
  router.push(route.meta.backTo || '/today')
}

// The scroll container is the phone frame's body, not the window, so reset it
// ourselves whenever the route changes.
watch(
  () => route.path,
  () => {
    nextTick(() => {
      if (scrollEl.value) scrollEl.value.scrollTop = 0
    })
  },
)
</script>
