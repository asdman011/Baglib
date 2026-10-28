param(
  [Parameter(Mandatory = $true)][string]$PythonExecutable,
  [string]$RuntimeRoot = (Join-Path $PSScriptRoot '../.baglib-data/pdf-engine')
)
$ErrorActionPreference = 'Stop'
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
Write-Output ('PDF runtime provisioned at: ' + $engineRoot)
Write-Output 'Java/veraPDF must be provisioned separately for standards validation. No account sign-in was performed.'
