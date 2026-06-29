param(
    [string]$User = "root",
    [string]$HostName = "127.0.0.1",
    [int]$Port = 3306,
    [string]$Mysql = "mysql",
    [string]$Seed = "database/shared/garmin_seed.sql.gz",
    [string]$Uploads = "database/shared/uploads.zip",
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")
$seedPath = Resolve-Path -LiteralPath (Join-Path $repoRoot $Seed)
$uploadsPath = Join-Path $repoRoot $Uploads

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

if (-not $Force) {
    $answer = Read-Host "This will rebuild local database MotionAnalysis. Type IMPORT to continue"
    if ($answer -ne "IMPORT") {
        Write-Host "Cancelled."
        exit 0
    }
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
$expandedSeed = Join-Path $env:TEMP ("motioncare_seed_{0}.sql" -f ([Guid]::NewGuid().ToString("N")))

function Invoke-MysqlFile([string]$Path, [string]$Label) {
    Write-Host "$Label`: $Path"
    $process = Start-Process `
        -FilePath $Mysql `
        -ArgumentList @("--defaults-extra-file=$defaultsFile") `
        -RedirectStandardInput $Path `
        -NoNewWindow `
        -Wait `
        -PassThru

    if ($process.ExitCode -ne 0) {
        throw "$Label failed with exit code $($process.ExitCode)"
    }
}

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

    & $Mysql --defaults-extra-file="$defaultsFile" --execute="DROP DATABASE IF EXISTS MotionAnalysis;"
    if ($LASTEXITCODE -ne 0) {
        throw "Dropping database failed with exit code $LASTEXITCODE"
    }

    $schemaFiles = @(
        "database/sql/01_schema.sql",
        "database/sql/04_auth_manual_upload.sql",
        "database/sql/05_performance_indexes.sql",
        "database/sql/06_extension_modules.sql",
        "database/sql/07_profile_follow_explore_uploads.sql",
        "database/sql/08_backfill_activity_training_load.sql",
        "database/sql/09_simplify_garmin_health_tables.sql",
        "database/sql/15_garmin_timeseries.sql"
    )

    foreach ($schema in $schemaFiles) {
        Invoke-MysqlFile -Path (Join-Path $repoRoot $schema) -Label "Applying $schema"
    }

    if ($seedPath.Path.EndsWith(".gz")) {
        Write-Host "Expanding seed: $($seedPath.Path)"
        $inputStream = [System.IO.File]::OpenRead($seedPath.Path)
        $gzipStream = New-Object System.IO.Compression.GZipStream($inputStream, [System.IO.Compression.CompressionMode]::Decompress)
        $outputStream = [System.IO.File]::Create($expandedSeed)
        $gzipStream.CopyTo($outputStream)
        $outputStream.Dispose()
        $gzipStream.Dispose()
        $inputStream.Dispose()
        Invoke-MysqlFile -Path $expandedSeed -Label "Importing shared seed"
    } else {
        Invoke-MysqlFile -Path $seedPath.Path -Label "Importing shared seed"
    }

    & $Mysql --defaults-extra-file="$defaultsFile" --database=MotionAnalysis --table --execute="
SELECT 'Activities' AS table_name, COUNT(*) AS row_count FROM Activities
UNION ALL SELECT 'TrackPoints', COUNT(*) FROM TrackPoints
UNION ALL SELECT 'DailyHealthSummaries', COUNT(*) FROM DailyHealthSummaries
UNION ALL SELECT 'SleepSummaries', COUNT(*) FROM SleepSummaries
UNION ALL SELECT 'HeartRateSamples', COUNT(*) FROM HeartRateSamples
UNION ALL SELECT 'StressSamples', COUNT(*) FROM StressSamples
UNION ALL SELECT 'StepSamples', COUNT(*) FROM StepSamples
UNION ALL SELECT 'HrvSamples', COUNT(*) FROM HrvSamples;
"
    if ($LASTEXITCODE -ne 0) {
        throw "Verification query failed with exit code $LASTEXITCODE"
    }

    if (Test-Path -LiteralPath $uploadsPath) {
        $uploadRoot = Join-Path $repoRoot "backend\uploads"
        New-Item -ItemType Directory -Force -Path $uploadRoot | Out-Null
        Write-Host "Importing shared uploads: $uploadsPath"
        Expand-Archive -LiteralPath $uploadsPath -DestinationPath $uploadRoot -Force
    }
}
finally {
    if (Test-Path -LiteralPath $defaultsFile) {
        Remove-Item -LiteralPath $defaultsFile -Force
    }
    if (Test-Path -LiteralPath $expandedSeed) {
        Remove-Item -LiteralPath $expandedSeed -Force
    }
}
