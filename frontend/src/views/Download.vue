<template>
  <main class="download-page">
    <section class="download-shell">
      <div class="download-brand">
        <img class="download-brand__icon" src="/icons/motioncare-icon.svg" alt="" />
        <strong>MotionCare</strong>
      </div>

      <div class="download-hero">
        <h1>下载 MotionCare</h1>
      </div>

      <ServerHealthBadge compact :show-caption="false" :show-detail="false" />

      <a class="download-primary" href="/downloads/motioncare-release.apk" download>
        <DownloadIcon :size="20" />
        <span>
          <strong>下载安卓版 APK</strong>
        </span>
      </a>

      <RouterLink class="download-return" to="/today">
        <ArrowLeft :size="16" aria-hidden="true" />
        <span>返回主页</span>
      </RouterLink>

      <p class="download-note">如果无法安装，请检查是否允许安装未知来源应用。</p>
    </section>
  </main>
</template>

<script setup>
import { ArrowLeft, Download as DownloadIcon } from '@lucide/vue'

import ServerHealthBadge from '@/components/ServerHealthBadge.vue'
</script>

<style scoped>
.download-hero {
  padding-top: 16px;
}

.download-primary {
  min-height: 64px;
}

.download-primary span {
  align-items: center;
}

.download-primary strong {
  font-size: 17px;
  line-height: 1.2;
}

.download-return {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 14px;
  border: 1px solid color-mix(in srgb, var(--download-green) 18%, var(--border));
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--download-green) 7%, var(--panel));
  color: var(--download-green);
  font-weight: 800;
  text-decoration: none;
}
</style>
