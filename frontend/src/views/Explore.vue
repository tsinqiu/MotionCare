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
          <span class="explore-entry-card__icon" :style="{ '--entry-color': item.color, '--entry-bg': item.bg }">
            <component :is="item.icon" :size="26" aria-hidden="true" />
          </span>
          <span>{{ item.label }}</span>
        </RouterLink>
        <button
          v-else
          class="explore-entry-card"
          type="button"
          :aria-label="item.label"
          @click="showComingSoon(item.label)"
        >
          <span class="explore-entry-card__icon" :style="{ '--entry-color': item.color, '--entry-bg': item.bg }">
            <component :is="item.icon" :size="26" aria-hidden="true" />
          </span>
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
  CalendarDays,
  ClipboardList,
  CloudCog,
  Flame,
  HeartPulse,
  LineChart,
  Route,
  Settings2,
  Sparkles,
  Trophy,
} from '@lucide/vue'

const exploreEntries = [
  { label: '运动日历', to: { path: '/status/calendar', query: { from: 'explore' } }, icon: CalendarDays, color: '#2563eb', bg: '#dbeafe' },
  { label: '健康度', to: { path: '/status/health', query: { from: 'explore' } }, icon: HeartPulse, color: '#f59e0b', bg: '#fef3c7' },
  { label: '趋势', to: { path: '/status/trends', query: { from: 'explore' } }, icon: LineChart, color: '#0ea5e9', bg: '#e0f2fe' },
  { label: '身体数据', to: { path: '/me/settings', query: { from: 'explore', section: 'body' } }, icon: Settings2, color: '#0f9f8f', bg: '#ccfbf1' },
  { label: '训练计划', to: { path: '/training-plans', query: { from: 'explore' } }, icon: ClipboardList, color: '#16a34a', bg: '#dcfce7' },
  { label: '常用课程', to: { path: '/explore/courses' }, icon: BookOpen, color: '#4f46e5', bg: '#e0e7ff' },
  { label: '状态总览', to: { path: '/status', query: { from: 'explore' } }, icon: Sparkles, color: '#14b8a6', bg: '#ccfbf1' },
  { label: 'AI教练', to: { path: '/coach', query: { from: 'explore' } }, icon: Bot, color: '#8b5cf6', bg: '#ede9fe' },
  { label: '最佳榜单', to: { path: '/status/records', query: { from: 'explore' } }, icon: Trophy, color: '#f59e0b', bg: '#fef3c7' },
  { label: '运动路线', to: { path: '/explore/routes' }, icon: Route, color: '#0f9f8f', bg: '#ccfbf1' },
  { label: '热门赛事', to: { path: '/explore/events' }, icon: Flame, color: '#dc2626', bg: '#fee2e2' },
  { label: '数据同步', to: { path: '/me/sync', query: { from: 'explore' } }, icon: CloudCog, color: '#0ea5e9', bg: '#dbeafe' },
]

function showComingSoon(label) {
  showToast(`${label}功能建设中`)
}
</script>

<style scoped>
.explore-home {
  gap: 16px;
}

.explore-heading {
  display: grid;
  place-items: center;
  min-height: 58px;
  padding-top: 6px;
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
  gap: 14px 12px;
}

.explore-entry-card {
  min-width: 0;
  min-height: 96px;
  display: grid;
  grid-template-rows: 50px auto;
  align-items: start;
  justify-items: center;
  gap: 8px;
  padding: 10px 6px 12px;
  border: 0;
  background: transparent;
  color: var(--text);
  text-align: center;
  text-decoration: none;
  cursor: pointer;
}

.explore-entry-card__icon {
  width: 50px;
  height: 50px;
  display: grid;
  place-items: center;
  border-radius: 16px;
  background: var(--entry-bg, color-mix(in srgb, var(--entry-color) 12%, #f8fafc));
  color: var(--entry-color);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--entry-color) 10%, transparent);
}

.explore-entry-card__icon svg {
  stroke-width: 2.5;
}

.explore-entry-card > span:last-child {
  min-width: 0;
  color: var(--text);
  font-size: 13px;
  line-height: 1.18;
  font-weight: 800;
  overflow-wrap: anywhere;
}

.explore-entry-card:active {
  transform: translateY(1px);
}

@container phone-frame (max-width: 390px) {
  .explore-entry-grid {
    gap: 10px 8px;
  }

  .explore-entry-card {
    min-height: 88px;
    padding-inline: 3px;
  }

  .explore-entry-card__icon {
    width: 46px;
    height: 46px;
    border-radius: 15px;
  }

  .explore-entry-card > span:last-child {
    font-size: 12px;
  }
}
</style>
