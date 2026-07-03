$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$androidRoot = Join-Path $repoRoot 'android'
$env:TEMP = 'D:\MotionCare\.tmp'
$env:TMP = $env:TEMP
$env:npm_config_cache = 'D:\MotionCare\.npm-cache'
$env:GRADLE_USER_HOME = 'D:\MotionCare\.gradle-cache'
$env:ANDROID_USER_HOME = 'D:\MotionCare\.android'
$env:ANDROID_HOME = 'D:\MotionCare\.android-sdk'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME

@($env:TEMP, $env:npm_config_cache, $env:GRADLE_USER_HOME, $env:ANDROID_USER_HOME, $env:ANDROID_HOME) | ForEach-Object {
  if (-not (Test-Path -LiteralPath $_)) {
    New-Item -ItemType Directory -Force -Path $_ | Out-Null
  }
}

function Assert-LastExitCode($commandName) {
  if ($LASTEXITCODE -ne 0) {
    throw "$commandName failed with exit code $LASTEXITCODE"
  }
}

Push-Location $repoRoot
try {
  npm run android:sync
  Assert-LastExitCode 'npm run android:sync'
}
finally {
  Pop-Location
}

Push-Location $androidRoot
try {
  .\gradlew.bat :app:assembleDebug --no-daemon
  Assert-LastExitCode '.\gradlew.bat :app:assembleDebug'
}
finally {
  Pop-Location
}
