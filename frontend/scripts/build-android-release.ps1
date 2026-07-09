$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$androidRoot = Join-Path $repoRoot 'android'
$signingRoot = 'D:\MotionCare\.android-signing'
$signingEnvFile = Join-Path $signingRoot 'motioncare-release.env.ps1'
$defaultKeystore = Join-Path $signingRoot 'motioncare-release.keystore'

$env:TEMP = 'D:\MotionCare\.tmp'
$env:TMP = $env:TEMP
$env:npm_config_cache = 'D:\MotionCare\.npm-cache'
$env:GRADLE_USER_HOME = 'D:\MotionCare\.gradle-cache'
$env:ANDROID_USER_HOME = 'D:\MotionCare\.android'
$env:ANDROID_HOME = 'D:\MotionCare\.android-sdk'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME

$preferredJavaHomes = @(
  $env:MOTIONCARE_JAVA_HOME,
  'D:\MotionCare\.jdk-21'
) | Where-Object { $_ }

foreach ($javaHome in $preferredJavaHomes) {
  $javacPath = Join-Path $javaHome 'bin\javac.exe'
  if (Test-Path -LiteralPath $javacPath) {
    $env:JAVA_HOME = $javaHome
    $env:Path = "$(Join-Path $javaHome 'bin');$env:Path"
    break
  }
}

@($env:TEMP, $env:npm_config_cache, $env:GRADLE_USER_HOME, $env:ANDROID_USER_HOME, $env:ANDROID_HOME, $signingRoot) | ForEach-Object {
  if (-not (Test-Path -LiteralPath $_)) {
    New-Item -ItemType Directory -Force -Path $_ | Out-Null
  }
}

function Assert-LastExitCode($commandName) {
  if ($LASTEXITCODE -ne 0) {
    throw "$commandName failed with exit code $LASTEXITCODE"
  }
}

if (Test-Path -LiteralPath $signingEnvFile) {
  . $signingEnvFile
}

function New-SigningPassword {
  $bytes = New-Object byte[] 24
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
  }
  finally {
    $rng.Dispose()
  }
  return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', 'A').Replace('/', 'B')
}

if (-not $env:MOTIONCARE_RELEASE_STORE_FILE) {
  $env:MOTIONCARE_RELEASE_STORE_FILE = $defaultKeystore
}
if (-not $env:MOTIONCARE_RELEASE_KEY_ALIAS) {
  $env:MOTIONCARE_RELEASE_KEY_ALIAS = 'motioncare'
}

if (-not (Test-Path -LiteralPath $env:MOTIONCARE_RELEASE_STORE_FILE)) {
  if (-not $env:MOTIONCARE_RELEASE_STORE_PASSWORD) {
    $env:MOTIONCARE_RELEASE_STORE_PASSWORD = New-SigningPassword
  }
  if (-not $env:MOTIONCARE_RELEASE_KEY_PASSWORD) {
    $env:MOTIONCARE_RELEASE_KEY_PASSWORD = $env:MOTIONCARE_RELEASE_STORE_PASSWORD
  }

  $keytool = Get-Command keytool -ErrorAction Stop
  & $keytool.Source `
    -genkeypair `
    -v `
    -keystore $env:MOTIONCARE_RELEASE_STORE_FILE `
    -alias $env:MOTIONCARE_RELEASE_KEY_ALIAS `
    -keyalg RSA `
    -keysize 2048 `
    -validity 10000 `
    -storepass $env:MOTIONCARE_RELEASE_STORE_PASSWORD `
    -keypass $env:MOTIONCARE_RELEASE_KEY_PASSWORD `
    -dname 'CN=MotionCare, OU=MotionCare, O=MotionCare, L=Shanghai, S=Shanghai, C=CN'
  Assert-LastExitCode 'keytool -genkeypair'

  @"
`$env:MOTIONCARE_RELEASE_STORE_FILE = '$($env:MOTIONCARE_RELEASE_STORE_FILE)'
`$env:MOTIONCARE_RELEASE_STORE_PASSWORD = '$($env:MOTIONCARE_RELEASE_STORE_PASSWORD)'
`$env:MOTIONCARE_RELEASE_KEY_ALIAS = '$($env:MOTIONCARE_RELEASE_KEY_ALIAS)'
`$env:MOTIONCARE_RELEASE_KEY_PASSWORD = '$($env:MOTIONCARE_RELEASE_KEY_PASSWORD)'
"@ | Set-Content -LiteralPath $signingEnvFile -Encoding UTF8
}

foreach ($name in @(
  'MOTIONCARE_RELEASE_STORE_FILE',
  'MOTIONCARE_RELEASE_STORE_PASSWORD',
  'MOTIONCARE_RELEASE_KEY_ALIAS',
  'MOTIONCARE_RELEASE_KEY_PASSWORD'
)) {
  if (-not [Environment]::GetEnvironmentVariable($name, 'Process')) {
    throw "$name is required for release signing."
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
  .\gradlew.bat :app:assembleRelease --no-daemon
  Assert-LastExitCode '.\gradlew.bat :app:assembleRelease'
}
finally {
  Pop-Location
}

$releaseApk = Join-Path $androidRoot 'app\build\outputs\apk\release\app-release.apk'
$downloadDir = Join-Path $repoRoot 'dist\downloads'
$downloadApk = Join-Path $downloadDir 'motioncare-release.apk'

if (-not (Test-Path -LiteralPath $releaseApk)) {
  throw "Release APK was not found at $releaseApk"
}

if (-not (Test-Path -LiteralPath $downloadDir)) {
  New-Item -ItemType Directory -Force -Path $downloadDir | Out-Null
}

Copy-Item -LiteralPath $releaseApk -Destination $downloadApk -Force
