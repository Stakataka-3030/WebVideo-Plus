# Test-only owned-process lifecycle. PowerShell 7 is required for Kill(entireProcessTree).
# An open process handle, not a later PID lookup, remains the ownership authority.
function Start-SceneTailOwnedProcess([string]$Command,[string[]]$Arguments,[string]$Name,[string]$Directory){
 $process=Start-Process -FilePath $Command -ArgumentList $Arguments -PassThru -WindowStyle Hidden -WorkingDirectory $Directory -RedirectStandardOutput (Join-Path $Directory "$Name.log") -RedirectStandardError (Join-Path $Directory "$Name-error.log")
 $null=$process.Handle
 return [pscustomobject]@{Process=$process;ProcessId=[int]$process.Id;Name=$Name;Directory=$Directory;ExitObserved=$false;ExitCode=$null;Disposed=$false;KillAttempted=$false;CleanupError=$null}
}
function Wait-SceneTailOwnedProcess($Owned,[int]$TimeoutMilliseconds=240000){
 if($Owned.Disposed){throw "Cannot wait a disposed owned process: $($Owned.Name) pid=$($Owned.ProcessId)"}
 if(-not $Owned.Process.WaitForExit($TimeoutMilliseconds)){throw [TimeoutException]::new("$($Owned.Name) timed out; pid=$($Owned.ProcessId); evidence=$($Owned.Directory)")}
 $Owned.Process.WaitForExit()
 $Owned.ExitCode=$Owned.Process.ExitCode;$Owned.ExitObserved=$true
 if($null-eq$Owned.ExitCode-or$Owned.ExitCode-ne0){throw "$($Owned.Name) failed: exit=$($Owned.ExitCode); pid=$($Owned.ProcessId); evidence=$($Owned.Directory)"}
}
function Close-SceneTailOwnedProcess($Owned,[int]$TimeoutMilliseconds=10000){
 if($Owned.Disposed){return} # Never query a disposed process again.
 try{
  $process=$Owned.Process
  if(-not $Owned.ExitObserved){
   # A method call fails explicitly for an invalid/disposed handle; a missing
   # PowerShell property must never be mistaken for a live process or PID.
   if(-not $process.WaitForExit(0)){
    if($Owned.ProcessId-le0-or$process.Id-ne$Owned.ProcessId){throw 'Owned process identity is invalid'}
    $Owned.KillAttempted=$true
    try{$process.Kill($true)}catch{if(-not $process.WaitForExit(0)){throw}} # Natural-exit race only.
    if(-not $process.WaitForExit($TimeoutMilliseconds)){throw 'Owned process did not exit after tree termination'}
   }
   $process.WaitForExit();$Owned.ExitCode=$process.ExitCode;$Owned.ExitObserved=$true
  }
  $process.Dispose();$Owned.Process=$null;$Owned.Disposed=$true
 }catch{
  $Owned.CleanupError="Cleanup failed for owned $($Owned.Name) pid=$($Owned.ProcessId): $($_.Exception.Message)"
  throw $Owned.CleanupError
 }
}
function Complete-SceneTailOwnedProcesses([object[]]$Owned,$Failure=$null){
 $cleanupErrors=@()
 foreach($item in $Owned){try{Close-SceneTailOwnedProcess $item}catch{$cleanupErrors+=$_.Exception.Message}}
 if($cleanupErrors.Count){
  $prefix=if($null-ne$Failure){$Failure.Exception.Message+'; '}else{''}
  throw ($prefix+($cleanupErrors -join '; '))
 }
 if($null-ne$Failure){throw $Failure}
}
function Invoke-SceneTailCheckedProcess([string]$Command,[string[]]$Arguments,[string]$Name,[string]$Directory,[int]$TimeoutMilliseconds=240000){
 $owned=Start-SceneTailOwnedProcess $Command $Arguments $Name $Directory;$failure=$null
 try{Wait-SceneTailOwnedProcess $owned $TimeoutMilliseconds}catch{$failure=$_}
 Complete-SceneTailOwnedProcesses @($owned) $failure
}
