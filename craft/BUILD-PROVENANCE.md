# Development source provenance

- Starting point: private local Craft prototype source snapshot from commit bee58883376006e61136bd365d6503ba863cbb99, supplied in the verified user handoff. The archive did not include Git history; this development checkout records a local import commit and has no remote.
- Official host studied and tested: WebGAL Craft 1.0.0-beta.2, executable SHA-256 3515c1329b3b033d1882329026a4c5d3cf9eb21cb50b5b0040d7882daf933d0d. Modified local VideoExportDialog host sources are not treated as official capabilities.
- Base product/kernel lineage remains root version.json (1.1.2 / 0.6.46). Full main or experimental product changes have not been silently rebased into this branch.
- Bounded backports from verified WebVideo-Plus main e61fdbc5c192fde85b436d154ae7e6b41dd03320: direct pinned build-input reconstruction helpers, build input/runtime manifests, corresponding licenses and notices; conservative ProjectAssets Live2D dependency scan and its native regression test. These retain original WebGAL runtime font bytes.
- Added parser: official npm webgal-parser 4.6.5, exact UMD bytes with MPL-2.0 license and corresponding TypeScript source under features/vendor. Newer syntax is gated by the verified bound engine version.
- All Craft implementation is local/private until a publication destination is approved. No release, deployment, or public upload is implied by this source package.
