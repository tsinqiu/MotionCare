param(
    [string]$User = "root",
    [string]$HostName = "localhost",
    [int]$Port = 3306,
    [string]$Mysql = "mysql",
    [string]$Schema = "sql/01_schema.sql",
    [string]$Import = "sql/02_import_data.sql"
)

$ErrorActionPreference = "Stop"

function Resolve-SqlPath([string]$PathText) {
    return (Resolve-Path -LiteralPath $PathText).Path
}

function Invoke-MysqlScript([string]$ScriptPath, [string]$Label) {
    Write-Host "$Label`: $ScriptPath"
    $process = Start-Process `
        -FilePath $Mysql `
        -ArgumentList @("--defaults-extra-file=$defaultsFile") `
        -RedirectStandardInput $ScriptPath `
        -NoNewWindow `
        -Wait `
        -PassThru

    if ($process.ExitCode -ne 0) {
        throw "$Label failed with exit code $($process.ExitCode)"
    }
}

$schemaPath = Resolve-SqlPath $Schema
$importPath = Resolve-SqlPath $Import

$securePassword = Read-Host "MySQL password for $User@$HostName" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
$plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

$defaultsFile = Join-Path $env:TEMP ("motion_analysis_mysql_{0}.cnf" -f ([Guid]::NewGuid().ToString("N")))

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
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()

    Invoke-MysqlScript -ScriptPath $schemaPath -Label "Applying schema"

    Invoke-MysqlScript -ScriptPath $importPath -Label "Importing data"

    Write-Host "Verifying row counts..."
    & $Mysql --defaults-extra-file="$defaultsFile" --database=MotionAnalysis --table --execute="
SELECT 'Activities' AS table_name, COUNT(*) AS row_count FROM Activities
UNION ALL SELECT 'Laps', COUNT(*) FROM Laps
UNION ALL SELECT 'TrackPoints', COUNT(*) FROM TrackPoints
UNION ALL SELECT 'ActivitySummaries', COUNT(*) FROM ActivitySummaries
UNION ALL SELECT 'ActivityZones', COUNT(*) FROM ActivityZones
UNION ALL SELECT 'DailyHealthSummaries', COUNT(*) FROM DailyHealthSummaries
UNION ALL SELECT 'SleepSummaries', COUNT(*) FROM SleepSummaries
UNION ALL SELECT 'RestingHeartRates', COUNT(*) FROM RestingHeartRates
UNION ALL SELECT 'BodyWeights', COUNT(*) FROM BodyWeights
UNION ALL SELECT 'DailyStressSummaries', COUNT(*) FROM DailyStressSummaries;
"
    if ($LASTEXITCODE -ne 0) {
        throw "Verification query failed with exit code $LASTEXITCODE"
    }
}
finally {
    if (Test-Path -LiteralPath $defaultsFile) {
        Remove-Item -LiteralPath $defaultsFile -Force
    }
}
