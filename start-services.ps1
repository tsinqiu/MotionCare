$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDirectory = Join-Path $repoRoot 'backend'
$frontendDirectory = Join-Path $repoRoot 'frontend'

# 启动后端；npm start 会先执行只读数据库结构检查
$backendJob = Start-Process -WindowStyle Hidden -FilePath "cmd" -ArgumentList "/c npm start" -WorkingDirectory $backendDirectory -PassThru
Start-Sleep -Milliseconds 1500
if ($backendJob.HasExited) {
    throw 'Backend startup failed. Run "cd backend; npm start" to view the database verification error.'
}
Write-Output "Backend started PID: $($backendJob.Id)"

# 启动前端
$frontendJob = Start-Process -WindowStyle Hidden -FilePath "cmd" -ArgumentList "/c npm run dev" -WorkingDirectory $frontendDirectory -PassThru
Write-Output "Frontend started PID: $($frontendJob.Id)"

Write-Output "Backend: http://localhost:8089"
Write-Output "Frontend: http://localhost:5173"
