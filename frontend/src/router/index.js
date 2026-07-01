import { createRouter, createWebHistory } from 'vue-router'

import Admin from '@/views/Admin.vue'
import Activities from '@/views/Activities.vue'
import ActivityDetail from '@/views/ActivityDetail.vue'
import Calendar from '@/views/Calendar.vue'
import Coach from '@/views/Coach.vue'
import HealthDetail from '@/views/HealthDetail.vue'
import Login from '@/views/Login.vue'
import Me from '@/views/Me.vue'
import RecordActivity from '@/views/RecordActivity.vue'
import Records from '@/views/Records.vue'
import Register from '@/views/Register.vue'
import Security from '@/views/Security.vue'
import Settings from '@/views/Settings.vue'
import Shoes from '@/views/Shoes.vue'
import Statistics from '@/views/Statistics.vue'
import Status from '@/views/Status.vue'
import Sync from '@/views/Sync.vue'
import Today from '@/views/Today.vue'
import TrainingLoad from '@/views/TrainingLoad.vue'
import {
  authSession,
  hasAuthToken,
  initAuthSession,
  installAuthFailureHandler,
  isAuthenticated,
  normalizeRedirect,
} from '@/stores/authStore'

const routes = [
  {
    path: '/',
    redirect: '/today',
  },
  {
    path: '/login',
    name: 'login',
    component: Login,
    meta: { title: '登录', publicOnly: true, authLayout: true },
  },
  {
    path: '/register',
    name: 'register',
    component: Register,
    meta: { title: '注册', publicOnly: true, authLayout: true },
  },
  {
    path: '/today',
    name: 'today',
    component: Today,
    meta: { title: '今日', requiresAuth: true },
  },
  {
    path: '/activities',
    name: 'activities',
    component: Activities,
    meta: { title: '我的运动', requiresAuth: true },
  },
  {
    path: '/activities/:id',
    name: 'activity-detail',
    component: ActivityDetail,
    meta: { title: '运动详情', requiresAuth: true },
  },
  {
    path: '/record',
    name: 'record-activity',
    component: RecordActivity,
    meta: { title: '记录运动', requiresAuth: true },
  },
  {
    path: '/status',
    name: 'status',
    component: Status,
    meta: { title: '状态', requiresAuth: true },
  },
  {
    path: '/status/health',
    name: 'status-health',
    component: HealthDetail,
    meta: { title: '健康详情', requiresAuth: true },
  },
  {
    path: '/status/training-load',
    name: 'status-training-load',
    component: TrainingLoad,
    meta: { title: '训练负荷', requiresAuth: true },
  },
  {
    path: '/status/trends',
    name: 'status-trends',
    component: Statistics,
    meta: { title: '运动趋势', requiresAuth: true },
  },
  {
    path: '/status/calendar',
    name: 'status-calendar',
    component: Calendar,
    meta: { title: '训练日历', requiresAuth: true },
  },
  {
    path: '/status/records',
    name: 'status-records',
    component: Records,
    meta: { title: '最佳记录', requiresAuth: true },
  },
  {
    path: '/coach',
    name: 'coach',
    component: Coach,
    meta: { title: '教练', requiresAuth: true },
  },
  {
    path: '/me',
    name: 'me',
    component: Me,
    meta: { title: '我的', requiresAuth: true },
  },
  {
    path: '/me/sync',
    name: 'me-sync',
    component: Sync,
    meta: { title: '数据同步', requiresAuth: true },
  },
  {
    path: '/me/shoes',
    name: 'me-shoes',
    component: Shoes,
    meta: { title: '跑鞋', requiresAuth: true },
  },
  {
    path: '/me/security',
    name: 'me-security',
    component: Security,
    meta: { title: '账号安全', requiresAuth: true },
  },
  {
    path: '/me/settings',
    name: 'me-settings',
    component: Settings,
    meta: { title: '个人设置', requiresAuth: true },
  },
  {
    path: '/me/admin',
    name: 'me-admin',
    component: Admin,
    meta: { title: '用户管理', requiresAuth: true, requiresAdmin: true },
  },
  { path: '/start', redirect: '/record' },
  { path: '/health', redirect: '/status/health' },
  { path: '/training-load', redirect: '/status/training-load' },
  { path: '/calendar', redirect: '/status/calendar' },
  { path: '/records', redirect: '/status/records' },
  { path: '/statistics', redirect: '/status/trends' },
  { path: '/trends', redirect: '/status/trends' },
  { path: '/analytics', redirect: '/status/trends' },
  { path: '/assistant', redirect: '/coach' },
  { path: '/explore', redirect: '/coach' },
  { path: '/sync', redirect: '/me/sync' },
  { path: '/shoes', redirect: '/me/shoes' },
  { path: '/settings', redirect: '/me/settings' },
  { path: '/admin', redirect: '/me/admin' },
  { path: '/community', redirect: '/today' },
  {
    path: '/schema',
    redirect: '/today',
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  },
})

installAuthFailureHandler(router)

router.beforeEach(async (to) => {
  if (to.meta.publicOnly) {
    if (hasAuthToken()) {
      const ready = isAuthenticated.value || await initAuthSession()
      if (ready) {
        return normalizeRedirect(to.query.redirect)
      }
    }
    return true
  }

  if (!to.meta.requiresAuth) {
    return true
  }

  if (!hasAuthToken()) {
    return {
      name: 'login',
      query: { redirect: normalizeRedirect(to.fullPath) },
    }
  }

  const ready = isAuthenticated.value || await initAuthSession()
  if (!ready) {
    return {
      name: 'login',
      query: { redirect: normalizeRedirect(to.fullPath) },
    }
  }

  if (to.meta.requiresAdmin && authSession.user?.role !== 'admin') {
    return { name: 'today' }
  }

  return true
})

router.afterEach((to) => {
  document.title = `${to.meta.title || 'MotionCare'} - MotionCare`
})

export default router
