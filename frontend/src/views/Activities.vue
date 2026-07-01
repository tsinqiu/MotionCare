<template>
  <div class="page-stack">
    <section class="activities-head">
      <p class="overline">我最近完成了什么</p>
      <h2>最近运动</h2>
    </section>

    <div class="feed-toolbar">
      <div class="feed-toolbar__tabs">
        <SportTabs v-model="filters.activity_type" :items="sportFilters" />
      </div>
      <button type="button" class="filter-btn" :class="{ active: activeFilterCount }" @click="filterOpen = true">
        <SlidersHorizontal :size="16" />
        筛选
        <span v-if="activeFilterCount" class="filter-badge">{{ activeFilterCount }}</span>
      </button>
    </div>

    <StateBlock
      v-if="loading"
      title="正在加载运动记录"
      message="正在读取你的运动历史。"
    />
    <StateBlock
      v-else-if="error"
      title="运动记录加载失败"
      message="连接暂时不可用，稍后再试一次。"
      action-label="重试"
      tone="danger"
      @action="load"
    />
    <StateBlock
      v-else-if="activities.length === 0"
      title="没有找到运动"
      message="当前筛选条件没有匹配记录，也可以同步或手工添加一次运动。"
      action-label="记录运动"
      @action="router.push('/record')"
    />

    <section v-else class="activity-list-section">
      <div class="list-meta">
        <span>{{ meta.total || activities.length }} 条记录</span>
        <span>第 {{ meta.page || 1 }} / {{ meta.totalPages || 1 }} 页</span>
      </div>
      <div class="activity-card-grid">
        <ActivityCard
          v-for="activity in activities"
          :key="activity.id"
          :activity="activity"
          @select="goToActivity"
        >
          <template #actions>
            <button v-if="canManageManualActivity(activity)" type="button" @click.stop="openEdit(activity)">编辑</button>
            <button v-if="canManageManualActivity(activity)" type="button" class="danger-action" @click.stop="removeManual(activity)">删除</button>
          </template>
        </ActivityCard>
      </div>

      <div class="pagination-row">
        <button type="button" :disabled="filters.page <= 1" @click="filters.page -= 1">上一页</button>
        <button type="button" :disabled="filters.page >= (meta.totalPages || 1)" @click="filters.page += 1">下一页</button>
      </div>
    </section>

    <van-popup v-model:show="filterOpen" position="bottom" round :teleport="null">
      <div class="filter-sheet">
        <div class="filter-sheet__handle" aria-hidden="true"></div>
        <h3>筛选运动</h3>
        <div class="filter-grid">
          <label>
            <span>关键词</span>
            <input v-model.trim="filters.keyword" placeholder="地点 / 名称 / 类型" />
          </label>
          <label>
            <span>开始日期</span>
            <input v-model="filters.start_date" type="date" />
          </label>
          <label>
            <span>结束日期</span>
            <input v-model="filters.end_date" type="date" />
          </label>
          <label>
            <span>排序</span>
            <select v-model="filters.sort_by">
              <option value="local_start_time">时间</option>
              <option value="distance_m">距离</option>
              <option value="duration_s">时长</option>
              <option value="avg_heart_rate_bpm">平均心率</option>
              <option value="activity_training_load">训练负荷</option>
            </select>
          </label>
          <label>
            <span>顺序</span>
            <select v-model="filters.sort_order">
              <option value="desc">降序</option>
              <option value="asc">升序</option>
            </select>
          </label>
        </div>
        <div class="filter-sheet__actions">
          <van-button block plain @click="resetFilters">重置</van-button>
          <van-button block type="primary" @click="filterOpen = false">查看结果</van-button>
        </div>
      </div>
    </van-popup>

    <ManualActivityModal
      v-if="modalOpen"
      :activity="editingActivity"
      :save="saveManualActivity"
      @close="closeModal"
      @saved="handleSaved"
    />
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { SlidersHorizontal } from '@lucide/vue'

import ActivityCard from '@/components/ActivityCard.vue'
import ManualActivityModal from '@/components/ManualActivityModal.vue'
import SportTabs from '@/components/SportTabs.vue'
import StateBlock from '@/components/StateBlock.vue'
import { sportFilters } from '@/constants/sports'
import { deleteManualActivity, getActivityPage, updateManualActivity } from '@/services/activities'
import { authSession, hasAuthToken, normalizeRedirect } from '@/stores/authStore'

const router = useRouter()
const activities = ref([])
const meta = ref({})
const error = ref('')
const loading = ref(false)
const modalOpen = ref(false)
const editingActivity = ref(null)
const filterOpen = ref(false)
const isAdmin = computed(() => authSession.user?.role === 'admin')

const filters = reactive({
  page: 1,
  page_size: 12,
  activity_type: 'all',
  keyword: '',
  start_date: '',
  end_date: '',
  sort_by: 'local_start_time',
  sort_order: 'desc',
})

const activeFilterCount = computed(() => {
  let count = 0
  if (filters.keyword) count += 1
  if (filters.start_date) count += 1
  if (filters.end_date) count += 1
  if (filters.sort_by !== 'local_start_time' || filters.sort_order !== 'desc') count += 1
  return count
})

function resetFilters() {
  filters.keyword = ''
  filters.start_date = ''
  filters.end_date = ''
  filters.sort_by = 'local_start_time'
  filters.sort_order = 'desc'
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const envelope = await getActivityPage(filters)
    activities.value = envelope.data
    meta.value = envelope.meta
  } catch (err) {
    error.value = err instanceof Error ? err.message : '活动列表加载失败'
  } finally {
    loading.value = false
  }
}

function goToActivity(activity) {
  router.push(`/activities/${activity.id}`)
}

function canManageManualActivity(activity) {
  if (!activity?.is_manual || !authSession.user) return false
  return isAdmin.value || Number(activity.ownerUserId) === Number(authSession.user.id)
}

function openEdit(activity) {
  if (!canManageManualActivity(activity)) {
    error.value = '无法编辑不属于你的运动记录'
    return
  }
  if (!hasAuthToken()) {
    error.value = '请先登录后再编辑运动'
    router.push({ name: 'login', query: { redirect: normalizeRedirect(router.currentRoute.value.fullPath) } })
    return
  }
  editingActivity.value = activity
  modalOpen.value = true
}

async function removeManual(activity) {
  if (!canManageManualActivity(activity)) {
    error.value = '无法删除不属于你的运动记录'
    return
  }
  if (!window.confirm('确定删除这条运动记录吗？')) return
  try {
    await deleteManualActivity(activity.id)
    await load()
  } catch (err) {
    error.value = err instanceof Error ? err.message : '删除失败'
  }
}

function closeModal() {
  modalOpen.value = false
}

async function saveManualActivity(payload) {
  return updateManualActivity(editingActivity.value.id, payload)
}

async function handleSaved() {
  closeModal()
  await load()
}

watch(
  filters,
  () => {
    if (filters.page < 1) filters.page = 1
    load()
  },
  { deep: true, immediate: true },
)
</script>

<style scoped>
.activities-head { display: flex; flex-direction: column; gap: 2px; }
.activities-head .overline { margin: 0; }
.activities-head h2 { margin: 0; }

.feed-toolbar {
  position: sticky;
  top: -1px;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  background: var(--bg);
}
.feed-toolbar__tabs { flex: 1 1 auto; min-width: 0; overflow-x: auto; scrollbar-width: none; }
.feed-toolbar__tabs::-webkit-scrollbar { display: none; }

.filter-btn {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--border);
  background: var(--panel);
  color: var(--text);
  font-weight: 600;
  font-size: 13px;
}
.filter-btn.active { border-color: var(--green); color: var(--green-strong); }
.filter-badge {
  display: inline-grid;
  place-items: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: var(--radius-pill);
  background: var(--green);
  color: #04240f;
  font-size: 11px;
}

.list-meta {
  display: flex;
  justify-content: space-between;
  color: var(--muted);
  font-size: 13px;
  margin-bottom: 12px;
}
.activity-card-grid { display: grid; gap: 12px; }
.pagination-row { display: flex; gap: 12px; margin-top: 16px; }
.pagination-row button {
  flex: 1;
  padding: 11px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  background: var(--panel);
  color: var(--text);
  font-weight: 600;
}

.filter-sheet { padding: 10px 16px calc(20px + var(--safe-bottom)); }
.filter-sheet__handle {
  width: 40px;
  height: 4px;
  border-radius: var(--radius-pill);
  background: var(--border-strong);
  margin: 6px auto 14px;
}
.filter-sheet h3 { margin: 0 0 14px; }
.filter-sheet .filter-grid { display: grid; gap: 14px; }
.filter-sheet label { display: grid; gap: 6px; font-size: 13px; color: var(--muted); }
.filter-sheet input,
.filter-sheet select {
  padding: 11px 12px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--panel-soft);
  color: var(--text);
}
.filter-sheet__actions { display: flex; gap: 12px; margin-top: 20px; }
</style>
