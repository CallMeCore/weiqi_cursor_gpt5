Param(
  [string]$App = "weiqi-cusor-gpt5",
  [string]$Region = "hkg",
  [string]$Volume = "katago_data",
  [int]$VolumeSize = 10,
  [string]$KatagoZip = "https://github.com/lightvector/KataGo/releases/download/v1.16.3/katago-v1.16.3-eigen-linux-x64.zip",
  [string]$ModelUrl = "https://media.katagotraining.org/uploaded/networks/models/kata1/kata1-b28c512nbt-s9584861952-d4960414494.bin.gz",
  [string]$CfgUrl = "https://raw.githubusercontent.com/lightvector/KataGo/master/cpp/configs/gtp_example.cfg"
)

Write-Host "[deploy] app=$App region=$Region"

if (-not (Get-Command flyctl -ErrorAction SilentlyContinue)) {
  Write-Error "未检测到 flyctl，请先安装并确保在 PATH 中: https://fly.io/docs/hands-on/install-flyctl/"; exit 1
}

Push-Location $PSScriptRoot
Set-Location ..  # repo root

# 1) 创建应用（若不存在）
try {
  $appsJson = flyctl apps list --json 2>$null
  $apps = @()
  if ($appsJson) { $apps = $appsJson | ConvertFrom-Json }
  if (-not ($apps | Where-Object { $_.Name -eq $App })) {
    Write-Host "[fly] creating app $App"
    flyctl apps create $App | Out-Host
  } else {
    Write-Host "[fly] app $App exists"
  }
} catch { Write-Warning $_ }

# 2) 创建卷（若不存在）
try {
  $volsJson = flyctl volumes list --app $App --json 2>$null
  $vols = @()
  if ($volsJson) { $vols = $volsJson | ConvertFrom-Json }
  if (-not ($vols | Where-Object { $_.Name -eq $Volume -and $_.Region -eq $Region })) {
    Write-Host "[fly] creating volume $Volume in $Region size=$VolumeSize"
    flyctl volumes create $Volume --size $VolumeSize --region $Region --app $App | Out-Host
  } else {
    Write-Host "[fly] volume $Volume exists"
  }
} catch { Write-Warning $_ }

# 3) 部署镜像
Write-Host "[fly] deploying..."
flyctl deploy --app $App | Out-Host

# 4) 首次置入 KataGo 与模型（若缺失）
$remote = "/bin/bash -lc `"set -e && mkdir -p /app/server/katago-linux && cd /app/server/katago-linux && " +
  "if [ ! -f katago ]; then curl -L -o katago.zip '$KatagoZip' && apt-get update && apt-get install -y unzip && unzip -q katago.zip || true && " +
  "(mv katago-v*/katago ./katago 2>/dev/null || true) && chmod +x katago || true && rm -rf katago.zip katago-v*; fi && " +
  "if [ ! -f default_model.bin.gz ]; then curl -L -o default_model.bin.gz '$ModelUrl'; fi && " +
  "if [ ! -f default_gtp.cfg ]; then curl -L -o default_gtp.cfg '$CfgUrl'; fi`""

Write-Host "[fly] provisioning katago and model..."
flyctl ssh console --app $App -C $remote | Out-Host

Write-Host "[fly] open app url:"
flyctl open --app $App | Out-Host

Pop-Location



