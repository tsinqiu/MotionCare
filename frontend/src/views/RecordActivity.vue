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

    <template v-else>
      <section class="record-rq-panel">
        <div class="section-heading">
          <div>
            <p class="overline">训练入口</p>
            <h2>记录运动</h2>
          </div>
        </div>
        <p>用手机定位实时记录户外训练，也可以手工补记已经完成的运动。</p>
        <div class="record-action-grid">
          <span>
            <small>实时记录</small>
            <b>定位 / 计时 / 距离</b>
          </span>
          <span>
            <small>补记训练</small>
            <b>距离 / 时长 / 心率</b>
          </span>
          <span>
            <small>训练分析</small>
            <b>负荷 / 配速 / 跑力</b>
          </span>
        </div>
      </section>

      <div class="record-choice-grid">
        <section class="dark-panel record-choice record-choice--live">
          <span class="record-choice__icon"><MapPin :size="20" aria-hidden="true" /></span>
          <div>
            <p class="overline">实时记录</p>
            <h2>手机定位记录</h2>
            <p>允许定位后，按 GPS 采样保存运动轨迹。</p>
          </div>
          <button class="primary-link" type="button" @click="scrollToLiveRecorder">开始记录</button>
        </section>
        <section class="dark-panel record-choice">
          <span class="record-choice__icon"><FilePlus2 :size="20" aria-hidden="true" /></span>
          <div>
            <p class="overline">补记训练</p>
            <h2>手动添加运动</h2>
            <p>填写类型、时间、距离和心率。</p>
          </div>
          <button class="primary-link" type="button" @click="showManualModal = true">填写运动</button>
        </section>
      </div>

      <div ref="liveRecorderRef" class="live-recorder-anchor">
        <StartWorkout />
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
import { FilePlus2, MapPin } from '@lucide/vue'
import { useRouter } from 'vue-router'

import ManualActivityModal from '@/components/ManualActivityModal.vue'
import StateBlock from '@/components/StateBlock.vue'
import { createManualActivity } from '@/services/activities'
import { authSession, initAuthSession } from '@/stores/authStore'
import StartWorkout from '@/views/StartWorkout.vue'

const router = useRouter()
const showManualModal = ref(false)
const liveRecorderRef = ref(null)

function scrollToLiveRecorder() {
  liveRecorderRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function handleSaved(activity) {
  showManualModal.value = false
  if (activity?.id) router.push(`/activities/${activity.id}`)
  else router.push('/activities')
}
</script>

<style scoped>
.record-choice-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.record-choice {
  display: grid;
  align-content: start;
  gap: 10px;
  min-width: 0;
  padding: 16px;
  border-top: 4px solid var(--app-green);
}
.record-choice--live {
  border-top-color: #16a34a;
}
.record-choice__icon {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: color-mix(in srgb, var(--app-green) 12%, var(--panel-soft));
  color: var(--app-green-dark);
}
.record-choice h2 {
  margin: 3px 0 0;
  font-size: 18px;
  line-height: 1.18;
}
.record-choice p:not(.overline) {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.45;
}
.record-choice :is(.primary-link, .secondary-chip) {
  justify-self: stretch;
  width: 100%;
}
.live-recorder-anchor {
  scroll-margin-top: 76px;
}
</style>
