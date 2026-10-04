# Cross-compile the actual Windows installer and inert GUI harness using official
# .NET Framework reference assemblies. No generated executable is run.
param([Parameter(Mandatory=$true)][string]$ReferenceRoot)
$ErrorActionPreference='Stop'
if($PSVersionTable.PSVersion.Major -lt 7){throw 'PowerShell 7 with Roslyn is required for this compile-only check.'}
$root=Split-Path $PSScriptRoot -Parent
$temp=Join-Path ([IO.Path]::GetTempPath()) ('craft-setup-compile-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
try {
 $parse=[Microsoft.CodeAnalysis.CSharp.CSharpParseOptions]::Default.WithLanguageVersion([Microsoft.CodeAnalysis.CSharp.LanguageVersion]::CSharp5)
 $sources=@('craft/CraftSetup.cs','craft/installer/SetupContracts.cs','craft/installer/SetupPaths.cs','craft/installer/ProductRouting.cs','craft/installer/ManifestVerifier.cs')|ForEach-Object {Join-Path $root $_}
 $references=[Microsoft.CodeAnalysis.MetadataReference[]]@(Get-ChildItem -LiteralPath $ReferenceRoot -Filter '*.dll' -File | Where-Object {$_.Name -notmatch 'System.EnterpriseServices.(Wrapper|Thunk).dll'} | ForEach-Object {[Microsoft.CodeAnalysis.MetadataReference]::CreateFromFile($_.FullName)})
 foreach($entry in @(@{Main='CraftSetup';Extra=@()},@{Main='SetupGuiChecks';Extra=@((Join-Path $root 'craft/tests/SetupGuiChecks.cs'))},@{Main='CraftStarter';Extra=@()},@{Main='OfficialInstallerLauncher';Extra=@()},@{Main='LauncherGuiChecks';Extra=@((Join-Path $root 'craft/tests/LauncherGuiChecks.cs'))})) {
  $actualSources=if($entry.Main -in @('CraftStarter','LauncherGuiChecks')){@((Join-Path $root 'craft/CraftStarter.cs'),(Join-Path $root 'craft/installer/ManifestVerifier.cs'))}elseif($entry.Main -eq 'OfficialInstallerLauncher'){@((Join-Path $root 'craft/update/OfficialInstallerLauncher.cs'))}else{$sources}
  $trees=[Microsoft.CodeAnalysis.SyntaxTree[]]@(($actualSources+$entry.Extra) | ForEach-Object {[Microsoft.CodeAnalysis.CSharp.CSharpSyntaxTree]::ParseText([IO.File]::ReadAllText($_),$parse,$_,[Text.Encoding]::UTF8,[Threading.CancellationToken]::None)})
  $kind=if($entry.Main -eq 'OfficialInstallerLauncher'){[Microsoft.CodeAnalysis.OutputKind]::ConsoleApplication}else{[Microsoft.CodeAnalysis.OutputKind]::WindowsApplication}
  $options=[Microsoft.CodeAnalysis.CSharp.CSharpCompilationOptions]::new($kind).WithOptimizationLevel([Microsoft.CodeAnalysis.OptimizationLevel]::Release).WithPlatform([Microsoft.CodeAnalysis.Platform]::X64).WithMainTypeName($entry.Main)
  $compilation=[Microsoft.CodeAnalysis.CSharp.CSharpCompilation]::Create($entry.Main,$trees,$references,$options)
  $output=[IO.File]::Create((Join-Path $temp ($entry.Main+'.exe')))
  try {$result=$compilation.Emit($output)}finally{$output.Dispose()}
  foreach($diagnostic in $result.Diagnostics){if($diagnostic.Severity -eq [Microsoft.CodeAnalysis.DiagnosticSeverity]::Error){Write-Output $diagnostic.ToString()}}
  if(-not $result.Success){throw ('C#5/.NET Framework compilation failed: '+$entry.Main)}
  Write-Output ('PASS C#5/.NET Framework compile only: '+$entry.Main)
 }
} finally { Remove-Item -LiteralPath $temp -Recurse -Force }
