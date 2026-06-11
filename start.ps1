$ErrorActionPreference = "Stop"

$localNode = Get-Command node -ErrorAction SilentlyContinue
if ($localNode) {
  & $localNode.Source server.js
  exit $LASTEXITCODE
}

$bundledNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if (Test-Path $bundledNode) {
  & $bundledNode --no-warnings server.js
  exit $LASTEXITCODE
}

Write-Error "Node.js nao encontrado. Instale Node.js ou execute dentro do ambiente Codex."
