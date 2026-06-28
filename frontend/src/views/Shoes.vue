<template>
  <div class="page-stack">
    <section class="dark-panel">
      <div class="section-heading">
        <div><h2>我的跑鞋</h2></div>
        <button type="button" class="primary-link" @click="showForm = true">添加跑鞋</button>
      </div>

      <form v-if="showForm" class="shoe-form" @submit.prevent="save">
        <input v-model="form.name" placeholder="名称（必填）" required />
        <input v-model="form.brand" placeholder="品牌" />
        <input v-model="form.model" placeholder="型号" />
        <input v-model="form.purchaseDate" type="date" placeholder="购买日期" />
        <div class="shoe-form-actions">
          <button type="submit" class="primary-link">保存</button>
          <button type="button" @click="showForm = false">取消</button>
        </div>
      </form>

      <div v-if="!shoes.length" class="empty-state">暂无跑鞋，添加一双吧</div>
      <div v-else class="shoe-list">
        <div v-for="s in shoes" :key="s.id" class="shoe-card" :class="{ retired: s.isRetired }">
          <div class="shoe-info">
            <strong>{{ s.name }}</strong>
            <span v-if="s.brand || s.model" class="shoe-detail">{{ [s.brand, s.model].filter(Boolean).join(' ') }}</span>
            <div class="shoe-stats">
              <span>{{ s.distanceKm?.toFixed(0) || 0 }} km</span>
              <span>{{ s.activityCount || 0 }} 次</span>
              <span v-if="s.lastUsed">最近 {{ new Date(s.lastUsed).toLocaleDateString('zh-CN') }}</span>
            </div>
          </div>
          <div class="shoe-actions">
            <button v-if="!s.isRetired" type="button" @click="retire(s.id)">退役</button>
            <button type="button" @click="remove(s.id)">删除</button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { apiClient } from '@/services/http'

const shoes = ref([])
const showForm = ref(false)
const form = ref({ name: '', brand: '', model: '', purchaseDate: '' })

async function load() {
  const { data } = await apiClient.get('/shoes')
  shoes.value = data || []
}

async function save() {
  await apiClient.post('/shoes', form.value)
  showForm.value = false; form.value = { name: '', brand: '', model: '', purchaseDate: '' }; load()
}

async function retire(id) {
  await apiClient.patch(`/shoes/${id}`, { isRetired: true })
  load()
}

async function remove(id) {
  if (!confirm('确定删除？')) return
  await apiClient.delete(`/shoes/${id}`)
  load()
}

onMounted(load)
</script>

<style scoped>
.shoe-form { display: flex; flex-wrap: wrap; gap: 8px; padding: 16px 0; }
.shoe-form input { flex: 1; min-width: 120px; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border, #333); background: var(--bg-elevated, #1a1a2e); color: inherit; }
.shoe-form-actions { display: flex; gap: 8px; width: 100%; }
.shoe-list { display: flex; flex-direction: column; gap: 8px; }
.shoe-card { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-radius: 10px; background: var(--bg-elevated, #1a1a2e); }
.shoe-card.retired { opacity: 0.5; }
.shoe-info { display: flex; flex-direction: column; gap: 2px; }
.shoe-detail { font-size: 12px; color: var(--text-muted, #888); }
.shoe-stats { display: flex; gap: 12px; font-size: 12px; color: var(--text-muted, #888); margin-top: 4px; }
.shoe-actions { display: flex; gap: 8px; }
.shoe-actions button { padding: 4px 12px; border-radius: 6px; border: 1px solid var(--border, #333); background: transparent; color: inherit; cursor: pointer; }
.empty-state { padding: 32px; text-align: center; color: var(--text-muted, #888); }
</style>
