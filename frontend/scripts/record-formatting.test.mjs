import test from 'node:test'
import assert from 'node:assert/strict'

let recordFormatters = {}

try {
  recordFormatters = await import('../src/utils/recordFormatters.js')
} catch {
  // RED: the record formatting helper does not exist yet.
}

test('personal best pace records never expose backend sec/km units', () => {
  assert.equal(typeof recordFormatters.normalizePersonalBestRecord, 'function')
  assert.deepEqual(
    recordFormatters.normalizePersonalBestRecord({ label: '5公里', value: 346.15, unit: 'sec/km' }),
    { label: '5公里', value: '5:46/km', unit: '' },
  )
  assert.deepEqual(
    recordFormatters.normalizePersonalBestRecord({ label: '10公里', value: 401.8, unit: 's/km' }),
    { label: '10公里', value: '6:42/km', unit: '' },
  )
})
