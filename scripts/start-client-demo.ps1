param([switch]$NoBrowser,[switch]$Stop)
$ErrorActionPreference='Stop'
$demoRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$demoTools=Join-Path $demoRoot '.tools'
$stateFile=Join-Path $demoTools 'client-demo-process.json'
$demoPort=3011
$demoOrigin='http://127.0.0.1:'+ $demoPort
Set-Location -LiteralPath $demoRoot
if($Stop){
  if(Test-Path -LiteralPath $stateFile){
    $state=Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
    $running=Get-Process -Id $state.pid -ErrorAction SilentlyContinue
    if($running -and $running.ProcessName -eq 'node' -and $running.StartTime.ToUniversalTime().ToString('o') -eq $state.started){Stop-Process -Id $running.Id;Write-Host 'Demonstracao encerrada.'}
    else{Write-Host 'O processo desta demonstracao ja foi encerrado.'}
  }else{Write-Host 'Nenhum processo de demonstracao registrado.'}
  exit 0
}
$nodeCommand=Get-Command node.exe -ErrorAction SilentlyContinue
if(!$nodeCommand){throw 'Instale Node.js 24 LTS e abra novamente Iniciar-Demonstracao-JPN.cmd.'}
$nodeVersion=& $nodeCommand.Source --version
if($nodeVersion -notmatch '^v24\.'){throw 'Esta demonstracao requer Node.js 24 LTS.'}
New-Item -ItemType Directory -Path $demoTools -Force | Out-Null
if(!(Test-Path -LiteralPath (Join-Path $demoRoot 'node_modules\next\package.json'))){
  Write-Host 'Preparando dependencias fixadas do JPN. A primeira abertura requer internet.'
  $npxCommand=Get-Command npx.cmd -ErrorAction Stop
  & $npxCommand.Source --yes pnpm@12.15.0 install --frozen-lockfile
  if($LASTEXITCODE -ne 0){throw 'Nao foi possivel preparar as dependencias. Confira a conexao com a internet.'}
}
function Get-DemoReady{
  try{$r=Invoke-RestMethod -Uri ($demoOrigin+'/api/demonstration') -TimeoutSec 2;return $r.application -eq 'jpn-client-demo' -and $r.version -eq 'm351'}catch{return $false}
}
if(!(Get-DemoReady)){
  $listeners=[Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()
  if($listeners | Where-Object {$_.Port -eq $demoPort}){throw ('A porta '+$demoPort+' esta ocupada por outro servico. Ele foi preservado.')}
  $env:JPN_LOCAL_PORT=[string]$demoPort
  $pythonLocal=Join-Path $demoRoot '.venv\Scripts\python.exe'
  if(!$env:JPN_PYTHON_EXECUTABLE -and (Test-Path -LiteralPath $pythonLocal)){$env:JPN_PYTHON_EXECUTABLE=$pythonLocal}
  if(!$env:JPN_PYTHON_EXECUTABLE){Write-Host 'Python nao configurado: a evidencia historica identificada continua disponivel na demonstracao.'}
  $server=Start-Process -FilePath $nodeCommand.Source -ArgumentList @('scripts/dev-structural.mjs') -WorkingDirectory $demoRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $demoTools 'client-demo-server.log') -RedirectStandardError (Join-Path $demoTools 'client-demo-server-error.log')
  @{pid=$server.Id;started=$server.StartTime.ToUniversalTime().ToString('o');port=$demoPort} | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding utf8
  Write-Host 'Abrindo a demonstracao local. Aguarde a preparacao inicial...'
  $ready=$false
  for($attempt=0;$attempt -lt 60;$attempt++){
    if(Get-DemoReady){$ready=$true;break}
    if($server.HasExited){throw ('O JPN nao iniciou. Consulte '+(Join-Path $demoTools 'client-demo-server-error.log'))}
    Start-Sleep -Seconds 1
  }
  if(!$ready){throw ('Inicializacao nao confirmada. Consulte '+(Join-Path $demoTools 'client-demo-server-error.log'))}
}
$demoUrl=$demoOrigin+'/demonstracao'
# Compile the actual presentation before announcing readiness or opening it.
$null=Invoke-WebRequest -Uri $demoUrl -UseBasicParsing -TimeoutSec 60
Write-Host ('Demonstracao: '+$demoUrl)
Write-Host 'Use Encerrar-Demonstracao-JPN.cmd para encerrar apenas este servidor local.'
if(!$NoBrowser){Start-Process -FilePath $demoUrl}
