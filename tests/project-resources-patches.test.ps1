param([string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (!$OutputDirectory) { $OutputDirectory = Join-Path ([IO.Path]::GetTempPath()) ('wvp-project-resources-' + [Guid]::NewGuid().ToString('N')) }
[void][IO.Directory]::CreateDirectory($OutputDirectory)
$integration = [IO.File]::ReadAllLines((Join-Path $root 'manager/ProductIntegration.cs'))
$method = @($integration | Where-Object { $_.Contains('static string RegexOnceInScope(') })
if ($method.Count -ne 1) { throw 'Expected one actual ProductIntegration patch method' }
$typeName = 'ProjectResourcePatchFixture' + [Guid]::NewGuid().ToString('N')
$definition = 'using System;using System.IO;using System.Text.RegularExpressions;public static class ' + $typeName + '{' + $method[0].Replace('static string RegexOnceInScope(', 'public static string RegexOnceInScope(') + '}'
$type = Add-Type -TypeDefinition $definition -PassThru
$patches = Get-Content -LiteralPath (Join-Path $root 'browser/project-resources-patches.json') -Raw | ConvertFrom-Json
$versions = @('4.6.4')
if (Test-Path (Join-Path $root 'baseline/terre-4.6.6.js')) { $versions += '4.6.5','4.6.6' }
$results = @()
foreach ($version in $versions) {
  $source = [IO.File]::ReadAllText((Join-Path $root "baseline/terre-$version.js"))
  foreach ($patch in $patches) {
    $pattern = if ($patch.regex) { $patch.regex } else { [Regex]::Escape($patch.find) }
    $source = $type::RegexOnceInScope($source, $patch.scopeStart, $patch.scopeEnd, $pattern, $patch.replace)
  }
  $tip = [Regex]::Match($source, 'jsxRuntimeExports\.jsx\((Tooltip(?:\$\d+)?),')
  if (!$tip.Success) { throw 'Native Tooltip not found' }
  $prefix = [IO.File]::ReadAllText((Join-Path $root 'browser/project-resources.js')).Replace('__CODEX_TOOLTIP__', $tip.Groups[1].Value)
  if ($prefix.Contains('__CODEX_TOOLTIP__')) { throw 'Tooltip placeholder remains' }
  $output = Join-Path $OutputDirectory "terre-$version.patched.mjs"
  [IO.File]::WriteAllText($output, $prefix + "`n" + $source, [Text.UTF8Encoding]::new($false))
  & node --check $output
  if ($LASTEXITCODE -ne 0) { throw "Patched source syntax failed: $version" }
  $results += [ordered]@{version=$version;patches=$patches.Count;tooltip=$tip.Groups[1].Value;sha256=(Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash.ToLowerInvariant();file=$output;passed=$true}
}
$results | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'patch-checks.json') -Encoding utf8
$results | ConvertTo-Json -Depth 5
