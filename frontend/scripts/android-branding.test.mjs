import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function source(path) {
  try {
    return await readFile(new URL(`../${path}`, import.meta.url), 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return ''
    throw error
  }
}

const [
  manifest,
  adaptiveIcon,
  adaptiveRoundIcon,
  launcherBackground,
  launcherForeground,
  legacyBackground,
  legacyForeground,
] = await Promise.all([
  source('android/app/src/main/AndroidManifest.xml'),
  source('android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml'),
  source('android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml'),
  source('android/app/src/main/res/drawable/motioncare_launcher_background.xml'),
  source('android/app/src/main/res/drawable/motioncare_launcher_foreground.xml'),
  source('android/app/src/main/res/drawable/ic_launcher_background.xml'),
  source('android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml'),
])

test('Android launcher icon uses MotionCare adaptive icon resources', () => {
  assert.match(manifest, /android:icon="@mipmap\/ic_launcher"/)
  assert.match(manifest, /android:roundIcon="@mipmap\/ic_launcher_round"/)
  assert.match(adaptiveIcon, /@drawable\/motioncare_launcher_background/)
  assert.match(adaptiveIcon, /@drawable\/motioncare_launcher_foreground/)
  assert.match(adaptiveRoundIcon, /@drawable\/motioncare_launcher_background/)
  assert.match(adaptiveRoundIcon, /@drawable\/motioncare_launcher_foreground/)
})

test('MotionCare launcher art is deep green, refined, and not the default Android mark', () => {
  assert.match(launcherBackground, /#2e681d/)
  assert.match(launcherBackground, /#15b66a/)
  assert.match(launcherBackground, /MotionCare refined launcher background/)
  assert.match(launcherForeground, /MotionCare refined runner launcher foreground/)
  assert.match(launcherForeground, /#ffffff/)
  assert.match(launcherForeground, /#f6d34d/)
  assert.match(launcherForeground, /#15b66a/)
  assert.doesNotMatch(launcherForeground, /62\.94,56\.92/)
  assert.doesNotMatch(legacyForeground, /62\.94,56\.92/)
  assert.doesNotMatch(legacyBackground, /#26A69A/)
})
