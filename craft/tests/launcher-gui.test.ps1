# Compile the actual launcher UI and mutex, but use only inert delayed operations.
$ErrorActionPreference='Stop'
if($env:OS -ne 'Windows_NT'){throw 'The launcher GUI regression requires Windows WinForms.'}
$temp=Join-Path ([IO.Path]::GetTempPath()) ('craft-launcher-gui-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
try {
 $compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
 $checks=Join-Path $temp 'LauncherGuiChecks.exe'
 & $compiler /nologo /target:exe /main:LauncherGuiChecks /platform:x64 ('/out:'+$checks) /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll (Join-Path $PSScriptRoot '../CraftStarter.cs') (Join-Path $PSScriptRoot '../installer/ManifestVerifier.cs') (Join-Path $PSScriptRoot 'LauncherGuiChecks.cs')
 if($LASTEXITCODE -ne 0){throw 'Launcher GUI regression compilation failed'}
 $info=New-Object Diagnostics.ProcessStartInfo
 $info.FileName=$checks;$info.UseShellExecute=$false;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
 $info.EnvironmentVariables['TEMP']=$temp;$info.EnvironmentVariables['TMP']=$temp
 $process=[Diagnostics.Process]::Start($info)
 $stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
 if(-not $process.WaitForExit(90000)){$process.Kill();throw 'Synthetic launcher GUI regression timed out'}
 [Threading.Tasks.Task]::WaitAll(@($stdout,$stderr));Write-Output $stdout.Result
 if($process.ExitCode -ne 0){throw ('Launcher GUI regression failed: '+$stderr.Result)}
}finally{if($process){$process.Dispose()};Remove-Item -LiteralPath $temp -Recurse -Force}
