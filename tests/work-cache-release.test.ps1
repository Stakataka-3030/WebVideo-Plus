$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot -Parent
$taskTemp=Join-Path ([IO.Path]::GetTempPath()) ('webvideo-cache-release-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $taskTemp | Out-Null
try {
 $taskCore=Get-Content -LiteralPath (Join-Path $taskRoot 'src/Core.cs') -Raw
 $taskEnd=$taskCore.IndexOf(' public sealed class CommandResult ')
 if($taskEnd -lt 0){throw 'Production WorkCache extraction boundary changed'}
 $taskSource=$taskCore.Substring(0,$taskEnd)+' public static class App {public static readonly object LogLock=new object();} }'
 $taskSourcePath=Join-Path $taskTemp 'Core.cs'
 [IO.File]::WriteAllText($taskSourcePath,$taskSource,[Text.UTF8Encoding]::new($false))
 $taskExe=Join-Path $taskTemp 'WorkCacheChecks.exe'
 & (Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe') /nologo /target:exe /r:System.Web.Extensions.dll ('/out:'+$taskExe) $taskSourcePath (Join-Path $PSScriptRoot 'WorkCacheChecks.cs')
 if($LASTEXITCODE -ne 0){throw 'Production WorkCache test compilation failed'}
 & $taskExe $taskTemp
 if($LASTEXITCODE -ne 0){throw 'Production WorkCache test failed'}
} finally {
 $taskAbsolute=[IO.Path]::GetFullPath($taskTemp)
 if(-not $taskAbsolute.StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()),[StringComparison]::OrdinalIgnoreCase)){throw 'Unexpected temporary test root'}
 Remove-Item -LiteralPath $taskAbsolute -Recurse -Force
}
