import { formatPaceSeconds } from './formatters.js'

const paceUnitPattern = /^(s|sec|secs|second|seconds)\/km$/i

export function normalizePersonalBestRecord(item) {
  if (!item) return item
  const unit = String(item.unit || '').trim()
  if (!paceUnitPattern.test(unit)) return item

  return {
    ...item,
    value: formatPaceSeconds(Number(item.value)),
    unit: '',
  }
}
