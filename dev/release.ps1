param(
  [string]$Msg = 'update'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# 版本号以 package.json 为准
# 用 node 读，避免 PowerShell 按 ANSI 解码 UTF-8 导致 ConvertFrom-Json 失败
$version = (node -e "process.stdout.write(require('./package.json').version)")
$manifestVersion = (node -e "process.stdout.write(require('./manifest.json').version)")

if ($version -ne $manifestVersion) {
  Write-Output "版本号不一致：package.json=$version  manifest.json=$manifestVersion"
  exit 1
}

Write-Output "==> build"
npm run build

Write-Output "==> test"
node --test

Write-Output "==> commit v$version"
git add -A
git commit -m "v$version : $Msg"

Write-Output "==> push"
git push origin main

Write-Output "完成：v$version 已推送到 origin/main"
