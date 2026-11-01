param([switch]$Build, [ValidateRange(1, 65535)][int]$Port = 3000)
$ErrorActionPreference = 'Stop'
$platformRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
$previousPort = $env:PORT
$npmCommand = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
if (-not $npmCommand) { $npmCommand = (Get-Command npm -ErrorAction Stop).Source }
Push-Location $platformRoot
try {
  $env:PORT = [string]$Port
  if ($Build -or -not (Test-Path -LiteralPath (Join-Path $platformRoot 'dist\app\index.html'))) {
    & $npmCommand run build:platform
    if ($LASTEXITCODE -ne 0) { throw 'Não foi possível preparar a plataforma.' }
  }
  & $npmCommand run start:platform
  if ($LASTEXITCODE -ne 0) { throw 'O servidor foi encerrado com erro.' }
} finally {
  $env:PORT = $previousPort
  Pop-Location
}
