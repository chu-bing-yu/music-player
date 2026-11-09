# =========================================================
#  Publish a MAJOR release to the release repo.
#  Only final artifacts are uploaded: plugin.js + manifest.json
#
#  Why not git push:
#    this machine cannot reach github.com:443, git-over-HTTPS fails;
#    only api.github.com works, so we use the Contents API.
#
#  Usage:
#    $env:GH_TOKEN = '<PAT>'
#    powershell -File dev\publish-release.ps1
#    powershell -File dev\publish-release.ps1 -Repo suhshzh/music-player
#    powershell -File dev\publish-release.ps1 -DryRun
#
#  Notes:
#    - manifest author/entry are rewritten for the release repo in memory only;
#      the local files keep pointing at the test repo (chu-bing-yu).
#    - version comes from manifest.json; release line must be greater than
#      what is already online (1.0.0 -> 1.1.0 ...).
# =========================================================
param(
  [string]$Repo = 'suhshzh/music-player',
  [string]$Branch = 'main',
  [string]$Msg = '',
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$token = $env:GH_TOKEN
if (-not $token -and -not $DryRun) {
  Write-Output 'Set env var GH_TOKEN first (GitHub PAT with Contents read/write).'
  exit 1
}

$version = (node -e "process.stdout.write(require('./manifest.json').version)")
if (-not $Msg) { $Msg = "v$version" }

# -Encoding UTF8: PS 5.1 默认按 ANSI 读，中文会乱码导致 ConvertFrom-Json 失败
$manifest = Get-Content (Join-Path $root 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$manifest.entry = "https://raw.githubusercontent.com/$Repo/$Branch/plugin.js"
$manifest.author = ($Repo -split '/')[0]
$manifestJson = $manifest | ConvertTo-Json -Depth 6

if ($DryRun) {
  Write-Output "==> dry-run: $Repo@$Branch  v$version"
  Write-Output $manifestJson
  Write-Output '==> local plugin.js header:'
  Get-Content (Join-Path $root 'plugin.js') -TotalCount 1
  exit 0
}

$h = @{
  Authorization          = "Bearer $token"
  'User-Agent'           = 'music-player-release'
  'X-GitHub-Api-Version' = '2022-11-28'
}
$api = "https://api.github.com/repos/$Repo/contents"

function Get-RemoteSha([string]$name) {
  try {
    $r = Invoke-RestMethod -Uri ($api + '/' + $name + '?ref=' + $Branch) -Headers $h
    return $r.sha
  } catch {
    return $null
  }
}

function Put-Content([string]$name, [byte[]]$raw) {
  $payload = @{
    message = "$Msg : $name"
    branch  = $Branch
    content = [Convert]::ToBase64String($raw)
  }
  $sha = Get-RemoteSha $name
  if ($sha) { $payload.sha = $sha }
  $bytes = [Text.Encoding]::UTF8.GetBytes(($payload | ConvertTo-Json -Compress))
  $res = Invoke-RestMethod -Method Put -Uri ($api + '/' + $name) -Headers $h -Body $bytes -ContentType 'application/json'
  Write-Output ("ok {0} -> {1}" -f $name, $res.commit.sha.Substring(0, 8))
}

Write-Output "==> upload to $Repo@$Branch  v$version"
Put-Content 'plugin.js' ([IO.File]::ReadAllBytes((Join-Path $root 'plugin.js')))
Put-Content 'manifest.json' ([Text.Encoding]::UTF8.GetBytes($manifestJson))
Write-Output "done: https://raw.githubusercontent.com/$Repo/$Branch/manifest.json"
