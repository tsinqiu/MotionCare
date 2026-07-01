import { Activity, Bike, CalendarDays, Dumbbell, Waves } from '@lucide/vue'

export const sportFilters = [
  { label: '全部', value: 'all', color: '#21d47b' },
  { label: '跑步', value: 'running', color: '#21d47b' },
  { label: '骑行', value: 'cycling', color: '#ff9d19' },
  { label: '游泳', value: 'swimming', color: '#33b5ff' },
  { label: '力量', value: 'strength_training', color: '#8b5cf6' },
  { label: '其他', value: 'other', color: '#94a3b8' },
]

export const startSportTypes = [
  { label: '户外跑步', type: 'running', icon: Activity, color: '#21d47b' },
  { label: '室内跑步', type: 'running', icon: Activity, color: '#21d47b' },
  { label: '户外骑行', type: 'cycling', icon: Bike, color: '#ff9d19' },
  { label: '室内骑行', type: 'cycling', icon: Bike, color: '#ff9d19' },
  { label: '游泳', type: 'swimming', icon: Waves, color: '#33b5ff' },
  { label: '力量训练', type: 'strength_training', icon: Dumbbell, color: '#8b5cf6' },
  { label: '步行', type: 'walking', icon: Activity, color: '#94a3b8' },
  { label: '其他', type: 'other', icon: CalendarDays, color: '#94a3b8' },
]
