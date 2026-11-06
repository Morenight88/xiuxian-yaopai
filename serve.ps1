# 修仙也要拍 · 本地預覽伺服器 / local preview server
#
# 啟動方式 / how to start:
#   A) 雙擊 start-site.bat   （最簡單：會自動開瀏覽器、自動避開被占用的埠）
#   B) powershell -NoProfile -ExecutionPolicy Bypass -File .\serve.ps1
#
# 說明：這個伺服器只是讓瀏覽器把網站當成 http:// 來源（要接 Google Apps
# Script 後端、要穩定播放雲端影片時建議用它）。只是想看網站，直接雙擊
# index.html 也可以（示範模式）。
#
# 注意：這個檔案裡的「畫面輸出」刻意只用英文，避免 Windows PowerShell 在
# 沒有 BOM 的 UTF-8 檔名下把中文顯示成亂碼（中文註解不影響執行）。
#
param(
  [int]$Port = 8123,
  [switch]$NoBrowser
)

$root = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }

$mime = @{
  '.html'='text/html; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.js'='application/javascript; charset=utf-8'
  '.json'='application/json; charset=utf-8'; '.svg'='image/svg+xml'; '.png'='image/png'; '.jpg'='image/jpeg'
  '.jpeg'='image/jpeg'; '.gif'='image/gif'; '.webp'='image/webp'; '.mp4'='video/mp4'; '.webm'='video/webm'
  '.ico'='image/x-icon'; '.txt'='text/plain; charset=utf-8'; '.woff2'='font/woff2'; '.md'='text/plain; charset=utf-8'
}

# ── 自動找一個可用的埠（8123 → 8133 → 8143 …）──
$listener = $null
foreach ($p in @($Port, $Port + 10, $Port + 20, $Port + 30, $Port + 40, $Port + 52, $Port + 67, $Port + 108)) {
  $try = New-Object System.Net.HttpListener
  try {
    $try.Prefixes.Add("http://localhost:$p/")
    $try.Prefixes.Add("http://127.0.0.1:$p/")
    $try.Start()
    $listener = $try; $Port = $p; break
  } catch {
    try { $try.Close() } catch { }
  }
}

if (-not $listener) {
  Write-Host ""
  Write-Host "  [XiuXian Also Films] Could not start the local server." -ForegroundColor Red
  Write-Host "  Everything on this machine is already listening on ports $Port..$($Port+108)." -ForegroundColor Red
  Write-Host "" -ForegroundColor Red
  Write-Host "  Try one of these instead:" -ForegroundColor Yellow
  Write-Host "    1) double-click  start-site.bat 8321      (another port)" -ForegroundColor Yellow
  Write-Host "    2) double-click  index.html               (demo mode, no server needed)" -ForegroundColor Yellow
  Write-Host "" -ForegroundColor Yellow
  exit 1
}

$url = "http://localhost:$Port/"
Write-Host ""
Write-Host "  XiuXian Also Films  /  xiuxian-yaopai" -ForegroundColor Green
Write-Host "  serving:  $url" -ForegroundColor Green
Write-Host "  stop:     close this window, or press Ctrl+C" -ForegroundColor DarkGray
Write-Host ""

if (-not $NoBrowser) {
  try { Start-Process $url } catch { Write-Host "  (could not open the browser automatically - visit $url)" -ForegroundColor Yellow }
}

while ($listener.IsListening) {
  $ctx = $null
  try {
    $ctx = $listener.GetContext()
    $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    if ($path -eq '/' -or $path -eq '') { $path = '/index.html' }
    $full = [System.IO.Path]::GetFullPath((Join-Path $root ($path -replace '/', '\')))

    if (-not $full.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path $full -PathType Leaf)) {
      $ctx.Response.StatusCode = 404
      $bytes = [System.Text.Encoding]::UTF8.GetBytes('404 Not Found - ' + $path)
      Write-Host ("   404  " + $path) -ForegroundColor DarkGray
    } else {
      $ext = [System.IO.Path]::GetExtension($full).ToLower()
      if ($mime.ContainsKey($ext)) { $ctx.Response.ContentType = $mime[$ext] } else { $ctx.Response.ContentType = 'application/octet-stream' }
      $ctx.Response.Headers.Add('Cache-Control', 'no-store')
      $bytes = [System.IO.File]::ReadAllBytes($full)
      Write-Host ("   200  " + $path) -ForegroundColor DarkGray
    }
    $ctx.Response.ContentLength64 = $bytes.Length
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  } catch {
    Write-Host ("   [serve] " + $_.Exception.Message) -ForegroundColor DarkYellow
  } finally {
    if ($ctx) { try { $ctx.Response.Close() } catch { } }
  }
}
