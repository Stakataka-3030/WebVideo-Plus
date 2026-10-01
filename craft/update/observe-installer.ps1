param([int]$HostPid,[string]$Version,[string]$AppName,[int]$TimeoutSeconds=900)
$ErrorActionPreference='Stop'
# Session-only read-only observation. No registry/WMI subscriptions, services or process killing.
if($HostPid -le 0 -or $Version -notmatch '^[0-9A-Za-z.+-]+$' -or $AppName -notmatch '^[0-9A-Za-z ._-]+$'){throw 'invalid observer scope'}
$started=Get-Date
$deadline=$started.AddSeconds($TimeoutSeconds)
$prefix=Join-Path ([IO.Path]::GetTempPath()) ($AppName+'-'+$Version+'-updater-')
Write-Output '{"state":"armed"}'
while((Get-Date) -lt $deadline){
  $matches=@(Get-CimInstance Win32_Process -Filter ('ParentProcessId='+$HostPid) | Where-Object {
    $_.CreationDate -ge $started -and $_.ExecutablePath -and
    $_.ExecutablePath.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase) -and
    $_.CommandLine -match '(?i)(?:^|\s)/UPDATE(?:\s|$)'
  })
  if($matches.Count -gt 1){Write-Output '{"state":"indeterminate","reason":"multiple installers"}';exit 2}
  if($matches.Count -eq 1){
    $candidate=$matches[0]
    try {
      $process=[Diagnostics.Process]::GetProcessById($candidate.ProcessId)
      # Acquire a handle while the observed process is alive; PID alone is insufficient.
      $null=$process.Handle
      if($process.StartTime -lt $started){throw 'process identity changed'}
      Write-Output ('{"state":"observed","pid":'+$candidate.ProcessId+'}')
      if(!$process.WaitForExit([Math]::Max(1,[int](($deadline-(Get-Date)).TotalMilliseconds)))){throw 'installer still running'}
      $code=$process.ExitCode
      Write-Output (@{state='exited';pid=$candidate.ProcessId;exitCode=$code;path=$candidate.ExecutablePath;startedAt=$candidate.CreationDate.ToUniversalTime().ToString('o')} | ConvertTo-Json -Compress)
      if($code -eq 0){exit 0}else{exit 1}
    } catch {Write-Output (@{state='indeterminate';reason=$_.Exception.Message}|ConvertTo-Json -Compress);exit 2}
  }
  Start-Sleep -Milliseconds 50
}
Write-Output '{"state":"indeterminate","reason":"completion was not observed"}'
exit 2
