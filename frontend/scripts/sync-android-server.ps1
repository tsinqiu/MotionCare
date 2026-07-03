$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$env:TEMP = 'D:\MotionCare\.tmp'
$env:TMP = $env:TEMP
$env:npm_config_cache = 'D:\MotionCare\.npm-cache'
$env:ANDROID_USER_HOME = 'D:\MotionCare\.android'
$env:ANDROID_HOME = 'D:\MotionCare\.android-sdk'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME

@($env:TEMP, $env:npm_config_cache, $env:ANDROID_USER_HOME, $env:ANDROID_HOME) | ForEach-Object {
  if (-not (Test-Path -LiteralPath $_)) {
    New-Item -ItemType Directory -Force -Path $_ | Out-Null
  }
}

function Assert-LastExitCode($commandName) {
  if ($LASTEXITCODE -ne 0) {
    throw "$commandName failed with exit code $LASTEXITCODE"
  }
}

$serverSecretDirName = -join ([char]26381, [char]21153, [char]22120, [char]23494, [char]21273)
$serverIpFileName = (-join ([char]20844, [char]32593)) + 'ip.txt'
$serverIpFile = Join-Path (Join-Path 'D:\MotionCare' $serverSecretDirName) $serverIpFileName

if (-not $env:VITE_NATIVE_API_BASE_URL) {
  if (Test-Path -LiteralPath $serverIpFile) {
    $serverIp = (Get-Content -Raw -LiteralPath $serverIpFile).Trim()
    if ($serverIp) {
      $env:VITE_NATIVE_API_BASE_URL = "http://$serverIp/api"
    }
  }
}

if (-not $env:VITE_NATIVE_API_BASE_URL) {
  throw "VITE_NATIVE_API_BASE_URL is required for Android sync. Set it or create $serverIpFile."
}

if (-not $env:VITE_API_BASE_URL) {
  $env:VITE_API_BASE_URL = $env:VITE_NATIVE_API_BASE_URL
}

Push-Location $repoRoot
try {
  npm run build
  Assert-LastExitCode 'npm run build'
  npx cap sync android
  Assert-LastExitCode 'npx cap sync android'
}
finally {
  Pop-Location
}
