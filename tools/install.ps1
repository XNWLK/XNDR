# Copies the addon into the game's AddOns folder (the live WoW: Forever client by default).
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/install.ps1
# A new file or a changed .toc needs a full restart of the game; changed .lua files only need /reload.
param([string]$AddOns = 'C:\Program Files (x86)\World of Warcraft\_forever_\Interface\AddOns')
$src = Join-Path (Split-Path $PSScriptRoot -Parent) 'XNDR'
$dst = Join-Path $AddOns 'XNDR'
if (-not (Test-Path $AddOns)) { Write-Output "AddOns folder not found: $AddOns"; exit 1 }
if (-not (Test-Path $dst)) { New-Item -ItemType Directory -Path $dst | Out-Null }
$n = 0
Get-ChildItem -Path $src -File | ForEach-Object { Copy-Item -Path $_.FullName -Destination (Join-Path $dst $_.Name) -Force; $n++ }
$bad = 0
Get-ChildItem -Path $src -File | ForEach-Object {
  $a = (Get-FileHash $_.FullName).Hash; $b = (Get-FileHash (Join-Path $dst $_.Name)).Hash
  if ($a -ne $b) { $bad++; Write-Output "DIFFERENT: $($_.Name)" }
}
$stale = Get-ChildItem -Path $dst -File | Where-Object { -not (Test-Path (Join-Path $src $_.Name)) }
foreach ($f in $stale) { Write-Output "NOTE: $($f.Name) is in the game's folder but no longer part of the addon (not loaded if the .toc does not list it)" }
Write-Output "$n files copied to $dst, $bad differ"
if ($bad -gt 0) { exit 1 }
