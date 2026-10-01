$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
$assembly=Join-Path $repo 'package/WebGAL.Video.exe'
if(-not(Test-Path -LiteralPath $assembly)){throw 'Build the native component before this test.'}
[Reflection.Assembly]::LoadFrom($assembly)|Out-Null
$tempRoot=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([IO.Path]::DirectorySeparatorChar)
$fixture=[IO.Path]::GetFullPath((Join-Path $tempRoot ('webvideo-terre-path-'+[Guid]::NewGuid().ToString('N'))))
if(-not $fixture.StartsWith($tempRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Unsafe test fixture path'}
try{
 $terre=Join-Path $fixture 'terre'
 $config=Join-Path $fixture '.webgal_terre'
 $custom=Join-Path $fixture 'custom-data'
 $configuredGames=Join-Path $config 'games'
 $customGames=Join-Path $custom 'games'
 New-Item -ItemType Directory -Path $terre,$config,$configuredGames,(Join-Path $customGames 'demo/game/scene') -Force|Out-Null
 [IO.File]::WriteAllText((Join-Path $config 'config.json'),('{"userDataPath":'+[NativeVideo.J]::Text($custom)+'}'))
 [IO.File]::WriteAllText((Join-Path $customGames 'demo/game/scene/start.txt'),':;')
 New-Item -ItemType Directory -Path (Join-Path $configuredGames 'demo/game/scene') -Force|Out-Null
 [IO.File]::WriteAllText((Join-Path $configuredGames 'demo/game/scene/start.txt'),'old copy')
 $detected=[NativeVideo.TerreUserData]::GamesRoot($terre,$config)
 if(-not [NativeVideo.TerreUserData]::SamePath($detected,$customGames)){throw 'Custom user data directory not detected'}
 $scene=[NativeVideo.TerreUserData]::FindScene($configuredGames,$detected,'demo','start.txt')
 if($null -eq $scene -or -not [NativeVideo.TerreUserData]::SamePath($scene['root'],$customGames)){throw 'Active Terre scene did not take precedence over an old copy'}
 $roots=[NativeVideo.EngineAdapter]::MygoSearchRoots($configuredGames,$terre,$config)
 if(-not($roots|Where-Object{[NativeVideo.TerreUserData]::SamePath($_,(Join-Path $custom 'derivative-engines'))})){throw 'Custom derivative engine directory not searched'}
 $rootsFromStaleDefault=[NativeVideo.EngineAdapter]::MygoSearchRoots([NativeVideo.TerreUserData]::DefaultGamesRoot,$terre,$config)
 $legacyDerivative=Join-Path (Split-Path ([NativeVideo.TerreUserData]::DefaultGamesRoot) -Parent) 'derivative-engines'
 if($rootsFromStaleDefault|Where-Object{[NativeVideo.TerreUserData]::SamePath($_,$legacyDerivative)}){throw 'Stale default engine directory was preferred over Terre configuration'}
 if($null -ne [NativeVideo.TerreUserData]::FindScene($configuredGames,$detected,'demo','missing.txt')){throw 'Missing scene falsely resolved'}
 $portable=Join-Path $terre 'data'
 New-Item -ItemType Directory -Path (Join-Path $portable 'games/demo/game/scene') -Force|Out-Null
 [IO.File]::WriteAllText((Join-Path $portable 'games/demo/game/scene/start.txt'),':;')
 if(-not [NativeVideo.TerreUserData]::SamePath([NativeVideo.TerreUserData]::GamesRoot($terre,$config),(Join-Path $portable 'games'))){throw 'Portable data directory did not take precedence'}
 $state=Join-Path $fixture 'state'
 New-Item -ItemType Directory -Path (Join-Path $state 'user-data') -Force|Out-Null
 [IO.File]::WriteAllText((Join-Path $state 'user-data/test-marker'),'test')
 $queue=[NativeVideo.QueueService]::new([NativeVideo.J]::O('stateDir',$state,'gamesRoot',$configuredGames,'terreDir',$terre,'outputDir',(Join-Path $fixture 'out')))
 $locate=[NativeVideo.QueueService].GetMethod('LocateScene',[Reflection.BindingFlags]'Instance,NonPublic')
 $resolved=$locate.Invoke($queue,@('demo','start.txt',$false))
 if(-not [NativeVideo.TerreUserData]::SamePath($resolved['root'],(Join-Path $portable 'games'))){throw 'Queue service did not use Terre portable game root'}
 $missingFailed=$false
 try{$locate.Invoke($queue,@('demo','missing.txt',$false))|Out-Null}catch{if($_.Exception.Message -notmatch '场景文件不存在'){throw};$missingFailed=$true}
 if(-not $missingFailed){throw 'Missing scene request did not fail'}
 $log=Get-Content -LiteralPath (Join-Path $state 'service.log') -Tail 1 | ConvertFrom-Json
 if($log.event -ne 'scene-lookup-failed' -or -not $log.terreSceneFile.EndsWith('missing.txt')){throw 'Scene lookup diagnostic log missing'}
 $autoState=Join-Path $fixture 'auto-state';New-Item -ItemType Directory -Path (Join-Path $autoState 'user-data') -Force|Out-Null
 [IO.File]::WriteAllText((Join-Path $autoState 'user-data/test-marker'),'test')
 $autoQueue=[NativeVideo.QueueService]::new([NativeVideo.J]::O('stateDir',$autoState,'gamesRoot',[NativeVideo.TerreUserData]::DefaultGamesRoot,'terreDir',$terre,'outputDir',(Join-Path $fixture 'out')))
 $effectiveField=[NativeVideo.QueueService].GetField('gamesRoot',[Reflection.BindingFlags]'Instance,NonPublic')
 if(-not [NativeVideo.TerreUserData]::SamePath($effectiveField.GetValue($autoQueue),(Join-Path $portable 'games'))){throw 'Stale default games root was not corrected at service startup'}
 if(-not((Get-Content -LiteralPath (Join-Path $autoState 'service.log'))|Where-Object{$_ -match 'terre-games-root-auto-corrected'})){throw 'Automatic root correction was not logged'}
 Write-Output 'Terre custom, queue fallback, lookup log, MyGO search and portable path checks passed.'
}finally{
 if(Test-Path -LiteralPath $fixture){
  if(-not([IO.Path]::GetFullPath($fixture).StartsWith($tempRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase))){throw 'Unsafe cleanup path'}
  Remove-Item -LiteralPath $fixture -Recurse -Force
 }
}
