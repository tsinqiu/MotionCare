<template>
  <div class="page-stack explore-tool-page">
    <section class="tool-hero event-hero">
      <div>
        <p class="overline">Race Hub</p>
        <h2>赛事管理</h2>
        <p>收藏目标赛事，填写日期后自动生成倒计时。</p>
      </div>
      <span>{{ myEvents.length }} 场</span>
    </section>

    <nav class="tool-tabs" aria-label="赛事视图">
      <button v-for="tab in tabs" :key="tab.key" type="button" :class="{ active: activeTab === tab.key }" @click="activeTab = tab.key">
        {{ tab.label }}
      </button>
    </nav>

    <section v-if="activeTab === 'popular'" class="tool-card-list">
      <article v-for="event in popularEvents" :key="event.id" class="tool-list-card">
        <div>
          <span class="tool-icon" :style="{ '--tool-color': event.color }">
            <component :is="event.icon" :size="24" aria-hidden="true" />
          </span>
          <div>
            <h3>{{ event.name }}</h3>
            <p>{{ event.city }} · {{ event.type }} · {{ event.distance }}</p>
            <small>{{ event.note }}</small>
          </div>
        </div>
        <button type="button" class="secondary-link" @click="prepareEvent(event)">加入我的</button>
      </article>
    </section>

    <section v-else-if="activeTab === 'mine'" class="tool-card-list">
      <article v-if="!myEvents.length" class="tool-empty-card">
        <strong>暂无我的赛事</strong>
        <span>从热门赛事加入，或在下方自定义赛事。</span>
      </article>
      <article v-for="event in myEvents" :key="event.id" class="tool-list-card">
        <div>
          <span class="tool-icon" :style="{ '--tool-color': event.color || '#16a34a' }">
            <Medal :size="24" aria-hidden="true" />
          </span>
          <div>
            <h3>{{ event.name }}</h3>
            <p>{{ event.city || event.location || '未设置地点' }} · {{ event.type || '赛事' }} · {{ event.distance || '未设置项目' }}</p>
            <small>{{ event.date || '未设置日期' }}{{ event.goal ? ` · 目标 ${event.goal}` : '' }}</small>
          </div>
        </div>
        <button type="button" class="danger-link" @click="removeEvent(event.id)">移除</button>
      </article>
    </section>

    <section v-else class="countdown-stack">
      <article v-if="!countdownEvents.length" class="tool-empty-card">
        <strong>暂无赛事倒计时</strong>
        <span>为我的赛事填写日期后，这里会显示剩余天数。</span>
      </article>
      <article v-for="event in countdownEvents" :key="event.id" class="countdown-card">
        <span>{{ daysUntil(event.date) }}</span>
        <div>
          <h3>{{ event.name }}</h3>
          <p>{{ event.city || event.location || '未设置地点' }} · {{ event.date }}</p>
        </div>
      </article>
    </section>

    <form class="tool-form-card" @submit.prevent="saveDraft">
      <div class="section-heading">
        <div>
          <p class="overline">{{ editingFromTemplate ? '确认赛事信息' : '自定义赛事' }}</p>
          <h2>{{ editingFromTemplate ? draft.name : '添加赛事' }}</h2>
        </div>
      </div>
      <div class="tool-form-grid">
        <label>
          <span>赛事名称</span>
          <input v-model.trim="draft.name" type="text" placeholder="例如 北京马拉松" required />
        </label>
        <label>
          <span>地点</span>
          <input v-model.trim="draft.city" type="text" placeholder="城市 / 场地" />
        </label>
        <label>
          <span>比赛日期</span>
          <input v-model="draft.date" type="date" />
        </label>
        <label>
          <span>项目</span>
          <input v-model.trim="draft.distance" type="text" placeholder="全马 / 半马 / 10K" />
        </label>
        <label>
          <span>目标成绩</span>
          <input v-model.trim="draft.goal" type="text" placeholder="例如 4:00:00" />
        </label>
        <label class="tool-form-wide">
          <span>备注</span>
          <textarea v-model.trim="draft.note" rows="3" placeholder="报名状态、补给、交通等" />
        </label>
      </div>
      <button class="primary-link" type="submit">{{ editingFromTemplate ? '确认加入' : '保存赛事' }}</button>
    </form>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { showToast } from 'vant'
import { Activity, Bike, Medal, Waves } from '@lucide/vue'

const STORAGE_KEY = 'motioncare-my-events'

const tabs = [
  { key: 'popular', label: '热门赛事' },
  { key: 'mine', label: '我的赛事' },
  { key: 'countdown', label: '倒计时' },
]

const popularEvents = [
  { id: 'beijing-marathon', name: '北京马拉松', city: '北京', type: '路跑', distance: '全马', note: '城市地标线路，适合作为年度目标赛事。', icon: Activity, color: '#16a34a' },
  { id: 'shanghai-marathon', name: '上海马拉松', city: '上海', type: '路跑', distance: '全马', note: '大城市高速赛道，适合冲击个人最好成绩。', icon: Activity, color: '#16a34a' },
  { id: 'xiamen-marathon', name: '厦门马拉松', city: '厦门', type: '路跑', distance: '全马', note: '沿海城市赛事，适合冬春季备赛。', icon: Activity, color: '#0ea5e9' },
  { id: 'wuxi-marathon', name: '无锡马拉松', city: '无锡', type: '路跑', distance: '全马 / 半马', note: '春季热门赛事，可作为半马或全马目标。', icon: Activity, color: '#22c55e' },
  { id: 'hangzhou-marathon', name: '杭州马拉松', city: '杭州', type: '路跑', distance: '全马 / 半马', note: '城市湖滨路线，适合作为秋季目标。', icon: Activity, color: '#14b8a6' },
  { id: 'guangzhou-marathon', name: '广州马拉松', city: '广州', type: '路跑', distance: '全马 / 半马', note: '年底赛事，适合完整周期训练检验。', icon: Activity, color: '#f97316' },
  { id: 'cycling-century', name: '城市百公里骑行', city: '自选城市', type: '骑行', distance: '100 km', note: '适合长距离耐力骑行目标。', icon: Bike, color: '#f59e0b' },
  { id: 'open-water-1500', name: '1500m 游泳挑战', city: '泳池 / 公开水域', type: '游泳', distance: '1500 m', note: '适合作为游泳耐力阶段目标。', icon: Waves, color: '#0ea5e9' },
]

const activeTab = ref('popular')
const editingFromTemplate = ref(false)
const myEvents = ref(loadItems())
const draft = reactive(createEmptyDraft())

const countdownEvents = computed(() => myEvents.value
  .filter((event) => event.date && !Number.isNaN(Date.parse(event.date)))
  .sort((a, b) => Date.parse(a.date) - Date.parse(b.date)))

function createEmptyDraft(source = {}) {
  return {
    id: source.id ? `my-${source.id}` : '',
    name: source.name || '',
    city: source.city || source.location || '',
    date: source.date || '',
    type: source.type || '',
    distance: source.distance || '',
    goal: source.goal || '',
    note: source.note || '',
    color: source.color || '#16a34a',
  }
}

function loadItems() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    window.localStorage.removeItem(STORAGE_KEY)
    return []
  }
}

function persist() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(myEvents.value))
}

function resetDraft() {
  Object.assign(draft, createEmptyDraft())
  editingFromTemplate.value = false
}

function prepareEvent(event) {
  Object.assign(draft, createEmptyDraft(event))
  editingFromTemplate.value = true
  showToast('请确认日期后加入我的赛事')
}

function saveDraft() {
  if (!draft.name) {
    showToast('请填写赛事名称')
    return
  }
  const item = {
    ...draft,
    id: draft.id || `event-${Date.now()}`,
    city: draft.city.trim(),
    name: draft.name.trim(),
  }
  const index = myEvents.value.findIndex((event) => event.id === item.id)
  if (index >= 0) myEvents.value.splice(index, 1, item)
  else myEvents.value.unshift(item)
  persist()
  resetDraft()
  activeTab.value = 'mine'
  showToast('赛事已保存')
}

function removeEvent(id) {
  myEvents.value = myEvents.value.filter((event) => event.id !== id)
  persist()
}

function daysUntil(date) {
  const target = new Date(`${date}T00:00:00`)
  if (Number.isNaN(target.getTime())) return '--'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - today.getTime()) / 86400000)
}
</script>

<style scoped>
.explore-tool-page { gap: 16px; }
.tool-hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding: 18px;
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, color-mix(in srgb, var(--app-green) 18%, var(--panel)), var(--panel));
  border: 1px solid color-mix(in srgb, var(--app-green) 16%, var(--border));
  box-shadow: var(--shadow-sm);
}
.tool-hero h2 { margin: 3px 0 6px; font-size: 24px; line-height: 1.15; }
.tool-hero p { margin: 0; color: var(--muted); line-height: 1.5; }
.tool-hero > span { color: var(--app-green-dark); font-size: 22px; font-weight: 950; white-space: nowrap; }
.tool-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  padding: 4px;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--app-green) 8%, var(--panel));
}
.tool-tabs button {
  min-height: 38px;
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--muted);
  font-weight: 900;
}
.tool-tabs button.active { background: var(--panel); color: var(--app-green-dark); box-shadow: var(--shadow-sm); }
.tool-card-list,
.countdown-stack { display: grid; gap: 10px; }
.tool-list-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 14px;
  border-radius: var(--radius-lg);
  border: 1px solid color-mix(in srgb, var(--app-green) 12%, var(--border));
  background: var(--panel);
  box-shadow: var(--shadow-sm);
}
.tool-list-card > div { min-width: 0; display: flex; align-items: center; gap: 12px; }
.tool-icon {
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 16px;
  background: color-mix(in srgb, var(--tool-color) 12%, #f8fafc);
  color: var(--tool-color);
}
.tool-list-card h3,
.countdown-card h3 { margin: 0; color: var(--text); font-size: 17px; line-height: 1.25; }
.tool-list-card p,
.tool-list-card small,
.countdown-card p { margin: 4px 0 0; color: var(--muted); line-height: 1.35; }
.tool-list-card small { display: block; font-size: 12px; }
.tool-empty-card {
  display: grid;
  gap: 5px;
  padding: 18px;
  border-radius: var(--radius-lg);
  background: var(--panel);
  border: 1px dashed color-mix(in srgb, var(--app-green) 28%, var(--border));
  color: var(--muted);
}
.tool-empty-card strong { color: var(--text); }
.countdown-card {
  display: grid;
  grid-template-columns: 82px minmax(0, 1fr);
  align-items: center;
  gap: 14px;
  padding: 16px;
  border-radius: var(--radius-lg);
  background: var(--panel);
  box-shadow: var(--shadow-sm);
}
.countdown-card > span { color: var(--app-green-dark); font-size: 34px; font-weight: 950; text-align: center; }
.tool-form-card {
  display: grid;
  gap: 14px;
  padding: 16px;
  border-radius: var(--radius-lg);
  border: 1px solid color-mix(in srgb, var(--app-green) 12%, var(--border));
  background: var(--panel);
  box-shadow: var(--shadow-sm);
}
.tool-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.tool-form-grid label { display: grid; gap: 6px; min-width: 0; }
.tool-form-grid span { color: var(--muted); font-size: 12px; font-weight: 800; }
.tool-form-grid :is(input, textarea) {
  width: 100%;
  min-width: 0;
  border: 1px solid color-mix(in srgb, var(--app-green) 12%, var(--border));
  border-radius: 12px;
  background: color-mix(in srgb, var(--panel) 82%, var(--panel-soft));
  color: var(--text);
  font: inherit;
  padding: 10px 12px;
}
.tool-form-wide { grid-column: 1 / -1; }
@container phone-frame (max-width: 390px) {
  .tool-list-card { grid-template-columns: 1fr; }
  .tool-list-card > button { width: 100%; }
  .tool-form-grid { grid-template-columns: 1fr; }
}
</style>
