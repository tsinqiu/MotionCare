<template>
  <div class="page-stack">
    <StateBlock v-if="authSession.loading" title="正在准备记录运动" message="正在确认你的登录状态。" />
    <StateBlock
      v-else-if="authSession.error"
      title="暂时无法记录运动"
      :message="authSession.error"
      action-label="重试"
      tone="danger"
      @action="initAuthSession({ force: true })"
    />
    <StateBlock v-else-if="!authSession.user" title="请先登录" message="登录后可以同步或手工记录运动。" action-label="去登录" @action="router.push('/login')" />

    <template v-else>
      <section class="dark-panel">
        <p class="overline">添加运动记录</p>
        <h2>记录运动</h2>
        <p>选择从 Garmin 同步，或手工补充一次已经完成的运动。</p>
      </section>

      <div class="record-choice-grid">
        <section class="dark-panel record-choice">
          <RefreshCw :size="28" aria-hidden="true" />
          <div><h2>同步 Garmin</h2><p>更新已有设备中的运动、健康与恢复数据。</p></div>
          <RouterLink class="primary-link" to="/me/sync">前往同步</RouterLink>
        </section>
        <section class="dark-panel record-choice">
          <FilePlus2 :size="28" aria-hidden="true" />
          <div><h2>手动添加运动</h2><p>填写类型、时间、距离和心率等基本信息。</p></div>
          <button class="primary-link" type="button" @click="showManualModal = true">填写运动</button>
        </section>
      </div>
    </template>

    <ManualActivityModal
      v-if="showManualModal"
      :save="createManualActivity"
      @close="showManualModal = false"
      @saved="handleSaved"
    />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { FilePlus2, RefreshCw } from '@lucide/vue'
import { useRouter } from 'vue-router'

import ManualActivityModal from '@/components/ManualActivityModal.vue'
import StateBlock from '@/components/StateBlock.vue'
import { createManualActivity } from '@/services/activities'
import { authSession, initAuthSession } from '@/stores/authStore'

const router = useRouter()
const showManualModal = ref(false)

function handleSaved(activity) {
  showManualModal.value = false
  if (activity?.id) router.push(`/activities/${activity.id}`)
  else router.push('/activities')
}
</script>

<style scoped>
.record-choice-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
.record-choice { display: grid; gap: 14px; align-content: start; }
.record-choice .primary-link { justify-self: start; }
@media (max-width: 700px) { .record-choice-grid { grid-template-columns: 1fr; } }
</style>
