<template>
  <div class="page-stack">
    <section class="dark-panel">
      <div class="section-heading">
        <div>
          <h2>管理中心</h2>
        </div>
        <button class="secondary-link" type="button" :disabled="usersLoading" @click="loadUsers">
          {{ usersLoading ? '刷新中' : '刷新' }}
        </button>
      </div>
      <p class="muted-copy">管理员可以添加用户、设置角色，并停用不再使用的账号。</p>
    </section>

    <section class="dark-panel">
      <div class="section-heading">
        <div>
          <h2>添加用户</h2>
        </div>
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
        <button class="primary-link" type="submit" :disabled="usersBusy">
          {{ usersBusy ? '添加中' : '添加用户' }}
        </button>
      </form>
    </section>

    <StateBlock v-if="usersLoading" title="正在加载用户" message="正在读取可管理的账号。" />
    <StateBlock v-else-if="usersError" title="用户管理失败" :message="usersError" action-label="重试" tone="danger" @action="loadUsers" />
    <StateBlock v-else-if="users.length === 0" title="还没有用户" message="添加首个用户后会显示在这里。" />

    <section v-else class="dark-panel">
      <div class="section-heading">
        <div>
          <h2>用户列表</h2>
        </div>
        <span class="status-chip good">{{ users.length }} 个账号</span>
      </div>
      <div class="admin-user-list">
        <article v-for="user in users" :key="user.id" class="admin-user-card">
          <div class="admin-user-card__head">
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
import { onMounted, reactive, ref } from 'vue'
import { showConfirmDialog } from 'vant'

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
.admin-user-form label,
.admin-user-form input,
.admin-user-form select {
  min-width: 0;
}

.admin-user-form .primary-link {
  width: 100%;
  justify-content: center;
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
  background: var(--panel-soft);
}

.admin-user-card__head,
.admin-user-card__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
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
  grid-template-columns: repeat(2, minmax(0, 1fr));
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
  }

  .admin-user-card__meta {
    grid-template-columns: 1fr;
  }
}
</style>
