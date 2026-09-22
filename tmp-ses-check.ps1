$uri = 'https://docs.google.com/spreadsheets/d/1CDe_Sh58Z3gIGcHishuWrrPC58iIdXRUFXld3rdYpZ0/gviz/tq?tqx=out:json&sheet=SES'
$raw = (Invoke-WebRequest -Uri $uri -UseBasicParsing -TimeoutSec 90).Content
$json = [regex]::Match($raw, 'google\.visualization\.Query\.setResponse\(([\s\S]+)\)\s*;?\s*$').Groups[1].Value
$data = $json | ConvertFrom-Json

function FormatCell($c) {
  if ($null -eq $c) { return '' }
  $f = if ($null -ne $c.f) { ([string]$c.f).Trim() } else { '' }
  if ($f) { return $f }
  if ($null -eq $c.v) { return '' }
  return ([string]$c.v).Trim()
}

function NormLot([string]$v) {
  return (($v -replace '\u00a0', ' ') -replace '\s+', ' ').Trim().ToLowerInvariant()
}

function MatchLot([string]$cell, [string]$cand) {
  $nc = NormLot $cell
  $ncan = NormLot $cand
  if (-not $nc) { return $false }
  if ($nc -eq $ncan) { return $true }
  return ($nc.Contains($ncan) -or $ncan.Contains($nc))
}

function ParseMoney([string]$text) {
  $t = $text.Trim()
  if (-not $t -or $t -eq '-') { return $null }
  if ($t -match '^R\$\s*(.+)$') { $t = $Matches[1] }
  $t = ($t -replace '[R$\s]', '')
  if ($t -match ',') { return [double]($t -replace '\.', '' -replace ',', '.') }
  return [double]$t
}

function ParseDate([string]$text) {
  $t = $text.Trim()
  if (-not $t) { return $null }
  if ($t -match '^Date\((\d+),(\d+),(\d+)\)$') {
    return Get-Date -Year ([int]$Matches[1]) -Month ([int]$Matches[2] + 1) -Day ([int]$Matches[3])
  }
  if ($t -match '^(\d{1,2})/(\d{1,2})/(\d{4})') {
    return Get-Date -Year ([int]$Matches[3]) -Month ([int]$Matches[2]) -Day ([int]$Matches[1])
  }
  return $null
}

$from = Get-Date '2026-09-01'
$to = Get-Date '2026-09-30'
$lots = @('SES - LOTE 10', 'SES - LOTE 12', 'SES - LOTE 14', 'SES - LOTE 17')

foreach ($lot in $lots) {
  $sum = 0.0
  $count = 0
  foreach ($r in $data.table.rows) {
    $lote = FormatCell $r.c[8]
    if (-not (MatchLot $lote $lot)) { continue }
    $em = FormatCell $r.c[10]
    $d = ParseDate $em
    if ($null -eq $d) { continue }
    if ($d -lt $from -or $d -gt $to) { continue }
    $m = ParseMoney (FormatCell $r.c[13])
    if ($null -ne $m) { $sum += $m; $count++ }
  }
  Write-Output "$lot count=$count sum=$([math]::Round($sum, 2))"
}

Write-Output '--- sep emissao rows detail ---'
foreach ($r in $data.table.rows) {
  $em = FormatCell $r.c[10]
  if ($em -ne '18/09/2026') { continue }
  $lote = FormatCell $r.c[8]
  $mesR = FormatCell $r.c[0]
  $anoR = FormatCell $r.c[1]
  $rec = FormatCell $r.c[11]
  $bruto = FormatCell $r.c[13]
  Write-Output "$lote emissao=$em receb='$rec' mesR=$mesR anoR=$anoR bruto=$bruto"
}

# Check dangerous includes: does lote 10 candidate match 12/14 cells?
Write-Output '--- cross-match check ---'
foreach ($cell in @('SES - LOTE 10', 'SES - LOTE 12', 'SES - LOTE 14')) {
  foreach ($cand in @('SES - LOTE 10', 'SES - LOTE 12', 'SES - LOTE 14')) {
    $m = MatchLot $cell $cand
    if ($m) { Write-Output "MATCH cell=[$cell] cand=[$cand]" }
  }
}
