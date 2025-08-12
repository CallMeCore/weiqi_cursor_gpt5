Param(
  [Parameter(Mandatory=$true)][string]$Hostname,   # 你的域名，如 weiqi.example.com（需在 Cloudflare 托管）
  [string]$TunnelName = "weiqi-tunnel",
  [string]$LocalUrl = "http://localhost:8080",
  [string]$BinDir = "scripts/bin"
)

function Ensure-Cloudflared {
  New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
  $script:cf = Join-Path $BinDir "cloudflared.exe"
  if (-not (Test-Path $cf)) {
    Write-Host "[cf] downloading cloudflared..."
    Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile $cf
  }
}

function Run-CF { param([string[]]$Args) & $cf @Args }

Ensure-Cloudflared

# 1) Login（一次性）
Write-Host "[cf] login (浏览器将打开，请选择你的域并授权)"
Run-CF @("login")

# 2) Create tunnel（幂等）
Write-Host "[cf] creating tunnel: $TunnelName"
Run-CF @("tunnel","create",$TunnelName) | Out-Null

# 3) Query tunnel id
$listJson = Run-CF @("tunnel","list","--output","json")
if (-not $listJson) { throw "无法获取 tunnel 列表" }
$tunnels = $listJson | ConvertFrom-Json
$t = $tunnels | Where-Object { $_.name -eq $TunnelName } | Select-Object -First 1
if (-not $t) { throw "未找到 tunnel: $TunnelName" }
$tunnelId = $t.id

# 4) Write config
$confDir = Join-Path $env:USERPROFILE ".cloudflared"
New-Item -ItemType Directory -Force -Path $confDir | Out-Null
$cred = Join-Path $confDir ("{0}.json" -f $tunnelId)
$configPath = Join-Path $confDir ("config.{0}.yml" -f $TunnelName)

$yaml = @"
tunnel: $tunnelId
credentials-file: $cred

ingress:
  - hostname: $Hostname
    service: $LocalUrl
  - service: http_status:404
"@
$yaml | Set-Content -Path $configPath -Encoding UTF8
Write-Host "[cf] wrote config: $configPath"

# 5) Route DNS
Write-Host "[cf] routing DNS: $Hostname -> $TunnelName"
Run-CF @("tunnel","route","dns",$TunnelName,$Hostname)

# 6) Install Windows Service（自启动）
$svcName = "Cloudflared-" + $TunnelName
$bin = '"' + $cf + '"' + " tunnel run --config " + '"' + $configPath + '"' + " " + $TunnelName

Write-Host "[svc] installing service $svcName"
cmd /c "sc.exe create $svcName binPath= '$bin' start= auto" | Out-Null
cmd /c "sc.exe description $svcName Cloudflare Tunnel for $Hostname" | Out-Null

Start-Sleep -Seconds 1
Write-Host "[svc] starting service"
Start-Service -Name $svcName -ErrorAction SilentlyContinue

Start-Sleep -Seconds 2
Write-Host "[ok] 持久隧道已安装并启动。请将前端指向：wss://$Hostname"
Write-Host "[tip] 如在 GitHub Pages 使用：在地址后加 ?ws=wss://$Hostname"



