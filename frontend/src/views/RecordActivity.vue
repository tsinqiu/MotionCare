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
    <StateBlock v-else-if="!authSession.user" title="请先登录" message="登录后可以实时或手工记录运动。" action-label="去登录" @action="router.push('/login')" />

    <StartWorkout v-else @recording-state-change="liveRecording = $event" />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import StateBlock from '@/components/StateBlock.vue'
import { authSession, initAuthSession } from '@/stores/authStore'
import StartWorkout from '@/views/StartWorkout.vue'

const router = useRouter()
const liveRecording = ref(false)
</script>
