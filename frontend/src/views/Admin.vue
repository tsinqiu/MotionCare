<template>
  <div class="page-stack">
    <section class="admin-rq-panel">
      <div class="section-heading">
        <div>
          <p class="overline">权限总览</p>
          <h2>管理中心</h2>
        </div>
        <button class="secondary-link" type="button" :disabled="usersLoading" @click="loadUsers">
          <RefreshCw :size="15" aria-hidden="true" />
          {{ usersLoading ? '刷新中' : '刷新' }}
        </button>
      </div>
      <p class="muted-copy">把账号、角色和停用保护放在同一个移动端工作台里，避免误操作影响训练数据。</p>
      <div class="admin-metric-grid">
        <span><small>可用账号</small><b>{{ activeUserCount }}</b></span>
        <span><small>管理员</small><b>{{ adminUserCount }}</b></span>
        <span><small>停用保护</small><b>{{ disabledUserCount }}</b></span>
      </div>
    </section>

    <section class="dark-panel admin-create-card">
      <div class="section-heading">
        <div>
          <p class="overline">账号运营</p>
          <h2>添加用户</h2>
        </div>
        <span class="status-chip good">默认普通用户</span>
      </div>
      <form class="admin-user-form" @submit.prevent="createUser">
        <label>
          <span>用户名</span>
          <input v-model.trim="newUser.username" required maxlength="80" placeholder="请输入用户名" />
        </label>
        <label>
          <span>邮箱</span>
          <input v-model.trim="newUser.email" required type="email" placeholder="用于登录" />
        </label>
        <label>
          <span>密码</span>
          <input v-model="newUser.password" required minlength="8" type="password" placeholder="至少 8 位" />
        </label>
        <label>
          <span>角色</span>
          <select v-model="newUser.role">
            <option value="user">普通用户</option>
            <option value="admin">管理员</option>
          </select>
        </label>
        <button class="primary-link admin-submit-button" type="submit" :disabled="usersBusy">
          <UserPlus :size="16" aria-hidden="true" />
          {{ usersBusy ? '添加中' : '添加用户' }}
        </button>
      </form>
      <p class="admin-form-note">
        <ShieldCheck :size="16" aria-hidden="true" />
        新账号创建后会立即进入账号册，停用操作需要二次确认。
      </p>
    </section>

    <StateBlock v-if="usersLoading" title="正在加载用户" message="正在读取可管理的账号。" />
    <StateBlock v-else-if="usersError" title="用户管理失败" :message="usersError" action-label="重试" tone="danger" @action="loadUsers" />
    <StateBlock v-else-if="users.length === 0" title="还没有用户" message="添加首个用户后会显示在这里。" />

    <section v-else class="dark-panel admin-users-panel">
      <div class="section-heading">
        <div>
          <p class="overline">账号册</p>
          <h2>用户列表</h2>
        </div>
        <span class="status-chip good">{{ users.length }} 个账号</span>
      </div>
      <div class="admin-user-list">
        <article v-for="user in users" :key="user.id" class="admin-user-card">
          <div class="admin-user-card__head">
            <div class="admin-user-card__avatar" aria-hidden="true">{{ accountInitial(user) }}</div>
            <div class="admin-user-card__identity">
              <strong>{{ user.username }}</strong>
              <span>{{ user.email }}</span>
            </div>
            <span class="status-chip" :class="{ good: user.status === 'active' }">
              {{ user.status === 'active' ? '正常' : '已停用' }}
            </span>
          </div>
          <dl class="admin-user-card__meta">
            <div>
              <dt>角色</dt>
              <dd>{{ user.role === 'admin' ? '管理员' : '普通用户' }}</dd>
            </div>
            <div>
              <dt>账号 ID</dt>
              <dd>{{ user.id }}</dd>
            </div>
            <div>
              <dt>权限状态</dt>
              <dd>{{ user.status === 'active' ? '可登录' : '已保护' }}</dd>
            </div>
          </dl>
          <div class="admin-user-card__actions">
            <span v-if="user.id === authSession.user?.id" class="muted-copy">当前登录账号</span>
            <button
              v-else
              class="danger-link"
              type="button"
              :disabled="usersBusy || user.status !== 'active'"
              @click="disableUser(user)"
            >
              {{ user.status === 'active' ? '停用账号' : '账号已停用' }}
            </button>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { showConfirmDialog } from 'vant'
import { RefreshCw, ShieldCheck, UserPlus } from '@lucide/vue'

import StateBlock from '@/components/StateBlock.vue'
import { createAdminUser, disableAdminUser, getAdminUsers } from '@/services/auth'
import { authSession } from '@/stores/authStore'

const users = ref([])
const usersLoading = ref(false)
const usersBusy = ref(false)
const usersError = ref('')
const newUser = reactive({
  username: '',
  email: '',
  password: '',
  role: 'user',
})
const activeUserCount = computed(() => users.value.filter((user) => user.status === 'active').length)
const disabledUserCount = computed(() => users.value.filter((user) => user.status !== 'active').length)
const adminUserCount = computed(() => users.value.filter((user) => user.role === 'admin').length)

function accountInitial(user) {
  return (user.username || user.email || 'M').trim().slice(0, 1).toUpperCase()
}

async function loadUsers() {
  usersLoading.value = true
  usersError.value = ''
  try {
    users.value = await getAdminUsers()
  } catch (err) {
    usersError.value = err instanceof Error ? err.message : '用户列表加载失败'
  } finally {
    usersLoading.value = false
  }
}

async function createUser() {
  usersBusy.value = true
  usersError.value = ''
  try {
    await createAdminUser(newUser)
    Object.assign(newUser, { username: '', email: '', password: '', role: 'user' })
    await loadUsers()
  } catch (err) {
    usersError.value = err instanceof Error ? err.message : '用户添加失败'
  } finally {
    usersBusy.value = false
  }
}

async function disableUser(user) {
  try {
    await showConfirmDialog({
      title: '停用账号',
      message: `确定停用用户 ${user.username} 吗？该账号将无法继续登录。`,
      confirmButtonText: '停用',
      confirmButtonColor: 'var(--red)',
      cancelButtonText: '取消',
      teleport: '.phone-frame',
    })
  } catch {
    return
  }

  usersBusy.value = true
  usersError.value = ''
  try {
    await disableAdminUser(user.id)
    await loadUsers()
  } catch (err) {
    usersError.value = err instanceof Error ? err.message : '用户删除失败'
  } finally {
    usersBusy.value = false
  }
}

onMounted(loadUsers)
</script>

<style scoped>
.admin-rq-panel {
  display: grid;
  gap: 14px;
  padding: 20px 24px;
  border: 1px solid color-mix(in srgb, var(--app-green) 16%, var(--border));
  border-top: 4px solid var(--app-green);
  border-radius: var(--radius-lg);
  background: linear-gradient(180deg, color-mix(in srgb, var(--app-green) 8%, var(--panel)) 0%, var(--panel) 100%);
  box-shadow: 0 18px 42px rgb(15 109 74 / 0.08);
}

.admin-rq-panel .section-heading,
.admin-create-card .section-heading,
.admin-users-panel .section-heading {
  margin: 0;
}

.admin-rq-panel .secondary-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.admin-metric-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.admin-metric-grid span {
  min-width: 0;
  padding: 12px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--app-green) 7%, white);
  border: 1px solid color-mix(in srgb, var(--app-green) 12%, var(--border));
}

.admin-metric-grid small {
  display: block;
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}

.admin-metric-grid b {
  display: block;
  margin-top: 6px;
  color: var(--text);
  font-size: 18px;
  line-height: 1;
}

.admin-create-card {
  border-top: 4px solid color-mix(in srgb, var(--app-green) 82%, var(--border));
}

.admin-user-form label,
.admin-user-form input,
.admin-user-form select {
  min-width: 0;
}

.admin-user-form .primary-link {
  width: 100%;
  justify-content: center;
}

.admin-submit-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.admin-form-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 12px 0 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.45;
}

.admin-form-note svg {
  flex: 0 0 auto;
  color: var(--app-green-dark);
}

.admin-users-panel {
  border-top: 4px solid color-mix(in srgb, var(--app-green) 72%, var(--border));
}

.admin-user-list {
  display: grid;
  gap: 12px;
}

.admin-user-card {
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: linear-gradient(180deg, color-mix(in srgb, var(--app-green) 5%, var(--panel-soft)) 0%, var(--panel-soft) 100%);
}

.admin-user-card__head {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
}

.admin-user-card__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.admin-user-card__avatar {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border-radius: 14px;
  background: var(--app-green);
  color: white;
  font-weight: 900;
  box-shadow: 0 12px 26px rgb(21 182 106 / 0.2);
}

.admin-user-card__identity {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.admin-user-card__identity strong,
.admin-user-card__identity span {
  overflow-wrap: anywhere;
}

.admin-user-card__identity span {
  color: var(--muted);
  font-size: 13px;
}

.admin-user-card__head .status-chip {
  flex: 0 0 auto;
}

.admin-user-card__meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 14px 0;
}

.admin-user-card__meta div {
  min-width: 0;
  padding: 10px;
  border-radius: var(--radius);
  background: var(--panel);
}

.admin-user-card__meta dt {
  color: var(--muted);
  font-size: 12px;
}

.admin-user-card__meta dd {
  margin: 4px 0 0;
  color: var(--text);
  font-weight: 700;
  overflow-wrap: anywhere;
}

.admin-user-card__actions {
  min-height: 44px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.admin-user-card__actions .danger-link {
  margin-left: auto;
}

@container phone-frame (max-width: 374px) {
  .admin-user-card__head {
    align-items: flex-start;
    grid-template-columns: auto minmax(0, 1fr);
  }

  .admin-user-card__head .status-chip {
    grid-column: 2;
    justify-self: start;
  }

  .admin-metric-grid,
  .admin-user-card__meta {
    grid-template-columns: 1fr;
  }
}
</style>
