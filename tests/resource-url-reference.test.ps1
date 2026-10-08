# Execute the exact production URL helpers; no filesystem/model/media input is needed.
param([string]$SourceRoot=(Split-Path $PSScriptRoot -Parent))
$ErrorActionPreference='Stop'
$source=[IO.File]::ReadAllText((Join-Path $SourceRoot 'src/ProjectAssets.cs'))
$methods=@()
foreach($name in @('NormalizeResourceUrlReference','PhysicalName','AmbiguousWindowsPath')){
 $hits=@($source -split '\r?\n' | Where-Object {$_ -match ('^  (?:public )?static (?:string|bool) '+$name+'\(')})
 if($hits.Count -ne 1){throw "Unique production URL helper changed: $name"}
 $methods += $hits[0]
}
Add-Type -TypeDefinition ('using System;using System.Linq;using System.Text.RegularExpressions;public static class ProductionResourceUrlHelpers {'+($methods -join "`n")+'}')
$binding=[Reflection.BindingFlags]::NonPublic -bor [Reflection.BindingFlags]::Static
$physical=[ProductionResourceUrlHelpers].GetMethod('PhysicalName',$binding)
$ambiguous=[ProductionResourceUrlHelpers].GetMethod('AmbiguousWindowsPath',$binding)
$fullwidth=[string][char]0x3000
$cases=@(
 @('/game/vocal/line.wav','/game/vocal/line.wav',$false),
 @('/game/vocal/line.wav ','/game/vocal/line.wav',$false),
 @('/game/vocal/line.wav  ','/game/vocal/line.wav',$false),
 @('/game/vocal/one line.wav ','/game/vocal/one line.wav',$false),
 @('/game/vocal/one  line.wav ','/game/vocal/one  line.wav',$false),
 @("/game/vocal/one${fullwidth}line.wav ","/game/vocal/one${fullwidth}line.wav",$false),
 @("/game/vocal/line.wav${fullwidth} ","/game/vocal/line.wav${fullwidth}",$false),
 @('/game/vocal/one%20line.wav ','/game/vocal/one line.wav',$false),
 @('/game/vocal/line.wav%20 ','/game/vocal/line.wav ',$true),
 @('/game/vocal/line.wav%2520 ','/game/vocal/line.wav%20',$false),
 @('/game/vocal/line.wav?download=1 ','/game/vocal/line.wav',$false),
 @('/game/vocal/line.wav#voice ','/game/vocal/line.wav',$false),
 @('/game/vocal/line.wav ?download=1','/game/vocal/line.wav ',$true),
 @('/game/vocal/line.wav #voice','/game/vocal/line.wav ',$true),
 @("/game/vocal/one`tline.wav`r`n ",'/game/vocal/oneline.wav',$false),
 @(('/game/vocal/line.wav'+[char]0+[char]0x1f+' '),'/game/vocal/line.wav',$false),
 @('/game/vocal/line.wav%09 ',('/game/vocal/line.wav'+[char]9),$false),
 @('/game/vocal/line.wav%3F%23 ','/game/vocal/line.wav?#',$false),
 @('/game/vocal/folder%20/line.wav ','/game/vocal/folder /line.wav',$true),
 @('/game/vocal/folder /line.wav ','/game/vocal/folder /line.wav',$true),
 @('/game/vocal/folder%2520/line.wav ','/game/vocal/folder%20/line.wav',$false)
)
$count=0
foreach($case in $cases){
 $actual=$physical.Invoke($null,@([string]$case[0]))
 if($actual -cne $case[1]){throw "Production physical path mismatch: $($case[0])"}
 if($ambiguous.Invoke($null,@([string]$actual)) -ne $case[2]){throw "Windows component aliasing diagnostic mismatch: $($case[0])"}
 $count += 2
}
Write-Output "PASS $count production C# resource URL / component checks"
