<template>
  <div class="app-viewport">
    <div class="phone-frame">
      <van-nav-bar
        class="app-navbar"
        :title="navTitle"
        :left-arrow="showBack"
        :left-text="showBack ? '返回' : ''"
        @click-left="goBack"
      >
        <template v-if="showProfileShortcut" #right>
          <button class="app-navbar-action" type="button" aria-label="进入我的" @click="goProfile">
            <UserRound :size="21" aria-hidden="true" />
          </button>
        </template>
      </van-nav-bar>

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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Activity, Compass, HeartPulse, MapPin, UserRound, UsersRound } from '@lucide/vue'
import { useRoute, useRouter } from 'vue-router'

import { primaryNavigation } from '@/constants/product'

const route = useRoute()
const router = useRouter()
const scrollEl = ref(null)
const pageTitleOverride = ref('')

const iconMap = {
  today: HeartPulse,
  activities: Activity,
  record: MapPin,
  explore: Compass,
  community: UsersRound,
}
const navItems = primaryNavigation
const returnTargets = {
  today: '/today',
  explore: '/explore',
}
const returnTarget = computed(() => returnTargets[route.query.from] || '')
const showBack = computed(() => Boolean(route.meta.backTo || returnTarget.value))
const hideTabbar = computed(() => showBack.value)
const navTitle = computed(() => (showBack.value ? pageTitleOverride.value || route.meta.title || '返回' : route.meta.navTitle || 'MotionCare'))
const showProfileShortcut = computed(() => !route.meta.authLayout && route.path !== '/me')

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
  if (returnTarget.value) {
    router.push(returnTarget.value)
    return
  }
  router.push(route.meta.backTo || '/today')
}

function goProfile() {
  if (route.path !== '/me') router.push('/me')
}

function handlePageTitle(event) {
  pageTitleOverride.value = event.detail?.title || ''
}

// The scroll container is the phone frame's body, not the window, so reset it
// ourselves whenever the route changes.
watch(
  () => route.path,
  () => {
    pageTitleOverride.value = ''
    nextTick(() => {
      if (scrollEl.value) scrollEl.value.scrollTop = 0
    })
  },
)

onMounted(() => {
  window.addEventListener('motioncare:nav-title', handlePageTitle)
})

onBeforeUnmount(() => {
  window.removeEventListener('motioncare:nav-title', handlePageTitle)
})
</script>
