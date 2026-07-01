<template>
  <div class="page-stack">
    <section class="dark-panel">
      <div class="section-heading">
        <div><h2>我的跑鞋</h2></div>
        <button type="button" class="primary-link" @click="openCreate">添加跑鞋</button>
      </div>

      <form v-if="showForm" class="shoe-form" @submit.prevent="save">
        <input v-model="form.name" placeholder="名称（必填）" required />
        <input v-model="form.brand" placeholder="品牌" />
        <input v-model="form.model" placeholder="型号" />
        <input v-model="form.purchaseDate" type="date" placeholder="购买日期" />
        <input v-model.number="form.targetDistanceKm" type="number" step="1" min="0" placeholder="目标里程 (km)" />
        <input v-model.number="form.initialDistanceKm" type="number" step="1" min="0" placeholder="初始里程 (km)" />
        <input v-model.number="form.price" type="number" step="0.01" min="0" placeholder="价格 (元)" />
        <label class="photo-upload-label">
          <span>照片</span>
          <input type="file" accept="image/*" @change="onFormPhotoChange" />
        </label>
        <div class="shoe-form-actions">
          <button type="submit" class="primary-link">保存</button>
          <button type="button" @click="showForm = false">取消</button>
        </div>
      </form>

      <StateBlock v-if="loading" title="正在加载跑鞋" message="正在读取跑鞋和累计里程。" />
      <StateBlock v-else-if="error" title="跑鞋加载失败" :message="error" action-label="重试" tone="danger" @action="load" />
      <StateBlock v-else-if="!shoes.length" title="还没有跑鞋" message="添加常用跑鞋后，可以跟踪里程和使用状态。" action-label="添加跑鞋" @action="openCreate" />
      <div v-else class="shoe-list">
        <div
          v-for="s in shoes"
          :key="s.id"
          class="shoe-card"
          :class="{ retired: s.isRetired, selected: selectedShoe?.id === s.id }"
          @click="selectShoe(s)"
        >
          <img v-if="s.photoPath" :src="photoUrl(s.photoPath)" class="shoe-photo" alt="" />
          <div class="shoe-info">
            <strong>{{ s.name }}</strong>
            <span v-if="s.brand || s.model" class="shoe-detail">{{ [s.brand, s.model].filter(Boolean).join(' ') }}</span>
            <div class="shoe-stats">
              <span>已跑 {{ displayKm(s) }} km</span>
              <span>{{ s.activityCount || 0 }} 次</span>
              <span v-if="s.lastUsed">最近 {{ new Date(s.lastUsed).toLocaleDateString('zh-CN') }}</span>
              <span v-if="s.avgPaceSecPerKm">{{ paceText(s) }}</span>
              <span v-if="s.targetDistanceKm">目标 {{ Number(s.targetDistanceKm).toFixed(0) }} km</span>
              <span v-if="s.initialDistanceKm">初始 {{ Number(s.initialDistanceKm).toFixed(0) }} km</span>
              <span v-if="s.price">{{ Number(s.price).toFixed(0) }} 元</span>
            </div>
          </div>
          <div class="shoe-actions">
            <button type="button" @click.stop="openEdit(s)">编辑</button>
            <button v-if="!s.isRetired" type="button" @click.stop="retire(s.id)">退役</button>
            <button type="button" @click.stop="remove(s.id)">删除</button>
          </div>
        </div>
      </div>
    </section>

    <section v-if="selectedShoe" class="dark-panel">
      <div class="section-heading">
        <div><h2>{{ selectedShoe.name }} 的活动记录</h2></div>
        <button class="primary-link" type="button" @click="closeActivities">关闭</button>
      </div>
      <div v-if="shoeActivitiesLoading" class="empty-state">加载中...</div>
      <div v-else-if="shoeActivitiesError" class="empty-state">{{ shoeActivitiesError }}</div>
      <div v-else-if="!shoeActivities.length" class="empty-state">该跑鞋暂无绑定的活动记录</div>
      <div v-else class="shoe-activities-list">
        <ActivityCard
          v-for="act in shoeActivities"
          :key="act.id"
          :activity="act"
          @select="goToActivity"
        />
      </div>
    </section>

    <Teleport to="body">
      <div v-if="editTarget" class="modal-overlay" @click.self="closeEdit">
        <div class="modal-content">
          <h3>编辑跑鞋</h3>
          <form @submit.prevent="saveEdit">
            <label>名称 <input v-model="editForm.name" required /></label>
            <label>品牌 <input v-model="editForm.brand" /></label>
            <label>型号 <input v-model="editForm.model" /></label>
            <label>购买日期 <input v-model="editForm.purchaseDate" type="date" /></label>
            <label>目标里程 (km) <input v-model.number="editForm.targetDistanceKm" type="number" step="1" min="0" /></label>
            <label>初始里程 (km) <input v-model.number="editForm.initialDistanceKm" type="number" step="1" min="0" /></label>
            <label>价格 (元) <input v-model.number="editForm.price" type="number" step="0.01" min="0" /></label>
            <label>照片 <input type="file" accept="image/*" @change="onEditPhotoChange" /></label>
            <img v-if="editPhotoPreview || editForm.photoPath" :src="editPhotoPreview || photoUrl(editForm.photoPath)" class="edit-photo-preview" />
            <div class="modal-actions">
              <button type="submit" class="primary-link" :disabled="isSavingEdit">{{ isSavingEdit ? '保存中' : '保存' }}</button>
              <button type="button" @click="closeEdit">取消</button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { apiClient } from '@/services/http'
import { normalizeActivity } from '@/services/activities'
import ActivityCard from '@/components/ActivityCard.vue'
import StateBlock from '@/components/StateBlock.vue'

const router = useRouter()
const shoes = ref([])
const showForm = ref(false)
const form = ref({ name: '', brand: '', model: '', purchaseDate: '', targetDistanceKm: null, initialDistanceKm: null, price: null })
const formPhoto = ref(null)
const selectedShoe = ref(null)
const shoeActivities = ref([])
const shoeActivitiesLoading = ref(false)
const shoeActivitiesError = ref('')
const editTarget = ref(null)
const editForm = ref({ name: '', brand: '', model: '', purchaseDate: '', targetDistanceKm: null, initialDistanceKm: null, price: null, photoPath: '' })
const editPhoto = ref(null)
const editPhotoPreview = ref('')
const isSavingEdit = ref(false)
const loading = ref(false)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    const { data } = await apiClient.get('/shoes')
    shoes.value = data || []
  } catch (err) {
    shoes.value = []
    error.value = err instanceof Error ? err.message : '跑鞋加载失败'
  } finally {
    loading.value = false
  }
}

function photoUrl(path) {
  if (!path) return ''
  const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8089/api'
  return base.replace(/\/api$/, '') + path
}

function displayKm(s) {
  const km = s.boundDistanceKm ?? s.distanceKm ?? 0
  return Number(km).toFixed(0)
}

function paceText(s) {
  if (!s.avgPaceSecPerKm) return ''
  const pace = Number(s.avgPaceSecPerKm)
  const min = Math.floor(pace / 60)
  const sec = Math.round(pace % 60)
  return `配速 ${min}:${String(sec).padStart(2, '0')} /km`
}

function onFormPhotoChange(e) {
  formPhoto.value = e.target.files?.[0] || null
}

function openCreate() {
  form.value = { name: '', brand: '', model: '', purchaseDate: '', targetDistanceKm: null, initialDistanceKm: null, price: null }
  formPhoto.value = null
  showForm.value = true
}

async function save() {
  error.value = ''
  try {
    const name = form.value.name?.trim()
    const createRes = await apiClient.post('/shoes', {
      name,
      brand: form.value.brand || null,
      model: form.value.model || null,
      purchaseDate: form.value.purchaseDate || null,
      targetDistanceKm: form.value.targetDistanceKm || null,
      initialDistanceKm: form.value.initialDistanceKm || null,
      price: form.value.price || null,
    })
    const shoeId = createRes.data?.id

    if (shoeId && formPhoto.value) {
      const photoForm = new FormData()
      photoForm.append('photo', formPhoto.value)
      await apiClient.post(`/shoes/${shoeId}/photo`, photoForm)
    }

    showForm.value = false
    formPhoto.value = null
    await load()
  } catch (err) {
    error.value = err instanceof Error ? err.message : '跑鞋保存失败'
  }
}

function openEdit(s) {
  editTarget.value = s
  editForm.value = {
    name: s.name || '',
    brand: s.brand || '',
    model: s.model || '',
    purchaseDate: s.purchaseDate || '',
    targetDistanceKm: s.targetDistanceKm ?? null,
    initialDistanceKm: s.initialDistanceKm ?? null,
    price: s.price ?? null,
    photoPath: s.photoPath || '',
  }
  editPhoto.value = null
  editPhotoPreview.value = ''
}

function onEditPhotoChange(e) {
  const file = e.target.files?.[0]
  editPhoto.value = file || null
  if (file) {
    editPhotoPreview.value = URL.createObjectURL(file)
  }
}

async function saveEdit() {
  if (!editTarget.value) return
  isSavingEdit.value = true
  try {
    await apiClient.patch(`/shoes/${editTarget.value.id}`, {
      name: editForm.value.name?.trim() || undefined,
      brand: editForm.value.brand || undefined,
      model: editForm.value.model || undefined,
      purchaseDate: editForm.value.purchaseDate || undefined,
      targetDistanceKm: editForm.value.targetDistanceKm ?? undefined,
      initialDistanceKm: editForm.value.initialDistanceKm ?? undefined,
      price: editForm.value.price ?? undefined,
    })

    if (editPhoto.value) {
      const photoForm = new FormData()
      photoForm.append('photo', editPhoto.value)
      await apiClient.post(`/shoes/${editTarget.value.id}/photo`, photoForm)
    }

    closeEdit()
    load()
  } catch (err) {
    error.value = err instanceof Error ? err.message : '保存失败'
  } finally {
    isSavingEdit.value = false
  }
}

function closeEdit() {
  editTarget.value = null
  editPhoto.value = null
  editPhotoPreview.value = ''
}

async function retire(id) {
  error.value = ''
  try {
    await apiClient.patch(`/shoes/${id}`, { isRetired: true })
    await load()
  } catch (err) {
    error.value = err instanceof Error ? err.message : '跑鞋状态更新失败'
  }
}

async function remove(id) {
  if (!confirm('确定删除？')) return
  error.value = ''
  try {
    await apiClient.delete(`/shoes/${id}`)
    selectedShoe.value = null
    shoeActivities.value = []
    shoeActivitiesError.value = ''
    await load()
  } catch (err) {
    error.value = err instanceof Error ? err.message : '跑鞋删除失败'
  }
}

async function selectShoe(s) {
  if (selectedShoe.value?.id === s.id) {
    closeActivities()
    return
  }
  selectedShoe.value = s
  shoeActivitiesLoading.value = true
  shoeActivitiesError.value = ''
  try {
    const response = await apiClient.get(`/shoes/${s.id}/activities`)
    const list = Array.isArray(response.data) ? response.data : []
    shoeActivities.value = list.map(normalizeActivity)
  } catch (err) {
    shoeActivities.value = []
    shoeActivitiesError.value = err instanceof Error ? err.message : '加载失败'
  } finally {
    shoeActivitiesLoading.value = false
  }
}

function closeActivities() {
  selectedShoe.value = null
  shoeActivities.value = []
  shoeActivitiesError.value = ''
}

function goToActivity(activity) {
  router.push(`/activities/${activity.id}`)
}

onMounted(load)
</script>

<style scoped>
.shoe-form { display: flex; flex-wrap: wrap; gap: 8px; padding: 16px 0; }
.shoe-form input { flex: 1; min-width: 120px; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border, #333); background: var(--bg-elevated, #1a1a2e); color: inherit; }
.shoe-form-actions { display: flex; gap: 8px; width: 100%; }
.photo-upload-label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--text-muted, #888); }
.shoe-list { display: flex; flex-direction: column; gap: 8px; }
.shoe-card { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-radius: 10px; background: var(--bg-elevated, #1a1a2e); cursor: pointer; gap: 12px; }
.shoe-card.retired { opacity: 0.5; }
.shoe-card.selected { border: 1px solid var(--primary, #21d47b); }
.shoe-card:hover { background: var(--bg-hover, #222); }
.shoe-photo { width: 48px; height: 48px; border-radius: 8px; object-fit: cover; flex-shrink: 0; }
.shoe-info { display: flex; flex-direction: column; gap: 2px; flex: 1; }
.shoe-detail { font-size: 12px; color: var(--text-muted, #888); }
.shoe-stats { display: flex; flex-wrap: wrap; gap: 8px; font-size: 12px; color: var(--text-muted, #888); margin-top: 4px; }
.shoe-actions { display: flex; gap: 8px; }
.shoe-actions button { padding: 4px 12px; border-radius: 6px; border: 1px solid var(--border, #333); background: transparent; color: inherit; cursor: pointer; white-space: nowrap; }
.empty-state { padding: 32px; text-align: center; color: var(--text-muted, #888); }
.shoe-activities-list { display: flex; flex-direction: column; gap: 8px; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.modal-content { background: var(--bg-elevated, #1a1a2e); border-radius: 12px; padding: 24px; width: 90%; max-width: 480px; max-height: 90vh; overflow-y: auto; }
.modal-content h3 { margin: 0 0 16px; }
.modal-content label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--text-muted, #888); margin-bottom: 12px; }
.modal-content input { padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border, #333); background: var(--bg-card, #16162a); color: inherit; }
.edit-photo-preview { max-width: 120px; max-height: 120px; border-radius: 8px; object-fit: cover; margin-top: 4px; }
.modal-actions { display: flex; gap: 8px; margin-top: 16px; }
</style>
