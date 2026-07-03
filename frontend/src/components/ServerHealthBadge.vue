<template>
  <section class="server-health-badge" :class="`server-health-badge--${tone}`" aria-live="polite">
    <span class="server-health-badge__dot" />
    <div>
      <small>数据服务</small>
      <strong>{{ label }}</strong>
    </div>
    <em>{{ detail }}</em>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'

import { getServerHealth } from '@/services/system'

const status = ref('checking')
const detail = ref('正在连接服务')

const tone = computed(() => {
  if (status.value === 'online') return 'online'
  if (status.value === 'degraded') return 'degraded'
  if (status.value === 'offline') return 'offline'
  return 'checking'
})

const label = computed(() => {
  if (status.value === 'online') return '服务在线'
  if (status.value === 'degraded') return '部分服务可用'
  if (status.value === 'offline') return '服务暂不可用'
  return '连接中'
})

onMounted(async () => {
  try {
    const health = await getServerHealth()
    if (health?.status === 'ok' && health.database?.ok) {
      status.value = 'online'
      detail.value = '数据可用'
      return
    }
    status.value = 'degraded'
    detail.value = '部分数据暂不可用'
  } catch {
    status.value = 'offline'
    detail.value = '请检查网络后重试'
  }
})
</script>
