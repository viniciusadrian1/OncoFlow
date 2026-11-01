$ErrorActionPreference = 'Stop'

$appRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$workspaceRoot = [System.IO.Path]::GetFullPath((Join-Path $appRoot '..'))
$outputDirectory = Join-Path $workspaceRoot 'output\apk'
$sdkDirectory = $env:ANDROID_SDK_ROOT
if (-not $sdkDirectory) { $sdkDirectory = $env:ANDROID_HOME }
if (-not $sdkDirectory) { $sdkDirectory = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$signerPath = Join-Path $sdkDirectory 'build-tools\36.0.0\apksigner.bat'
if (-not (Test-Path -LiteralPath $signerPath)) {
  throw "Android build-tools 36.0.0 not found at $signerPath"
}

Push-Location $appRoot
try {
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw 'Web build failed.' }
  & npx.cmd cap sync android
  if ($LASTEXITCODE -ne 0) { throw 'Capacitor sync failed.' }
  Push-Location (Join-Path $appRoot 'android')
  try {
    & .\gradlew.bat assembleDebug
    if ($LASTEXITCODE -ne 0) { throw 'Android build failed.' }
  } finally { Pop-Location }

  $builtApk = Join-Path $appRoot 'android\app\build\outputs\apk\debug\app-debug.apk'
  & $signerPath verify --verbose $builtApk
  if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed.' }

  New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
  $exportedApk = Join-Path $outputDirectory 'OncoFlow-Paciente-demo-v0.11.1.apk'
  Copy-Item -LiteralPath $builtApk -Destination $exportedApk -Force
  $hashAlgorithm = [System.Security.Cryptography.SHA256]::Create()
  $apkStream = [System.IO.File]::OpenRead($exportedApk)
  try { $checksum = [System.BitConverter]::ToString($hashAlgorithm.ComputeHash($apkStream)).Replace('-', '').ToLowerInvariant() }
  finally { $apkStream.Dispose(); $hashAlgorithm.Dispose() }
  Set-Content -LiteralPath (Join-Path $outputDirectory 'SHA256SUMS-v0.11.1.txt') -Value "$checksum  OncoFlow-Paciente-demo-v0.11.1.apk" -Encoding ascii
  Write-Output "APK: $exportedApk"
  Write-Output "SHA256: $checksum"
} finally { Pop-Location }
