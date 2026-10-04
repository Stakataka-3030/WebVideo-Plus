# Craft 1.1.4c focused kernel port

Craft 1.1.4c uses kernel 0.6.51 on its existing product 1.1.2 lineage. It keeps the exact 4.6.4 / 4.6.5 runtime and locale contracts. The selected stable source is WebVideo+ 1.1.6 tree `99803533a944befdd665a2f560ced6f51956a9fd`.

## Changes

- A repeated motion name on the same model retains its original motion epoch. A new model identity starts its own epoch. Numeric bounds normalization follows both supported engines; Craft's 4.6.5 image-diff branches remain.
- A stopped model without a default idle motion retains the last rendered pre-stop pose during segment restoration, including an interrupted loop. Existing completed-motion restoration is retained.
- Stage export accepts `includeFigures`, defaulting to true. When false, only registered figure color output is excluded. Scripts, timing, asset waits, model updates, draw traversal and auxiliary clipping/filter targets continue. The flag is included in worker requests, cache signatures and result metadata.
- The pipeline revision changes to prevent reuse of old rendered parts.

These changes do not add stable statement-cut controls, Cubism memory controls or update preferences to Craft. The prior real-SDK/model numerical tests belong to the stable motion fix; this Craft port was validated with the portable tests and actual pinned engine/plugin methods below. No private model or SDK is packaged.

## Repeatable checks

```sh
node --test tests/cubism2-seam.test.mjs tests/figure-output-filter.test.mjs tests/webgal-dual-profile-workload.test.mjs
node tests/cubism2-runtime-contract.mjs
node tests/figure-export-runtime.mjs
node tests/cubism2-runtime-contract.mjs /path/to/raw-4.6.5/assets/index-CC7KTie-.js
node tests/figure-export-runtime.mjs /path/to/raw-4.6.5/assets/index.es-0XzJiDJZ.js
node verify-export-lifecycle.mjs
```

The runtime scripts verify exact SHA-256 identities before executing the relevant public engine/plugin methods with synthetic collaborators. They cover 15 identity/motion cases per engine and complete production frame scheduling at 30/60 fps with standard/composite warmup. Figure on/off runs must have identical command, clock, update, traversal, media and wait traces.

`tests/engine-adapter-dual-profile.test.ps1 -Portable` separately compiles production profile/adapter source and verifies 119 exact-identity/startup checks with both raw official engine roots. Full cloud C#5/.NET4.8 compilation checks the exporter, bootstrap, Craft launcher, observer and setup sources.

`tests/figure-export-render.mjs` is an optional pinned 4.6.4 Pixi/WebGL pixel fixture for a permitted Chromium environment. It is not included in the portable pass count. The current cloud Chromium/socket and browser-localhost restrictions prevented a new pixel run. No Windows entrypoint or user-computer test was run for this port.
