param(
  [Parameter(Mandatory = $true)][string]$Token,
  [Parameter(Mandatory = $true)][string]$Version
)

$ErrorActionPreference = 'Stop'
$repo = 'chu-bing-yu/music-player'
$enc = New-Object System.Text.UTF8Encoding($false)
$files = @('plugin.js', 'manifest.json', 'README.md')

foreach ($f in $files) {
  $tmpA = [IO.Path]::GetTempFileName()
  & curl.exe -s -m 30 -o $tmpA -H "Authorization: token $Token" "https://api.github.com/repos/$repo/contents/$f`?ref=main"
  $raw = [IO.File]::ReadAllText($tmpA, [Text.Encoding]::UTF8)
  Remove-Item $tmpA -Force

  $m = [regex]::Match($raw, '"sha"\s*:\s*"([a-f0-9]+)"')
  if (-not $m.Success) {
    Write-Output "$f -> no sha"
    continue
  }

  $sha = $m.Groups[1].Value
  $b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path (Get-Location) $f)))
  $payload = @{ message = "release v$Version : $f"; content = $b64; sha = $sha } | ConvertTo-Json -Compress

  $tmp = [IO.Path]::GetTempFileName()
  [IO.File]::WriteAllText($tmp, $payload, $enc)

  $code = '000'
  $resp = ''
  for ($try = 1; $try -le 3; $try++) {
    $tmpR = [IO.Path]::GetTempFileName()
    $code = & curl.exe -sS -m 300 -o $tmpR -w "%{http_code}" -X PUT -H "Authorization: token $Token" -H "Content-Type: application/json" --data-binary "@$tmp" "https://api.github.com/repos/$repo/contents/$f"
    $resp = [IO.File]::ReadAllText($tmpR, [Text.Encoding]::UTF8)
    Remove-Item $tmpR -Force
    if ($resp -match '"commit"') { break }
    Start-Sleep -Seconds 3
  }
  Remove-Item $tmp -Force

  if ($resp -match '"commit"') {
    Write-Output "$f -> ok ($code)"
  } else {
    Write-Output ("$f -> HTTP " + $code + " " + $resp.Substring(0, [Math]::Min(140, $resp.Length)))
  }
}
