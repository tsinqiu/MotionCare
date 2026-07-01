function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function deriveStatusBadge({ sleepScore, avgStressLevel, tsb } = {}) {
  const sleep = finiteNumber(sleepScore)
  const stress = finiteNumber(avgStressLevel)
  const balance = finiteNumber(tsb)

  if ((sleep !== null && sleep < 60) || (stress !== null && stress >= 75) || (balance !== null && balance < -25)) {
    return { label: '建议恢复', tone: 'danger', message: '今天优先恢复，可以安排散步、拉伸或低强度活动。' }
  }
  if (balance === null) {
    return { label: '数据不足', tone: 'neutral', message: '同步近期健康和运动数据后，可获得更准确的今日建议。' }
  }
  if (balance < -8) {
    return { label: '适合轻松练', tone: 'warning', message: '近期疲劳偏高，建议选择轻松有氧并控制时长。' }
  }
  if (balance <= 10) {
    return { label: '适合按计划练', tone: 'good', message: '身体状态和训练负荷较平衡，可以按原计划训练。' }
  }
  return { label: '状态轻松', tone: 'good', message: '当前恢复较充分，可以根据目标安排一次正常训练。' }
}

function parseLocalDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return { year, month, day }
}

function localDaySerial({ year, month, day }) {
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000)
}

export function getRaceCountdown(raceDate, now = new Date()) {
  const target = parseLocalDate(raceDate)
  if (!target || Number.isNaN(now?.getTime?.())) {
    return { days: null, label: '日期待确认', ended: false }
  }

  const today = {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  }
  const days = localDaySerial(target) - localDaySerial(today)

  if (days < 0) return { days: 0, label: '赛事已结束', ended: true }
  if (days === 0) return { days: 0, label: '今天比赛', ended: false }
  return { days, label: `距比赛 ${days} 天`, ended: false }
}
