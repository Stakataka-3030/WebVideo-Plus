# Compile the actual installer form, but substitute inert delayed operations.
# The child TEMP is isolated so even failure diagnostics cannot overwrite a real
# installer's log. No Craft executable or packaged coordinator is executed.
$ErrorActionPreference='Stop'
if($env:OS -ne 'Windows_NT'){throw 'The Setup GUI regression requires Windows WinForms.'}
$temp=Join-Path ([IO.Path]::GetTempPath()) ('craft-setup-gui-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
try {
 $compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
 $checks=Join-Path $temp 'SetupGuiChecks.exe'
 & $compiler /nologo /target:exe /main:SetupGuiChecks /platform:x64 ('/out:'+$checks) /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll (Join-Path $PSScriptRoot '../CraftSetup.cs') (Join-Path $PSScriptRoot '../installer/ManifestVerifier.cs') (Join-Path $PSScriptRoot '../installer/SetupPaths.cs') (Join-Path $PSScriptRoot '../installer/ProductRouting.cs') (Join-Path $PSScriptRoot '../installer/SetupContracts.cs') (Join-Path $PSScriptRoot 'SetupGuiChecks.cs')
 if($LASTEXITCODE -ne 0){throw 'Setup GUI regression compilation failed'}
 $info=New-Object Diagnostics.ProcessStartInfo
 $info.FileName=$checks;$info.UseShellExecute=$false;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
 $info.EnvironmentVariables['TEMP']=$temp;$info.EnvironmentVariables['TMP']=$temp
 $process=[Diagnostics.Process]::Start($info)
 $stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
 # Timeout may terminate this synthetic test only; production Setup has no kill.
 if(-not $process.WaitForExit(90000)){$process.Kill();throw 'Synthetic Setup GUI regression timed out'}
 [Threading.Tasks.Task]::WaitAll(@($stdout,$stderr))
 Write-Output $stdout.Result
 if($process.ExitCode -ne 0){throw ('Setup GUI regression failed: '+$stderr.Result)}
}finally{if($process){$process.Dispose()};Remove-Item -LiteralPath $temp -Recurse -Force}
