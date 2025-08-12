Param(
  [int]$Port = 8080,
  [int]$BoardSize = 19,
  [double]$Komi = 7.5,
  [ValidateSet('B','W')][string]$Color = 'B',
  [switch]$Tunnel
)

function Ensure-Node {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js not found. Please install Node 18+ and re-run this script."; exit 1
  }
}

function Ensure-ServerDeps {
  Push-Location "server"
  if (-not (Test-Path "node_modules")) {
    Write-Host "[deps] Installing backend dependencies..."
    npm ci 2>$null; if ($LASTEXITCODE -ne 0) { npm install }
  }
  Pop-Location
}

function Start-Backend {
  Write-Host "[server] Starting backend..."
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = "npm"
  $psi.Arguments = "start"
  $psi.WorkingDirectory = (Resolve-Path "server").Path
  $psi.UseShellExecute = $true
  $proc = [System.Diagnostics.Process]::Start($psi)
  Start-Sleep -Milliseconds 500
}

function Wait-Ready([string]$url, [int]$timeoutSec = 30) {
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 3
      if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { return $true }
    } catch {}
    Start-Sleep -Milliseconds 500
  }
  return $false
}

function Start-TunnelIfNeeded {
  if ($Tunnel) {
    Write-Host "[tunnel] Starting Cloudflare Tunnel..."
    & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "share-cloudflared.ps1") | Out-Host
  }
}

Ensure-Node
Ensure-ServerDeps
Start-Backend
Start-TunnelIfNeeded

$base = "http://127.0.0.1:$Port";
if (-not (Wait-Ready "$base" 40)) {
  Write-Warning "Backend not ready in time. Please open http://127.0.0.1:8080 manually."
  exit 0
}

$qs = "autostart=1&size=$BoardSize&komi=$Komi&color=$Color"
$url = "$base/?$qs"
Write-Host "[open] $url"
Start-Process $url | Out-Null


