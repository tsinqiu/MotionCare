# 启动后端
$backendJob = Start-Process -NoNewWindow -FilePath "node" -ArgumentList "src/server.js" -WorkingDirectory "backend" -PassThru
Write-Output "Backend started PID: $($backendJob.Id)"

# 启动前端
$frontendJob = Start-Process -NoNewWindow -FilePath "cmd" -ArgumentList "/c npm run dev" -WorkingDirectory "frontend" -PassThru
Write-Output "Frontend started PID: $($frontendJob.Id)"

Write-Output "Backend: http://localhost:8089"
Write-Output "Frontend: http://localhost:5173"
