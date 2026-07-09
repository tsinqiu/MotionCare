import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const shoesView = await readFile(new URL('../src/views/Shoes.vue', import.meta.url), 'utf8')

test('shoes empty state keeps one clear add-shoe action', () => {
  assert.equal((shoesView.match(/添加跑鞋/g) || []).length, 1)
  assert.doesNotMatch(shoesView, /class="shoe-empty-actions"/)
  assert.doesNotMatch(shoesView, /class="primary-link" @click="openCreate">添加跑鞋<\/button>[\s\S]*<h2>我的跑鞋<\/h2>[\s\S]*添加跑鞋/)
})
