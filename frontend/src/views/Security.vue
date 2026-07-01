<template>
  <div class="page-stack">
    <StateBlock v-if="authSession.loading" title="正在加载安全状态" message="正在确认当前账号。" />
    <StateBlock
      v-else-if="authSession.error"
      title="安全状态加载失败"
      :message="authSession.error"
      action-label="重试"
      tone="danger"
      @action="initAuthSession({ force: true })"
    />
    <StateBlock v-else-if="!authSession.user" title="请重新登录" message="登录后可以查看账号安全状态。" action-label="去登录" @action="router.push('/login')" />

    <template v-else>
      <section class="dark-panel">
        <div class="section-heading">
          <div>
            <p class="overline">账号与登录</p>
            <h2>账号安全</h2>
            <p>查看当前账号和 MotionCare 已启用的登录保护。</p>
          </div>
          <span class="status-chip good">已登录</span>
        </div>
      </section>

      <div class="security-grid">
        <section class="dark-panel">
          <h2>当前账号</h2>
          <div class="log-list">
            <span>用户名 · {{ authSession.user.username || '--' }}</span>
            <span>邮箱 · {{ authSession.user.email || '--' }}</span>
            <span>身份 · {{ authSession.user.role === 'admin' ? '管理员' : '运动用户' }}</span>
          </div>
        </section>
        <section class="dark-panel">
          <h2>登录保护</h2>
          <div class="log-list">
            <span>连续失败登录会触发临时保护</span>
            <span>接口请求受到服务端流量保护</span>
            <span>个人运动与健康数据仅对当前账号开放</span>
          </div>
        </section>
      </div>

      <section class="dark-panel">
        <h2>当前设备</h2>
        <p>退出后，本设备保存的登录状态会被清除。</p>
        <button class="secondary-link" type="button" @click="handleLogout">退出当前账号</button>
      </section>
    </template>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'

import StateBlock from '@/components/StateBlock.vue'
import { authSession, initAuthSession, signOut } from '@/stores/authStore'

const router = useRouter()

function handleLogout() {
  signOut()
  router.replace('/login')
}
</script>

<style scoped>
.security-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
@media (max-width: 700px) { .security-grid { grid-template-columns: 1fr; } }
</style>
