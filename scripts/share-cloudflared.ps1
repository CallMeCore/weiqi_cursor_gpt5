Param(
  [string]$LocalUrl = "http://localhost:8080",
  [string]$BinDir = "scripts/bin"
)

New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
$cf = Join-Path $BinDir "cloudflared.exe"
if (-not (Test-Path $cf)) {
  Write-Host "[cf] downloading cloudflared..."
  Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile $cf
}

$logOut = Join-Path $PSScriptRoot "cloudflared.out.log"
$logErr = Join-Path $PSScriptRoot "cloudflared.err.log"
if (Test-Path $logOut) { Remove-Item $logOut -Force }
if (Test-Path $logErr) { Remove-Item $logErr -Force }

Write-Host "[cf] starting tunnel for $LocalUrl (detached)"
$p = Start-Process -FilePath $cf -ArgumentList @("tunnel","--no-autoupdate","--url",$LocalUrl) -RedirectStandardOutput $logOut -RedirectStandardError $logErr -PassThru -WindowStyle Hidden

# Wait until public URL appears in log
$url = $null
for ($i=0; $i -lt 60; $i++) {
  try {
    if (Test-Path $logOut) {
      $txt = Get-Content -Path $logOut -Raw -ErrorAction SilentlyContinue
      if ($txt -match 'https://[a-z0-9\-]+\.trycloudflare\.com') { $url = $Matches[0]; break }
    }
    if (-not $url -and (Test-Path $logErr)) {
      $txte = Get-Content -Path $logErr -Raw -ErrorAction SilentlyContinue
      if ($txte -match 'https://[a-z0-9\-]+\.trycloudflare\.com') { $url = $Matches[0]; break }
    }
  } catch {}
  Start-Sleep -Milliseconds 500
}

if ($null -ne $url) {
  Write-Host "[cf] public URL: $url"
  Write-Host "[cf] tunnel is running in background (PID: $($p.Id))"
} else {
  Write-Warning "未获取到公网 URL，请查看日志: $logOut, $logErr"
}


