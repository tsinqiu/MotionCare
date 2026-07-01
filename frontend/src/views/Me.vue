<template>
  <div class="page-stack">
    <StateBlock v-if="authSession.loading" title="正在加载账号" message="正在读取你的个人信息。" />
    <StateBlock
      v-else-if="authSession.error"
      title="账号信息加载失败"
      :message="authSession.error"
      action-label="重试"
      tone="danger"
      @action="initAuthSession({ force: true })"
    />
    <StateBlock v-else-if="!authSession.user" title="未找到账号" message="请重新登录后查看个人信息。" action-label="去登录" @action="router.push('/login')" />

    <template v-else>
      <section class="dark-panel">
        <div class="section-heading">
          <div>
            <p class="overline">账号与个人能力</p>
            <h2>我的</h2>
            <p>{{ accountSummary }}</p>
          </div>
          <span class="status-chip good">{{ roleLabel }}</span>
        </div>
      </section>

      <section class="dark-panel race-card">
        <div>
          <p class="overline">目标赛事</p>
          <h2>{{ targetRace.name }}</h2>
          <p>{{ targetRace.date }} · {{ targetRace.distanceLabel }}</p>
        </div>
        <div class="race-countdown">
          <strong>{{ raceCountdown.label }}</strong>
          <small>按本地自然日计算</small>
        </div>
      </section>

      <section class="dark-panel">
        <div class="section-heading"><div><h2>个人服务</h2></div></div>
        <div class="me-link-grid">
          <RouterLink v-for="item in personalLinks" :key="item.to" :to="item.to">
            <component :is="item.icon" :size="20" aria-hidden="true" />
            <span><strong>{{ item.label }}</strong><small>{{ item.description }}</small></span>
          </RouterLink>
          <RouterLink v-if="isAdmin" to="/me/admin">
            <ShieldCheck :size="20" aria-hidden="true" />
            <span><strong>用户管理</strong><small>处理课程演示中的用户管理工作</small></span>
          </RouterLink>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Footprints, RefreshCw, Settings, ShieldCheck, UserRound } from '@lucide/vue'
import { useRouter } from 'vue-router'

import StateBlock from '@/components/StateBlock.vue'
import { targetRace } from '@/constants/product'
import { authSession, initAuthSession } from '@/stores/authStore'
import { getRaceCountdown } from '@/utils/productInsights'

const router = useRouter()
const raceCountdown = computed(() => getRaceCountdown(targetRace.date))
const isAdmin = computed(() => authSession.user?.role === 'admin')
const roleLabel = computed(() => isAdmin.value ? '管理员' : '运动用户')
const accountSummary = computed(() => [authSession.user?.username, authSession.user?.email].filter(Boolean).join(' · '))
const personalLinks = [
  { to: '/me/sync', label: '数据同步', description: '连接 Garmin 并更新运动与健康数据', icon: RefreshCw },
  { to: '/me/shoes', label: '跑鞋', description: '记录跑鞋里程与使用状态', icon: Footprints },
  { to: '/me/security', label: '账号安全', description: '查看登录保护和当前账号状态', icon: ShieldCheck },
  { to: '/me/settings', label: '个人设置', description: '调整资料、偏好与服务配置', icon: Settings },
]
</script>

<style scoped>
.race-card { display: flex; align-items: center; justify-content: space-between; gap: 18px; }
.race-countdown { display: grid; gap: 4px; text-align: right; }
.race-countdown strong { font-size: clamp(24px, 4vw, 40px); }
.me-link-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.me-link-grid a {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--panel-soft);
}
.me-link-grid span { display: grid; gap: 4px; }
@media (max-width: 700px) {
  .race-card { align-items: flex-start; flex-direction: column; }
  .race-countdown { text-align: left; }
  .me-link-grid { grid-template-columns: 1fr; }
}
</style>
