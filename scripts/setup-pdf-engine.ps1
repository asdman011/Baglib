param(
  [Parameter(Mandatory = $true)][string]$PythonExecutable,
  [string]$RuntimeRoot
)
$ErrorActionPreference = 'Stop'
# Windows PowerShell leaves $PSScriptRoot empty inside param() under -File.
if (-not $RuntimeRoot) { $RuntimeRoot = Join-Path $PSScriptRoot '../.baglib-data/pdf-engine' }
$engineRoot = [IO.Path]::GetFullPath($RuntimeRoot)
New-Item -ItemType Directory -Path $engineRoot -Force | Out-Null
$venvRoot = Join-Path $engineRoot 'venv'
$enginePython = Join-Path $venvRoot 'Scripts/python.exe'
if (-not (Test-Path -LiteralPath $enginePython)) {
  & $PythonExecutable -m venv $venvRoot
  if ($LASTEXITCODE -ne 0) { throw 'Python virtual environment creation failed.' }
}
& $enginePython -m pip install -r (Join-Path $PSScriptRoot '../assets/pdf-editor/requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'PDF dependency installation failed.' }
$tessdataRoot = Join-Path $engineRoot 'tessdata'
New-Item -ItemType Directory -Path $tessdataRoot -Force | Out-Null
$models = @{
  'ara' = 'e3206d3dc87fd50c24a0fb9f01838615911d25168f4e64415244b67d2bb3e729'
  'eng' = '7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2'
}
foreach ($model in $models.Keys) {
  $target = Join-Path $tessdataRoot ($model + '.traineddata')
  if (-not (Test-Path -LiteralPath $target) -or (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $models[$model]) {
    $temporary = Join-Path $tessdataRoot ($model + '.download-' + [guid]::NewGuid().ToString('N'))
    try {
      Invoke-WebRequest -Uri ('https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/' + $model + '.traineddata') -OutFile $temporary
      if ((Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash.ToLowerInvariant() -ne $models[$model]) { throw 'OCR model checksum mismatch; inspect upstream changes before updating pins.' }
      Move-Item -LiteralPath $temporary -Destination $target -Force
    } finally { if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary } }
  }
}
Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/LICENSE' -OutFile (Join-Path $tessdataRoot 'LICENSE')
# Poppler supplies pdftohtml, which Stirling needs for its HTML and Markdown exports.
$popplerRoot = Join-Path $engineRoot 'poppler'
if (-not (Test-Path -LiteralPath (Join-Path $popplerRoot 'poppler-26.09.0/Library/bin/pdftohtml.exe'))) {
  $temporary = Join-Path $engineRoot ('poppler.download-' + [guid]::NewGuid().ToString('N') + '.zip')
  try {
    Invoke-WebRequest -Uri 'https://github.com/oschwartz10612/poppler-windows/releases/download/v26.09.0-0/Release-26.09.0-0.zip' -OutFile $temporary
    if ((Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash.ToLowerInvariant() -ne '7a6f256a0ddf7536182246a5733331bf4677cbcc34f4663774947ad34556c8d0') { throw 'Poppler checksum mismatch; inspect upstream changes before updating the pin.' }
    Expand-Archive -LiteralPath $temporary -DestinationPath $popplerRoot -Force
  } finally { if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary } }
}
# WeasyPrint renders HTML, Markdown, email and URL conversions, clipped PDFs and reader exports.
$weasyPrintRoot = Join-Path $engineRoot 'weasyprint'
if (-not (Test-Path -LiteralPath (Join-Path $weasyPrintRoot 'weasyprint.exe'))) {
  $temporary = Join-Path $engineRoot ('weasyprint.download-' + [guid]::NewGuid().ToString('N') + '.zip')
  $extracted = Join-Path $engineRoot ('weasyprint.extract-' + [guid]::NewGuid().ToString('N'))
  try {
    Invoke-WebRequest -Uri 'https://github.com/Kozea/WeasyPrint/releases/download/v70.0/weasyprint-windows-onedir.zip' -OutFile $temporary
    if ((Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash.ToLowerInvariant() -ne 'ab1151f210b4e6bb7aa7a79e91a67e8ddb760094c107bfda55241b6aaefe7d53') { throw 'WeasyPrint checksum mismatch; inspect upstream changes before updating the pin.' }
    Expand-Archive -LiteralPath $temporary -DestinationPath $extracted -Force
    Move-Item -LiteralPath (Join-Path $extracted 'onedir/weasyprint') -Destination $weasyPrintRoot
  } finally {
    if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary }
    if (Test-Path -LiteralPath $extracted) { Remove-Item -LiteralPath $extracted -Recurse }
  }
}
# OCRmyPDF and its dependencies, locked to Windows x64 wheels for CPython 3.12.
& $enginePython -m pip install --require-hashes -r (Join-Path $PSScriptRoot '../assets/pdf-editor/requirements-ocr.txt')
if ($LASTEXITCODE -ne 0) { throw 'OCRmyPDF installation failed.' }

# Runs a pinned NSIS installer without elevation, so it cannot touch machine settings or the system PATH.
function Install-Pinned([string]$Name, [string]$Uri, [string]$Sha256, [string[]]$Arguments) {
  $temporary = Join-Path $engineRoot ($Name + '.download-' + [guid]::NewGuid().ToString('N') + '.exe')
  try {
    Invoke-WebRequest -Uri $Uri -OutFile $temporary
    if ((Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Sha256) { throw ($Name + ' checksum mismatch; inspect upstream changes before updating the pin.') }
    $env:__COMPAT_LAYER = 'RunAsInvoker'
    $installer = Start-Process -FilePath $temporary -ArgumentList $Arguments -PassThru
    # Ghostscript's silent installer can keep its window open after it finishes.
    if (-not $installer.WaitForExit(180000)) { Stop-Process -Id $installer.Id -Force }
  } finally {
    Remove-Item Env:__COMPAT_LAYER -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary }
  }
}

# OCRmyPDF needs Ghostscript on Windows. Stirling looks for a command named gs, which this installer does not create.
$ghostscriptBin = Join-Path $engineRoot 'ghostscript/bin'
if (-not (Test-Path -LiteralPath (Join-Path $ghostscriptBin 'gswin64c.exe'))) {
  Install-Pinned 'ghostscript' 'https://github.com/ArtifexSoftware/ghostpdl-downloads/releases/download/gs10080/gs10080w64.exe' '52a91b8bf09298788d7a57b9206127026c23eacd75405f0a131e26dc381dce50' @('/S', ('/D=' + (Join-Path $engineRoot 'ghostscript')))
  if (-not (Test-Path -LiteralPath (Join-Path $ghostscriptBin 'gswin64c.exe'))) { throw 'Ghostscript installation failed.' }
}
if (-not (Test-Path -LiteralPath (Join-Path $ghostscriptBin 'gs.exe'))) { Copy-Item -LiteralPath (Join-Path $ghostscriptBin 'gswin64c.exe') -Destination (Join-Path $ghostscriptBin 'gs.exe') }

# UB Mannheim's Windows build. Unelevated, it ignores /D and installs for the current user, so it is moved afterwards.
$tesseractRoot = Join-Path $engineRoot 'tesseract'
if (-not (Test-Path -LiteralPath (Join-Path $tesseractRoot 'tesseract.exe'))) {
  $userInstall = Join-Path $env:LOCALAPPDATA 'Programs/Tesseract-OCR'
  if (Test-Path -LiteralPath $userInstall) { throw ('Tesseract already exists at ' + $userInstall + '; copy it to ' + $tesseractRoot + ' or remove it first.') }
  Install-Pinned 'tesseract' 'https://github.com/UB-Mannheim/tesseract/releases/download/v5.4.0.20240606/tesseract-ocr-w64-setup-5.4.0.20240606.exe' 'c885fff6998e0608ba4bb8ab51436e1c6775c2bafc2559a19b423e18678b60c9' @('/S')
  if (-not (Test-Path -LiteralPath (Join-Path $userInstall 'tesseract.exe'))) { throw 'Tesseract installation failed.' }
  Move-Item -LiteralPath $userInstall -Destination $tesseractRoot
}

# Tesseract reads its hocr config from the language folder, so it needs more than the language files.
$bestRoot = Join-Path $engineRoot 'ocr-best'
New-Item -ItemType Directory -Path $bestRoot -Force | Out-Null
$bestArabic = Join-Path $bestRoot 'ara.traineddata'
$bestArabicSha256 = 'ab9d157d8e38ca00e7e39c7d5363a5239e053f5b0dbdb3167dde9d8124335896'
if (-not (Test-Path -LiteralPath $bestArabic) -or (Get-FileHash -LiteralPath $bestArabic -Algorithm SHA256).Hash.ToLowerInvariant() -ne $bestArabicSha256) {
  $temporary = Join-Path $bestRoot ('ara.download-' + [guid]::NewGuid().ToString('N'))
  try {
    Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/main/ara.traineddata' -OutFile $temporary
    if ((Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash.ToLowerInvariant() -ne $bestArabicSha256) { throw 'OCR model checksum mismatch; inspect upstream changes before updating pins.' }
    Move-Item -LiteralPath $temporary -Destination $bestArabic -Force
  } finally { if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary } }
}
Copy-Item -LiteralPath (Join-Path $tessdataRoot 'eng.traineddata') -Destination $bestRoot -Force
foreach ($item in 'configs', 'tessconfigs', 'osd.traineddata', 'pdf.ttf') { Copy-Item -LiteralPath (Join-Path $tesseractRoot ('tessdata/' + $item)) -Destination $bestRoot -Recurse -Force }
Write-Output ('PDF runtime provisioned at: ' + $engineRoot)
Write-Output 'Java/veraPDF must be provisioned separately for standards validation. No account sign-in was performed.'
