<template>
  <section
    class="server-health-badge"
    :class="[`server-health-badge--${tone}`, { 'server-health-badge--compact': compact }]"
    aria-live="polite"
  >
    <span class="server-health-badge__dot" />
    <div>
      <small v-if="showCaption">数据服务</small>
      <strong>{{ label }}</strong>
    </div>
    <em v-if="showDetail">{{ detail }}</em>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'

import { getServerHealth } from '@/services/system'

defineProps({
  compact: {
    type: Boolean,
    default: false,
  },
  showCaption: {
    type: Boolean,
    default: true,
  },
  showDetail: {
    type: Boolean,
    default: true,
  },
})

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

<style scoped>
.server-health-badge--compact {
  grid-template-columns: auto minmax(0, 1fr);
  padding: 11px 14px;
}

.server-health-badge--compact div {
  align-items: start;
}

.server-health-badge--compact strong {
  font-size: 16px;
  line-height: 1.2;
}
</style>
