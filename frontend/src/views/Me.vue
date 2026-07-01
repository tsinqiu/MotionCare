<template>
  <div class="page-stack">
    <StateBlock v-if="authSession.loading" title="正在加载账号" message="正在读取你的个人信息。" />
    <StateBlock
      v-else-if="authSession.error"
      title="账号信息加载失败"
      message="连接暂时不可用，稍后再试一次。"
      action-label="重试"
      tone="danger"
      @action="initAuthSession({ force: true })"
    />
    <StateBlock v-else-if="!authSession.user" title="未找到账号" message="请重新登录后查看个人信息。" action-label="去登录" @action="router.push('/login')" />

    <template v-else>
      <section class="profile-head">
        <div class="profile-avatar">{{ userInitial }}</div>
        <div class="profile-meta">
          <strong>{{ authSession.user.username }}</strong>
          <small v-if="authSession.user.email">{{ authSession.user.email }}</small>
        </div>
        <span class="status-chip good">{{ roleLabel }}</span>
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

      <div class="cell-section">
        <p class="cell-section__title">个人服务</p>
        <van-cell-group inset>
          <van-cell
            v-for="item in personalLinks"
            :key="item.to"
            :title="item.label"
            :label="item.description"
            is-link
            :to="item.to"
          >
            <template #icon>
              <component :is="item.icon" :size="20" class="cell-icon" aria-hidden="true" />
            </template>
          </van-cell>
          <van-cell
            v-if="isAdmin"
            title="用户管理"
            label="管理平台用户与访问权限"
            is-link
            to="/me/admin"
          >
            <template #icon>
              <ShieldCheck :size="20" class="cell-icon" aria-hidden="true" />
            </template>
          </van-cell>
        </van-cell-group>
      </div>

      <div class="cell-section">
        <p class="cell-section__title">偏好</p>
        <van-cell-group inset>
          <van-cell
            title="外观"
            :label="isNightTheme ? '夜间模式' : '浅色模式'"
            is-link
            @click="toggleTheme"
          >
            <template #icon>
              <component :is="isNightTheme ? Moon : Sun" :size="20" class="cell-icon" aria-hidden="true" />
            </template>
          </van-cell>
        </van-cell-group>
      </div>

      <button type="button" class="logout-btn" @click="handleLogout">
        <LogOut :size="18" />
        退出登录
      </button>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Footprints, LogOut, Moon, RefreshCw, Settings, ShieldCheck, Sun } from '@lucide/vue'
import { useRouter } from 'vue-router'

import StateBlock from '@/components/StateBlock.vue'
import { targetRace } from '@/constants/product'
import { authSession, initAuthSession, signOut } from '@/stores/authStore'
import { useThemeMode } from '@/composables/useThemeMode'
import { getRaceCountdown } from '@/utils/productInsights'

const router = useRouter()
const { isNightTheme, toggleTheme } = useThemeMode()
const raceCountdown = computed(() => getRaceCountdown(targetRace.date))
const isAdmin = computed(() => authSession.user?.role === 'admin')
const roleLabel = computed(() => isAdmin.value ? '管理员' : '运动用户')
const userInitial = computed(() => (authSession.user?.username || '我').slice(0, 1).toUpperCase())
const personalLinks = [
  { to: '/me/sync', label: '数据同步', description: '连接 Garmin 并更新运动与健康数据', icon: RefreshCw },
  { to: '/me/shoes', label: '跑鞋', description: '记录跑鞋里程与使用状态', icon: Footprints },
  { to: '/me/security', label: '账号安全', description: '查看登录保护和当前账号状态', icon: ShieldCheck },
  { to: '/me/settings', label: '个人设置', description: '调整资料、偏好与服务配置', icon: Settings },
]

function handleLogout() {
  signOut()
  window.location.assign('/login')
}
</script>

<style scoped>
.profile-head {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: var(--space-5);
  border-radius: var(--radius-xl);
  border: 1px solid var(--border);
  background:
    radial-gradient(120% 120% at 0% 0%, rgb(33 212 123 / 0.14), transparent 55%),
    var(--panel);
  box-shadow: var(--shadow-sm);
}
.profile-avatar {
  flex: 0 0 auto;
  width: 54px;
  height: 54px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--green);
  color: #04240f;
  font-size: 22px;
  font-weight: 700;
}
.profile-meta { flex: 1 1 auto; display: grid; gap: 3px; min-width: 0; }
.profile-meta strong { font-size: var(--fs-h2); }
.profile-meta small { color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.race-card { display: flex; align-items: center; justify-content: space-between; gap: 18px; }
.race-countdown { display: grid; gap: 4px; text-align: right; }
.race-countdown strong { font-size: clamp(24px, 7vw, 34px); color: var(--green-strong); }

.cell-section { display: grid; gap: 8px; }
.cell-section__title {
  margin: 0;
  padding-left: 4px;
  font-size: 13px;
  font-weight: 600;
  color: var(--muted);
}
.cell-icon { color: var(--green); margin-right: 10px; }

.logout-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 13px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  background: var(--panel);
  color: var(--red);
  font-weight: 600;
}

@media (max-width: 700px) {
  .race-card { align-items: flex-start; flex-direction: column; }
  .race-countdown { text-align: left; }
}
</style>
