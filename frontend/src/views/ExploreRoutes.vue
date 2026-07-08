<template>
  <div class="page-stack route-library-page">
    <section class="route-library-hero">
      <div>
        <p class="overline">Route Library</p>
        <h2>运动路线</h2>
        <p>从历史轨迹、热门路线或自定义地点中建立自己的路线库。</p>
      </div>
      <button type="button" class="secondary-link" @click="loadActivities">刷新历史</button>
    </section>

    <nav class="tool-tabs" aria-label="路线视图">
      <button v-for="tab in tabs" :key="tab.key" type="button" :class="{ active: activeTab === tab.key }" @click="activeTab = tab.key">
        {{ tab.label }}
      </button>
    </nav>

    <section v-if="activeTab === 'history'" class="route-section">
      <StateBlock v-if="loading" title="正在加载历史路线" message="正在读取最近运动记录。" />
      <StateBlock v-else-if="error" title="历史路线加载失败" :message="error" action-label="重试" tone="danger" @action="loadActivities" />
      <article v-else-if="!historyRoutes.length" class="route-empty-card">
        <strong>暂无可用历史路线</strong>
        <span>完成带 GPS 轨迹的户外运动后，可在这里选择为自选路线。</span>
      </article>
      <article v-for="route in historyRoutes" v-else :key="route.id" class="route-card">
        <div>
          <h3>{{ route.name }}</h3>
          <p>{{ route.location }} · {{ route.distance }} · {{ route.date }}</p>
        </div>
        <div class="route-card__actions">
          <button type="button" class="secondary-link" @click="previewHistoryRoute(route)">查看</button>
          <button type="button" class="primary-link" @click="saveRoute(route)">收藏</button>
        </div>
      </article>
    </section>

    <section v-else-if="activeTab === 'popular'" class="route-section">
      <article v-for="route in popularRoutes" :key="route.id" class="route-card">
        <div>
          <h3>{{ route.name }}</h3>
          <p>{{ route.location }} · {{ route.distance }} · {{ route.type }}</p>
          <small>{{ route.note }}</small>
        </div>
        <button type="button" class="primary-link" @click="saveRoute(route)">收藏</button>
      </article>
    </section>

    <section v-else class="route-section">
      <article v-if="!myRoutes.length" class="route-empty-card">
        <strong>暂无我的路线</strong>
        <span>从历史路线或热门路线收藏，也可以在下方自定义。</span>
      </article>
      <article v-for="route in myRoutes" :key="route.id" class="route-card">
        <div>
          <h3>{{ route.name }}</h3>
          <p>{{ route.location }} · {{ route.distance }} · {{ route.type }}</p>
          <small>{{ route.note || '自选路线' }}</small>
        </div>
        <div class="route-card__actions">
          <button v-if="route.activityId" type="button" class="secondary-link" @click="previewHistoryRoute(route)">查看</button>
          <button type="button" class="danger-link" @click="removeRoute(route.id)">移除</button>
        </div>
      </article>
    </section>

    <RoutePreview v-if="selectedPoints.length || previewRoute" :points="selectedPoints" />

    <form class="route-form-card" @submit.prevent="saveCustomRoute">
      <div class="section-heading">
        <div>
          <p class="overline">Custom</p>
          <h2>自定义路线</h2>
        </div>
      </div>
      <div class="route-form-grid">
        <label>
          <span>路线名</span>
          <input v-model.trim="draft.name" type="text" placeholder="例如 周末滨江长跑" required />
        </label>
        <label>
          <span>地点</span>
          <input v-model.trim="draft.location" type="text" placeholder="城市 / 公园 / 道路" />
        </label>
        <label>
          <span>距离</span>
          <input v-model.trim="draft.distance" type="text" placeholder="例如 10 km" />
        </label>
        <label>
          <span>类型</span>
          <select v-model="draft.type">
            <option>跑步</option>
            <option>骑行</option>
            <option>步行</option>
          </select>
        </label>
        <label class="route-form-wide">
          <span>备注</span>
          <textarea v-model.trim="draft.note" rows="3" placeholder="路况、补给、坡度或集合点" />
        </label>
      </div>
      <button class="primary-link" type="submit">保存路线</button>
    </form>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { showToast } from 'vant'

import RoutePreview from '@/components/RoutePreview.vue'
import StateBlock from '@/components/StateBlock.vue'
import { getActivityPage, getTrackPoints } from '@/services/activities'

const STORAGE_KEY = 'motioncare-my-routes'

const tabs = [
  { key: 'history', label: '历史路线' },
  { key: 'popular', label: '热门路线' },
  { key: 'mine', label: '我的路线' },
]

const popularRoutes = [
  { id: 'popular-riverside-10k', name: '城市滨江 10K', location: '滨江绿道', distance: '10 km', type: '跑步', note: '平路为主，适合节奏跑和轻松跑。' },
  { id: 'popular-park-5k', name: '公园 5K 环线', location: '城市公园', distance: '5 km', type: '跑步', note: '适合恢复跑、测试跑和新手路线。' },
  { id: 'popular-lake-half', name: '环湖半马路线', location: '湖区绿道', distance: '21.1 km', type: '跑步', note: '补给点明确，适合半马长距离。' },
  { id: 'popular-century-ride', name: '郊外百公里骑行', location: '郊外公路', distance: '100 km', type: '骑行', note: '长距离耐力骑模板，需提前规划补给。' },
]

const activeTab = ref('history')
const activities = ref([])
const loading = ref(false)
const error = ref('')
const myRoutes = ref(loadItems())
const previewRoute = ref(null)
const selectedPoints = ref([])
const draft = reactive({ name: '', location: '', distance: '', type: '跑步', note: '' })

const historyRoutes = computed(() => activities.value
  .filter((activity) => isOutdoorRoute(activity))
  .map((activity) => ({
    id: `activity-${activity.id}`,
    activityId: activity.id,
    name: activity.activity_name || activity.activity_type || '历史运动路线',
    location: activity.location_name || activity.locationName || '历史运动',
    distance: formatDistance(activity.distance_m ?? activity.distanceM),
    type: activity.activity_type || activity.activityType || '运动',
    date: formatDate(activity.local_start_time || activity.start_time_utc || activity.startTimeUtc),
    note: '来自历史 GPS 运动记录',
  })))

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
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(myRoutes.value))
}

function isOutdoorRoute(activity) {
  const type = `${activity.activity_type || activity.activityType || ''}`.toLowerCase()
  const name = `${activity.activity_name || activity.activityName || ''}`
  const hasDistance = Number(activity.distance_m ?? activity.distanceM) > 0
  const likelyOutdoor = !type.includes('treadmill') && !name.includes('室内')
  return activity.id && hasDistance && likelyOutdoor
}

function formatDistance(value) {
  const meters = Number(value)
  if (!Number.isFinite(meters) || meters <= 0) return '--'
  return `${(meters / 1000).toFixed(meters >= 10000 ? 1 : 2)} km`
}

function formatDate(value) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`
}

async function loadActivities() {
  loading.value = true
  error.value = ''
  try {
    const page = await getActivityPage({ page_size: 80, sort_by: 'local_start_time', sort_order: 'desc' })
    activities.value = page.data || []
  } catch (err) {
    error.value = err instanceof Error ? err.message : '历史路线加载失败'
  } finally {
    loading.value = false
  }
}

async function previewHistoryRoute(route) {
  if (!route.activityId) {
    selectedPoints.value = []
    previewRoute.value = route
    showToast('该路线暂无轨迹点')
    return
  }
  previewRoute.value = route
  selectedPoints.value = []
  try {
    selectedPoints.value = await getTrackPoints(route.activityId)
    if (!selectedPoints.value.length) showToast('该运动暂无可用轨迹点')
  } catch (err) {
    showToast(err instanceof Error ? err.message : '轨迹加载失败')
  }
}

function saveRoute(route) {
  if (myRoutes.value.some((item) => item.id === route.id)) {
    showToast('路线已在我的路线中')
    return
  }
  myRoutes.value.unshift({ ...route })
  persist()
  showToast('已收藏路线')
}

function removeRoute(id) {
  myRoutes.value = myRoutes.value.filter((route) => route.id !== id)
  persist()
}

function saveCustomRoute() {
  if (!draft.name) {
    showToast('请填写路线名')
    return
  }
  myRoutes.value.unshift({ ...draft, id: `custom-route-${Date.now()}` })
  persist()
  Object.assign(draft, { name: '', location: '', distance: '', type: '跑步', note: '' })
  activeTab.value = 'mine'
  showToast('路线已保存')
}

onMounted(loadActivities)
</script>

<style scoped>
.route-library-page { gap: 16px; }
.route-library-hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  padding: 18px;
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, color-mix(in srgb, var(--app-green) 18%, var(--panel)), var(--panel));
  border: 1px solid color-mix(in srgb, var(--app-green) 16%, var(--border));
  box-shadow: var(--shadow-sm);
}
.route-library-hero h2 { margin: 3px 0 6px; color: var(--text); font-size: 24px; line-height: 1.15; }
.route-library-hero p { margin: 0; color: var(--muted); line-height: 1.5; }
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
.route-section { display: grid; gap: 10px; }
.route-card,
.route-empty-card,
.route-form-card {
  padding: 16px;
  border-radius: var(--radius-lg);
  background: var(--panel);
  border: 1px solid color-mix(in srgb, var(--app-green) 12%, var(--border));
  box-shadow: var(--shadow-sm);
}
.route-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
}
.route-card h3 { margin: 0; color: var(--text); font-size: 17px; line-height: 1.25; }
.route-card p,
.route-card small,
.route-empty-card span { display: block; margin: 5px 0 0; color: var(--muted); line-height: 1.4; }
.route-card__actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.route-empty-card { display: grid; gap: 5px; border-style: dashed; color: var(--muted); }
.route-empty-card strong { color: var(--text); }
.route-form-card { display: grid; gap: 14px; }
.route-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.route-form-grid label { display: grid; gap: 6px; min-width: 0; }
.route-form-grid span { color: var(--muted); font-size: 12px; font-weight: 800; }
.route-form-grid :is(input, select, textarea) {
  width: 100%;
  min-width: 0;
  border: 1px solid color-mix(in srgb, var(--app-green) 12%, var(--border));
  border-radius: 12px;
  background: color-mix(in srgb, var(--panel) 82%, var(--panel-soft));
  color: var(--text);
  font: inherit;
  padding: 10px 12px;
}
.route-form-wide { grid-column: 1 / -1; }
@container phone-frame (max-width: 390px) {
  .route-library-hero,
  .route-card { grid-template-columns: 1fr; align-items: stretch; }
  .route-card__actions,
  .route-card__actions button,
  .route-library-hero button { width: 100%; }
  .route-form-grid { grid-template-columns: 1fr; }
}
</style>
