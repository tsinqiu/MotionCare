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

async function json(path) {
  const text = await source(path)
  return text ? JSON.parse(text) : null
}

const [
  packageJson,
  capacitorConfig,
  androidManifest,
  androidNetworkSecurity,
  androidStrings,
  androidGradle,
  androidGradleProperties,
  gradleWrapper,
  androidSyncScript,
  androidBuildScript,
  androidReleaseScript,
] = await Promise.all([
  json('package.json'),
  source('capacitor.config.ts'),
  source('android/app/src/main/AndroidManifest.xml'),
  source('android/app/src/main/res/xml/network_security_config.xml'),
  source('android/app/src/main/res/values/strings.xml'),
  source('android/app/build.gradle'),
  source('android/gradle.properties'),
  source('android/gradle/wrapper/gradle-wrapper.properties'),
  source('scripts/sync-android-server.ps1'),
  source('scripts/build-android-debug.ps1'),
  source('scripts/build-android-release.ps1'),
])

test('frontend declares Capacitor dependencies and native app scripts', () => {
  assert.ok(packageJson.dependencies['@capacitor/core'])
  assert.ok(packageJson.devDependencies['@capacitor/cli'])
  assert.ok(packageJson.devDependencies['@capacitor/android'])
  assert.match(packageJson.scripts['cap:sync'] || '', /npm run build && cap sync/)
  assert.match(packageJson.scripts['android:sync'] || '', /sync-android-server\.ps1/)
})

test('Capacitor config targets a MotionCare Android app from Vite dist', () => {
  assert.match(capacitorConfig, /appId:\s*['"]com\.motioncare\.app['"]/)
  assert.match(capacitorConfig, /appName:\s*['"]MotionCare['"]/)
  assert.match(capacitorConfig, /webDir:\s*['"]dist['"]/)
  assert.match(capacitorConfig, /backgroundColor:\s*['"]#eef8f2['"]/)
  assert.match(capacitorConfig, /androidScheme:\s*['"]https['"]/)
})

test('Android WebView allows the packaged HTTPS app shell to call the HTTP server API', () => {
  assert.match(capacitorConfig, /cleartext:\s*true/)
  assert.match(capacitorConfig, /android:\s*\{[\s\S]*allowMixedContent:\s*true/)
  assert.match(androidManifest, /android:usesCleartextTraffic="true"/)
  assert.match(androidManifest, /android:networkSecurityConfig="@xml\/network_security_config"/)
  assert.match(androidNetworkSecurity, /<base-config\s+cleartextTrafficPermitted="true">/)
  assert.match(androidNetworkSecurity, /<domain-config\s+cleartextTrafficPermitted="true">/)
  assert.match(androidNetworkSecurity, /<domain[^>]*>47\.112\.190\.14<\/domain>/)
})

test('Android platform is generated with MotionCare identity', () => {
  assert.match(androidManifest, /android:theme="@style\/AppTheme/)
  assert.match(androidStrings, /<string name="app_name">MotionCare<\/string>/)
  assert.match(androidStrings, /<string name="package_name">com\.motioncare\.app<\/string>/)
  assert.match(androidGradle, /namespace\s*=\s*["']com\.motioncare\.app["']/)
  assert.match(androidGradle, /applicationId\s+["']com\.motioncare\.app["']/)
})

test('Android app can request location for live workout recording', () => {
  assert.match(androidManifest, /android\.permission\.ACCESS_FINE_LOCATION/)
  assert.match(androidManifest, /android\.permission\.ACCESS_COARSE_LOCATION/)
})

test('Android release signing is configured from environment variables only', () => {
  assert.match(androidGradle, /signingConfigs\s*\{/)
  assert.match(androidGradle, /release\s*\{/)
  assert.match(androidGradle, /MOTIONCARE_RELEASE_STORE_FILE/)
  assert.match(androidGradle, /MOTIONCARE_RELEASE_STORE_PASSWORD/)
  assert.match(androidGradle, /MOTIONCARE_RELEASE_KEY_ALIAS/)
  assert.match(androidGradle, /MOTIONCARE_RELEASE_KEY_PASSWORD/)
  assert.doesNotMatch(androidGradle, /storePassword\s+["'][^"']+["']/)
  assert.doesNotMatch(androidGradle, /keyPassword\s+["'][^"']+["']/)
})

test('Gradle wrapper allows slower first-time downloads on this workstation', () => {
  assert.match(gradleWrapper, /distributionUrl=.*gradle-8\.14\.3-bin\.zip/)
  assert.match(gradleWrapper, /networkTimeout=60000/)
})

test('Android Gradle release build uses conservative local memory settings', () => {
  assert.match(androidGradleProperties, /org\.gradle\.jvmargs=-Xmx1024m\s+-XX:MaxMetaspaceSize=512m/)
  assert.match(androidGradleProperties, /org\.gradle\.workers\.max=2/)
  assert.match(androidGradleProperties, /org\.gradle\.parallel=false/)
})

test('Android sync script keeps npm and native tool homes on D drive', () => {
  assert.match(androidSyncScript, /\$env:npm_config_cache\s*=\s*['"]D:\\MotionCare\\\.npm-cache['"]/)
  assert.match(androidSyncScript, /\$env:TEMP\s*=\s*['"]D:\\MotionCare\\\.tmp['"]/)
  assert.match(androidSyncScript, /\$env:TMP\s*=\s*\$env:TEMP/)
  assert.match(androidSyncScript, /\$env:ANDROID_USER_HOME\s*=\s*['"]D:\\MotionCare\\\.android['"]/)
  assert.match(androidSyncScript, /\$env:ANDROID_HOME\s*=\s*['"]D:\\MotionCare\\\.android-sdk['"]/)
  assert.doesNotMatch(androidSyncScript, /LOCALAPPDATA/)
  assert.match(androidSyncScript, /Assert-LastExitCode 'npm run build'/)
  assert.match(androidSyncScript, /Assert-LastExitCode 'npx cap sync android'/)
})

test('Windows debug APK build script keeps Gradle cache on D drive', () => {
  assert.match(packageJson.scripts['android:debug'] || '', /build-android-debug\.ps1/)
  assert.match(androidBuildScript, /\$env:TEMP\s*=\s*['"]D:\\MotionCare\\\.tmp['"]/)
  assert.match(androidBuildScript, /\$env:TMP\s*=\s*\$env:TEMP/)
  assert.match(androidBuildScript, /\$env:GRADLE_USER_HOME\s*=\s*['"]D:\\MotionCare\\\.gradle-cache['"]/)
  assert.match(androidBuildScript, /\$env:ANDROID_USER_HOME\s*=\s*['"]D:\\MotionCare\\\.android['"]/)
  assert.match(androidBuildScript, /\$env:ANDROID_HOME\s*=\s*['"]D:\\MotionCare\\\.android-sdk['"]/)
  assert.doesNotMatch(androidBuildScript, /LOCALAPPDATA/)
  assert.match(androidBuildScript, /npm run android:sync/)
  assert.match(androidBuildScript, /Assert-LastExitCode 'npm run android:sync'/)
  assert.match(androidBuildScript, /:app:assembleDebug/)
  assert.match(androidBuildScript, /:app:assembleDebug --no-daemon/)
  assert.match(androidBuildScript, /Assert-LastExitCode '\.\\gradlew\.bat :app:assembleDebug'/)
})

test('Windows release APK build script signs the app from D drive inputs', () => {
  assert.match(packageJson.scripts['android:release'] || '', /build-android-release\.ps1/)
  assert.match(androidReleaseScript, /\$env:TEMP\s*=\s*['"]D:\\MotionCare\\\.tmp['"]/)
  assert.match(androidReleaseScript, /\$env:TMP\s*=\s*\$env:TEMP/)
  assert.match(androidReleaseScript, /\$env:GRADLE_USER_HOME\s*=\s*['"]D:\\MotionCare\\\.gradle-cache['"]/)
  assert.match(androidReleaseScript, /\$env:ANDROID_USER_HOME\s*=\s*['"]D:\\MotionCare\\\.android['"]/)
  assert.match(androidReleaseScript, /\$env:ANDROID_HOME\s*=\s*['"]D:\\MotionCare\\\.android-sdk['"]/)
  assert.doesNotMatch(androidReleaseScript, /LOCALAPPDATA/)
  assert.match(androidReleaseScript, /MOTIONCARE_RELEASE_STORE_FILE/)
  assert.match(androidReleaseScript, /:app:assembleRelease/)
  assert.match(androidReleaseScript, /:app:assembleRelease --no-daemon/)
  assert.match(androidReleaseScript, /Assert-LastExitCode 'npm run android:sync'/)
  assert.match(androidReleaseScript, /Assert-LastExitCode '\.\\gradlew\.bat :app:assembleRelease'/)
})
