<template>
  <div class="page-stack explore-home">
    <header class="explore-heading">
      <h1>探索</h1>
    </header>

    <nav class="explore-entry-grid" aria-label="探索功能入口">
      <template v-for="item in exploreEntries" :key="item.label">
        <RouterLink
          v-if="item.to"
          class="explore-entry-card"
          :to="item.to"
          :aria-label="item.label"
        >
          <component :is="item.icon" :size="38" :style="{ color: item.color }" aria-hidden="true" />
          <span>{{ item.label }}</span>
        </RouterLink>
        <button
          v-else
          class="explore-entry-card"
          type="button"
          :aria-label="item.label"
          @click="showComingSoon(item.label)"
        >
          <component :is="item.icon" :size="38" :style="{ color: item.color }" aria-hidden="true" />
          <span>{{ item.label }}</span>
        </button>
      </template>
    </nav>
  </div>
</template>

<script setup>
import { showToast } from 'vant'
import {
  BarChart3,
  BookOpen,
  Bot,
  Flame,
  Gauge,
  HeartPulse,
  Route,
  Trophy,
} from '@lucide/vue'

const exploreEntries = [
  { label: '状态', to: { path: '/status', query: { from: 'explore' } }, icon: Gauge, color: '#16a34a' },
  { label: '教练', to: { path: '/coach', query: { from: 'explore' } }, icon: Bot, color: '#8b5cf6' },
  { label: '运动统计', to: { path: '/status/trends', query: { from: 'explore' } }, icon: BarChart3, color: '#2563eb' },
  { label: '最佳榜单', to: { path: '/status/records', query: { from: 'explore' } }, icon: Trophy, color: '#f59e0b' },
  { label: '热门赛事', icon: Flame, color: '#dc2626' },
  { label: '运动路线', icon: Route, color: '#0f9f8f' },
  { label: '身体数据', to: { path: '/status/health', query: { from: 'explore' } }, icon: HeartPulse, color: '#e11d48' },
  { label: '常用课程', icon: BookOpen, color: '#4f46e5' },
]

function showComingSoon(label) {
  showToast(`${label}功能建设中`)
}
</script>

<style scoped>
.explore-home {
  gap: 18px;
}

.explore-heading {
  display: grid;
  place-items: center;
  min-height: 64px;
  padding-top: 8px;
}

.explore-heading h1 {
  margin: 0;
  color: var(--text);
  font-size: 30px;
  line-height: 1.1;
  font-weight: 950;
  letter-spacing: 0;
}

.explore-entry-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.explore-entry-card {
  display: grid;
  grid-template-rows: 42px auto;
  align-items: center;
  justify-items: center;
  gap: 10px;
  min-width: 0;
  min-height: 118px;
  padding: 18px 8px 14px;
  border: 1px solid color-mix(in srgb, var(--app-green) 14%, var(--border));
  border-radius: 18px;
  background: var(--panel);
  color: var(--text);
  text-align: center;
  text-decoration: none;
  box-shadow: var(--shadow-sm);
  cursor: pointer;
}

.explore-entry-card svg {
  width: 38px;
  height: 38px;
  stroke-width: 2.6;
}

.explore-entry-card span {
  min-width: 0;
  color: var(--text);
  font-size: 14px;
  line-height: 1.15;
  font-weight: 900;
  overflow-wrap: anywhere;
}

.explore-entry-card:active {
  transform: translateY(1px);
}

@container phone-frame (max-width: 390px) {
  .explore-entry-grid {
    gap: 9px;
  }

  .explore-entry-card {
    min-height: 108px;
    padding: 15px 6px 12px;
    border-radius: 16px;
  }

  .explore-entry-card svg {
    width: 34px;
    height: 34px;
  }

  .explore-entry-card span {
    font-size: 13px;
  }
}
</style>
