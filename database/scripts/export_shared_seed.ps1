param(
    [string]$User = "root",
    [string]$HostName = "127.0.0.1",
    [int]$Port = 3306,
    [string]$Mysql = "mysql",
    [string]$Mysqldump = "mysqldump",
    [string]$Out = "database/shared/garmin_seed.sql.gz",
    [string]$UploadsOut = "database/shared/uploads.zip"
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")
$outPath = Join-Path $repoRoot $Out
$uploadsOutPath = Join-Path $repoRoot $UploadsOut
$outDir = Split-Path -Parent $outPath
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function Read-BackendEnv {
    $envPath = Join-Path $repoRoot "backend\.env"
    $values = @{}
    if (-not (Test-Path -LiteralPath $envPath)) {
        return $values
    }
    foreach ($line in Get-Content -LiteralPath $envPath) {
        $text = $line.Trim()
        if (-not $text -or $text.StartsWith("#") -or -not $text.Contains("=")) {
            continue
        }
        $key, $value = $text.Split("=", 2)
        $values[$key.Trim()] = $value.Trim().Trim('"').Trim("'")
    }
    return $values
}

$backendEnv = Read-BackendEnv
$plainPassword = $backendEnv["DB_PASSWORD"]
if (-not $plainPassword) {
    $securePassword = Read-Host "MySQL password for $User@$HostName" -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

$defaultsFile = Join-Path $env:TEMP ("motioncare_mysql_{0}.cnf" -f ([Guid]::NewGuid().ToString("N")))
$dumpFile = Join-Path $env:TEMP ("motioncare_seed_dump_{0}.sql" -f ([Guid]::NewGuid().ToString("N")))
$seedSql = Join-Path $env:TEMP ("motioncare_seed_{0}.sql" -f ([Guid]::NewGuid().ToString("N")))

try {
    $defaultsContent = @"
[client]
user=$User
password=$plainPassword
host=$HostName
port=$Port
default-character-set=utf8mb4
"@
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($defaultsFile, $defaultsContent, $utf8NoBom)
    $plainPassword = $null

    $candidateTables = @(
        "shoes",
        "activities",
        "activitysummaries",
        "activityzones",
        "laps",
        "trackpoints",
        "dailyhealthsummaries",
        "sleepsummaries",
        "heartratesamples",
        "stresssamples",
        "stepsamples",
        "intensityminutesamples",
        "sleepstagesamples",
        "sleepmovementsamples",
        "hrvsamples",
        "trainingstatussnapshots",
        "racepredictions",
        "lactatethresholds",
        "cyclingftpsnapshots"
    )
    $existingTables = & $Mysql --defaults-extra-file="$defaultsFile" --database=MotionAnalysis --batch --skip-column-names --execute="SHOW TABLES;"
    if ($LASTEXITCODE -ne 0) {
        throw "Could not read MotionAnalysis tables."
    }
    $tables = $candidateTables | Where-Object { $existingTables -contains $_ }

    $dumpArgs = @(
        "--defaults-extra-file=$defaultsFile",
        "--no-create-info",
        "--skip-triggers",
        "--complete-insert",
        "--default-character-set=utf8mb4",
        "--result-file=$dumpFile",
        "MotionAnalysis"
    ) + $tables

    Write-Host "Exporting shared data tables..."
    $process = Start-Process -FilePath $Mysqldump -ArgumentList $dumpArgs -NoNewWindow -Wait -PassThru
    if ($process.ExitCode -ne 0) {
        throw "mysqldump failed with exit code $($process.ExitCode)"
    }

    $demoPasswordHash = '$2b$10$I5gYgpavSZhz/sQFGOu.geLh.lf2ktYYLvvjTycnrs/u.5FhYLr4u'
    $header = @"
USE MotionAnalysis;
SET FOREIGN_KEY_CHECKS=0;
DELETE FROM Users;
INSERT INTO Users (id, username, email, password_hash, role, status)
VALUES (1, 'demo', 'demo@example.com', '$demoPasswordHash', 'admin', 'active');

"@
    [System.IO.File]::WriteAllText($seedSql, $header, $utf8NoBom)
    [System.IO.File]::AppendAllText($seedSql, [System.IO.File]::ReadAllText($dumpFile), $utf8NoBom)
    [System.IO.File]::AppendAllText($seedSql, "`nSET FOREIGN_KEY_CHECKS=1;`n", $utf8NoBom)

    Write-Host "Compressing seed: $outPath"
    $inputStream = [System.IO.File]::OpenRead($seedSql)
    $outputStream = [System.IO.File]::Create($outPath)
    $gzipStream = New-Object System.IO.Compression.GZipStream($outputStream, [System.IO.Compression.CompressionLevel]::Optimal)
    $inputStream.CopyTo($gzipStream)
    $gzipStream.Dispose()
    $outputStream.Dispose()
    $inputStream.Dispose()

    $sizeMb = [Math]::Round((Get-Item -LiteralPath $outPath).Length / 1MB, 2)
    Write-Host "Wrote $outPath ($sizeMb MB)"

    $uploadsPath = Join-Path $repoRoot "backend\uploads"
    if (Test-Path -LiteralPath $uploadsPath) {
        if (Test-Path -LiteralPath $uploadsOutPath) {
            Remove-Item -LiteralPath $uploadsOutPath -Force
        }
        Compress-Archive -Path (Join-Path $uploadsPath "*") -DestinationPath $uploadsOutPath -Force
        $uploadsSizeMb = [Math]::Round((Get-Item -LiteralPath $uploadsOutPath).Length / 1MB, 2)
        Write-Host "Wrote $uploadsOutPath ($uploadsSizeMb MB)"
    }

    Write-Host "Demo login after import: demo@example.com / 123456"
}
finally {
    foreach ($path in @($defaultsFile, $dumpFile, $seedSql)) {
        if (Test-Path -LiteralPath $path) {
            Remove-Item -LiteralPath $path -Force
        }
    }
}
