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

$defaultServerIp = '47.112.190.14'
$serverIpFileName = (-join ([char]20844, [char]32593)) + 'ip.txt'
$workspaceRoot = Resolve-Path (Join-Path $repoRoot '..\..')
$workspaceServerIpFile = Join-Path $workspaceRoot (Join-Path 'others' $serverIpFileName)
$serverSecretDirName = -join ([char]26381, [char]21153, [char]22120, [char]23494, [char]21273)
$serverIpFile = Join-Path (Join-Path 'D:\MotionCare' $serverSecretDirName) $serverIpFileName

function Resolve-ServerIp {
  foreach ($path in @($workspaceServerIpFile, $serverIpFile)) {
    if (Test-Path -LiteralPath $path) {
      $value = (Get-Content -Raw -LiteralPath $path -Encoding UTF8).Trim()
      if ($value) {
        return $value
      }
    }
  }

  return $defaultServerIp
}

if (-not $env:VITE_NATIVE_API_BASE_URL) {
  $serverIp = Resolve-ServerIp
  $env:VITE_NATIVE_API_BASE_URL = "http://$serverIp/api"
}

if (-not $env:VITE_NATIVE_API_BASE_URL) {
  throw "VITE_NATIVE_API_BASE_URL is required for Android sync. Set it or create $workspaceServerIpFile."
}

$env:VITE_API_BASE_URL = $env:VITE_NATIVE_API_BASE_URL

Push-Location $repoRoot
try {
  npm run build
  Assert-LastExitCode 'npm run build'
  $androidPublic = Join-Path $repoRoot 'android\app\src\main\assets\public'
  if (Test-Path -LiteralPath $androidPublic) {
    Remove-Item -LiteralPath $androidPublic -Recurse -Force
  }
  npx cap sync android
  Assert-LastExitCode 'npx cap sync android'
}
finally {
  Pop-Location
}
