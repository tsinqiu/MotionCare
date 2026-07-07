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
        <template v-if="pageAction || showProfileShortcut" #right>
          <button v-if="pageAction" class="app-navbar-action" type="button" :aria-label="pageAction.label" @click="handlePageAction">
            <component v-if="pageAction.icon" :is="pageAction.icon" :size="21" aria-hidden="true" />
            <span v-else>{{ pageAction.label }}</span>
          </button>
          <button v-else class="app-navbar-action" type="button" aria-label="进入我的" @click="goProfile">
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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { Activity, Compass, HeartPulse, MapPin, UserRound, UsersRound } from '@lucide/vue'
import { useRoute, useRouter } from 'vue-router'

import { primaryNavigation } from '@/constants/product'

const route = useRoute()
const router = useRouter()
const scrollEl = ref(null)
const pageTitleOverride = ref('')
const pageAction = shallowRef(null)

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
const showProfileShortcut = computed(() => !pageAction.value && !route.meta.authLayout && route.path !== '/me')

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
  const event = new CustomEvent('motioncare:nav-back', { cancelable: true })
  window.dispatchEvent(event)
  if (event.defaultPrevented) return

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

function handlePageNavAction(event) {
  pageAction.value = event.detail || null
}

function handlePageAction() {
  window.dispatchEvent(new CustomEvent('motioncare:nav-action-click'))
}

// The scroll container is the phone frame's body, not the window, so reset it
// ourselves whenever the route changes.
watch(
  () => route.path,
  () => {
    pageTitleOverride.value = ''
    pageAction.value = null
    nextTick(() => {
      if (scrollEl.value) scrollEl.value.scrollTop = 0
    })
  },
)

onMounted(() => {
  window.addEventListener('motioncare:nav-title', handlePageTitle)
  window.addEventListener('motioncare:nav-action', handlePageNavAction)
})

onBeforeUnmount(() => {
  window.removeEventListener('motioncare:nav-title', handlePageTitle)
  window.removeEventListener('motioncare:nav-action', handlePageNavAction)
})
</script>
