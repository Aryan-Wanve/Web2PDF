$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$manifestPath = Join-Path $root "manifest.json"
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$packageName = "web2pdf-$($manifest.version)"
$dist = Join-Path $root "dist"
$staging = Join-Path $dist "load-unpacked"
$zipPath = Join-Path $dist "$packageName.zip"

if (Test-Path -LiteralPath $staging) {
  Remove-Item -LiteralPath $staging -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $staging | Out-Null

$includeDirectories = @(
  "icons",
  "src"
)
$includeFiles = @(
  "manifest.json",
  "vendor/jspdf.umd.min.js"
)

foreach ($item in $includeDirectories) {
  $source = Join-Path $root $item
  $target = Join-Path $staging $item
  Copy-Item -LiteralPath $source -Destination $target -Recurse -Force
}

foreach ($item in $includeFiles) {
  $source = Join-Path $root $item
  $target = Join-Path $staging $item
  $targetDirectory = Split-Path -Parent $target
  New-Item -ItemType Directory -Force -Path $targetDirectory | Out-Null
  Copy-Item -LiteralPath $source -Destination $target -Force
}

if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}
Compress-Archive -Path (Join-Path $staging "*") -DestinationPath $zipPath -Force

Write-Host "Load unpacked folder: $staging"
Write-Host "Chrome Web Store ZIP: $zipPath"
