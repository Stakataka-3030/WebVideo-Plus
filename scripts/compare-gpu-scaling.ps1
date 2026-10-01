param(
  [Parameter(Mandatory=$true,Position=0,ValueFromRemainingArguments=$true)]
  [string[]]$Json
)

$rows = foreach($path in $Json) {
  $full = (Resolve-Path -LiteralPath $path).Path
  $data = Get-Content -LiteralPath $full -Raw | ConvertFrom-Json
  $parts = @($data.renderParts)
  $frames = [double]$data.totalFrames
  $fps = if([double]$data.durationSeconds -gt 0){ $frames / [double]$data.durationSeconds } else { 0 }
  $sumPartRender = if($null -ne $data.sumPartRenderSeconds){[double]$data.sumPartRenderSeconds}else{(@($parts | ForEach-Object {[double]$_.renderSeconds}) | Measure-Object -Sum).Sum}
  $wall = if($null -ne $data.renderWallSeconds){[double]$data.renderWallSeconds}elseif([int]$data.effectiveWorkers -eq 1 -and $parts.Count -eq 1){[double]$parts[0].renderSeconds}else{[double]$data.totalSeconds}
  $aggregate = if($null -ne $data.aggregateFps){[double]$data.aggregateFps}elseif($wall -gt 0){$frames/$wall}else{0}
  $realtime = if($null -ne $data.realtimeFactor){[double]$data.realtimeFactor}elseif($fps -gt 0){$aggregate/$fps}else{0}
  $parallelism = if($null -ne $data.parallelismFactor){[double]$data.parallelismFactor}elseif($wall -gt 0){$sumPartRender/$wall}else{0}
  $workers = [int]$data.effectiveWorkers
  $efficiency = if($null -ne $data.parallelEfficiency){[double]$data.parallelEfficiency}elseif($workers -gt 0){$parallelism/$workers}else{0}
  $domRefresh = (@($parts | ForEach-Object {[double]$_.domRefreshCount}) | Measure-Object -Sum).Sum
  [pscustomobject]@{
    File = [IO.Path]::GetFileName($full)
    Workers = $workers
    Frames = [int]$frames
    RenderWallSec = [math]::Round($wall,3)
    AggregateFps = [math]::Round($aggregate,2)
    RealtimeX = [math]::Round($realtime,2)
    Parallelism = [math]::Round($parallelism,2)
    EfficiencyPct = [math]::Round($efficiency*100,1)
    DomRefresh = [int]$domRefresh
    _Aggregate = $aggregate
  }
}

$baseline = if($rows.Count -gt 0){[double]$rows[0]._Aggregate}else{0}
$view = $rows | ForEach-Object {
  [pscustomobject]@{
    File = $_.File
    Workers = $_.Workers
    Frames = $_.Frames
    RenderWallSec = $_.RenderWallSec
    AggregateFps = $_.AggregateFps
    RealtimeX = $_.RealtimeX
    SpeedupVsFirst = if($baseline -gt 0){[math]::Round($_._Aggregate/$baseline,2)}else{0}
    Parallelism = $_.Parallelism
    EfficiencyPct = $_.EfficiencyPct
    DomRefresh = $_.DomRefresh
  }
}

$view | Format-Table -AutoSize
