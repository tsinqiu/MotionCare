import { Capacitor, registerPlugin } from '@capacitor/core'

const MotionLocation = registerPlugin('MotionLocation')

export function isNativeMotionLocationAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

export async function startNativeMotionLocation({ onLocation, onStatus }) {
  if (!isNativeMotionLocationAvailable()) return null

  const locationHandle = await MotionLocation.addListener('motionLocation', onLocation)
  const statusHandle = await MotionLocation.addListener('motionLocationStatus', onStatus)
  let status
  try {
    status = await MotionLocation.start()
  } catch (err) {
    await locationHandle.remove()
    await statusHandle.remove()
    throw err
  }

  return {
    status,
    stop: async () => {
      await MotionLocation.stop().catch(() => {})
      await locationHandle.remove()
      await statusHandle.remove()
    },
  }
}
