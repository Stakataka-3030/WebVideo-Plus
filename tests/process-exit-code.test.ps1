param([string]$OutputRoot=(Join-Path $PSScriptRoot '../.build/process-exit-code'))
$ErrorActionPreference='Stop'
if($env:OS -ne 'Windows_NT'){throw 'This regression requires Windows process handles and .NET Framework'}
$run=Join-Path ([IO.Path]::GetFullPath($OutputRoot)) ([Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $run -Force|Out-Null
$fixtureSource=Join-Path $run 'InertExit.cs';$fixture=Join-Path $run 'InertExit.exe'
[IO.File]::WriteAllText($fixtureSource,'using System;using System.Threading;class InertExit{static int Main(string[] args){Thread.Sleep(150);return Int32.Parse(args[0]);}}',(New-Object Text.UTF8Encoding($false)))
& (Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe') /nologo /target:winexe /platform:x64 ('/out:'+$fixture) $fixtureSource
if($LASTEXITCODE -ne 0){throw 'Self-generated process fixture failed to compile'}
$source=Join-Path $PSScriptRoot 'font-render-native.ps1'
$tokens=$null;$errors=$null
$ast=[System.Management.Automation.Language.Parser]::ParseFile($source,[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'Font test source did not parse'}
$function=$ast.Find({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Invoke-Checked'},$true)
if(-not $function){throw 'Actual font test process helper is missing'}
# Exercise the actual helper without invoking a renderer, WebView2 or media tool.
Invoke-Expression $function.Extent.Text
Invoke-Checked $fixture @('0') 'async-success' 5
$rejected=$false;$negativeMessage=''
try{Invoke-Checked $fixture @('7') 'async-failure' 5}catch{$negativeMessage=$_.Exception.Message;if($negativeMessage -notmatch 'failed with code 7;'){throw};$rejected=$true}
if(-not $rejected){throw 'Actual nonzero process exit was accepted'}
# Synchronous Start-Process -Wait already preserves the exit result; do not
# replace that separate workflow/check-runtime path with asynchronous polling.
$sync=@()
foreach($code in @(0,7)){
 $process=Start-Process -FilePath $fixture -ArgumentList @([string]$code) -WindowStyle Hidden -Wait -PassThru
 if($null -eq $process.ExitCode -or $process.ExitCode -ne $code){throw 'Synchronous Wait returned an incorrect exit code'}
 $sync += [pscustomobject]@{expected=$code;actual=$process.ExitCode}
}
[pscustomobject]@{passed=$true;checks=4;psVersion=$PSVersionTable.PSVersion.ToString();process64=[Environment]::Is64BitProcess;source=$source;sourceSha256=(Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant();asyncNonzeroRejection=$negativeMessage;synchronousWait=$sync;fixtureOnly=$true;renderingExecuted=$false} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $run 'result.json') -Encoding utf8
Write-Output ('PASS actual asynchronous font helper and synchronous Wait exit codes 0/7; evidence: '+$run)
