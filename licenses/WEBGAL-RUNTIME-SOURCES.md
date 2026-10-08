# WebGAL 4.6.4 runtime: sources and license exceptions

The build assembles 16 runtime files from selected official WebGAL assets. The original fonts and CSS remain unchanged. Assets come from the official
[WebGAL 4.6.4 web release](https://github.com/OpenWebGAL/WebGAL/releases/tag/4.6.4).
The archive is
[`WebGAL-4.6.4-web.zip`](https://github.com/OpenWebGAL/WebGAL/releases/download/4.6.4/WebGAL-4.6.4-web.zip),
SHA-256 `f7dbb153c0372044055ad167eeddc7202c5978bf661983328490ecd8d0a391ae`.
The release tag resolves to source commit
[`60ad94f4b21288783cb9964dc70f82535ba2e2b1`](https://github.com/OpenWebGAL/WebGAL/tree/60ad94f4b21288783cb9964dc70f82535ba2e2b1).
Per-file input/output hashes, sizes, and all export modifications are recorded in
[`build/runtime-patches.json`](../build/runtime-patches.json).

## Selected files

Paths below are relative to `runtime/web/` in the built package:

- Entry and metadata: `index.html`, `webgal-engine.json`
- Main bundle: `assets/index-R1tKotR6.js`
- Supporting JavaScript: `assets/conentsCash-BBWvsVB4.js`, `assets/index.es-erQsk_Nn.js`, `assets/initRegister-CesUtdWC.js`
- Styles: `assets/index-Dch1g2w9.css`
- Images: `assets/cherryBlossoms-DzBBkOW8.webp`, `assets/rain-Bd8ZRQ7x.png`, `assets/snow-CJh9m2KR.png`
- Sounds: `assets/dialog-BDvwibdp.mp3`, `assets/page-flip-1-CZ8VQh4O.mp3`, `assets/switch-1-DI-7VpPw.mp3`
- Fonts: `assets/OPPOSans-R-tAcFw8I3.ttf`, `assets/ResourceHanRoundedCN-Regular-C1HdCLVq.ttf`, `assets/SourceHanSerifCN-Regular-B_f-kQ2u.ttf`

Fifteen files are unchanged WebGAL upstream bytes. The main bundle has 11 checked
replacements and a probe suffix: export command/core/parser/stage access,
microtask-based asset scheduling, and removal of an unused polling interval.
The original shipped mixed newline encoding is reproduced explicitly.
Its upstream SHA-256 is `e49e15f0db25c95556b6b1eccad89d6e77a32e284cd4e4852fad7dc9a3019902`;
the output SHA-256 is `d9efa39b4eabdb3a54c3d209ca5db6cb04d1cc60fdef3acdcd2532712a8a6d10`.
All 16 output files match the original shipped export snapshot byte-for-byte.
This restores the original font/CSS, rather than approximating it with another font.
Byte equality is a provenance check, not a license grant or a claim that every custom
project and preview setting will render identically.

WebGAL-authored source and the export changes are covered by
[upstream MPL-2.0](https://github.com/OpenWebGAL/WebGAL/blob/60ad94f4b21288783cb9964dc70f82535ba2e2b1/LICENSE),
copied as [`WEBGAL-MPL-2.0.txt`](WEBGAL-MPL-2.0.txt). Embedded third-party notices
remain intact. Bundled libraries, fonts, and media are not relicensed by this
repository's MPL-2.0 notice; this document is not a complete transitive-dependency audit.

## Font and sound notices

- Resource Han Rounded: the font's embedded metadata identifies Cyano Hao,
  portions by Adobe, and SIL Open Font License 1.1. The unmodified
  [`LICENSE-ResourceHanRounded.txt`](LICENSE-ResourceHanRounded.txt) is copied from
  [the pinned WebGAL source](https://github.com/OpenWebGAL/WebGAL/blob/60ad94f4b21288783cb9964dc70f82535ba2e2b1/packages/webgal/src/assets/fonts/LICENSE-ResourceHanRounded).
  Its separate code/resource sections do not change the font's OFL terms.
- Source Han Serif CN: the supplied font identifies version 1.00 (April 8, 2017),
  copyright 2017 Adobe Systems Incorporated, Reserved Font Name `Source`, and
  SIL Open Font License 1.1. The unmodified
  [`LICENSE-SourceHanSerif-OFL-1.1.txt`](LICENSE-SourceHanSerif-OFL-1.1.txt) comes from
  [Adobe's 1.000 source commit](https://github.com/adobe-fonts/source-han-serif/blob/d7013fd24095e4c0147b019d2cd4a97d92a30773/LICENSE.txt).
  The embedded copyright and name records are preserved in the unchanged font.
- Sounds: [`WebGAL-SFX-NOTICE.txt`](WebGAL-SFX-NOTICE.txt) is copied unchanged from
  [the pinned WebGAL sound attribution](https://github.com/OpenWebGAL/WebGAL/blob/60ad94f4b21288783cb9964dc70f82535ba2e2b1/packages/webgal/src/assets/se/license.txt).
  It identifies `dialog.mp3` as CC0 by wobbleboxx and records public-domain language
  for `page-flip-1.mp3` and `switch-1.wav`; the release contains the latter as MP3.
  The full upstream notice also mentions sounds outside this selected runtime.

## UI font: original OPPO Sans v1.00

The unmodified `OPPOSans-R-tAcFw8I3.ttf` is selected from the pinned WebGAL archive:
10,152,780 bytes, SHA-256 `ea92535935f8b5da18b64bb23e5ffbfef1417b7ae4ff3fc15372a65ee95a9580`.
Its embedded metadata identifies OPPO, 2019, version 1.00. The original CSS family
alias `WebgalUI`, filename and `format("truetype")` are retained. No conversion,
subsetting, glyph editing or font metadata modification is performed.

OPPO's [historical ColorOS 7 public page, archived April 3, 2020](https://web.archive.org/web/20200403160245/https://www.coloros.com/topic/coloros7.html)
provides a free commercial-use grant for individuals and enterprises. The public
terms retain OPPO ownership and restrict modifying/secondary development, selling
the font, supplying other download channels, and unlawful use. The historical page
also directs downloads to its designated URL. These restrictions remain applicable;
the font is not relicensed under MPL or OFL.

The project provisionally interprets the public grant as permitting the unchanged
font embedded in this software package. That is an explicit project distribution
interpretation, not proof of a separate written agreement with OPPO. The wording
about other download channels leaves an interpretation boundary for software
bundling; this document does not describe it as either an unambiguous blanket ban
or an independently confirmed bespoke permission. A later-version public font
page does not itself establish the exact terms for this older binary. Current
official pages for [OPPO Sans 3.0](https://www.coloros.com/article/A00000050/)
and [OPPO Sans 4.0](https://www.coloros.com/article/A00000074/) also publish free
personal/enterprise commercial-use language and retain the modification, sale,
other-download-channel and unlawful-use restrictions; they do not define application
bundling as a separate category.

The three copied notice files are byte-identical to their linked sources:

- Resource Han Rounded: SHA-256 `8b219980c8603383dccc0d82c00e8be6880f0b91026e4509d41e0ad681a76b47`
- Source Han Serif: SHA-256 `6a73f9541c2de74158c0e7cf6b0a58ef774f5a780bf191f2d7ec9cc53efe2bf2`
- WebGAL sounds: SHA-256 `498270c14ba7b0a1062ff79d5f948724d5015e6486b295ab01ae74dcd5e7bc04`

## Additional 4.6.5 compatibility profile

The 1.2.0 unreleased candidate also recognizes the exact official WebGAL 4.6.5 project/template runtime. Its [official Web release](https://github.com/OpenWebGAL/WebGAL/releases/tag/4.6.5) ZIP is pinned as `webgal465Test` in `build/dependencies.lock.json`; `build/runtime-4.6.5-test.json` records all selected original bytes used for regression fixtures. The main bundle SHA-256 is `356f7184c80af8da4dd782e25c5b3fb89f55f1e8b9e9e18be6f50035763dc6b6`. Export probes are added only to owned job snapshots. The user's runtime, fonts, CSS and original project files are not rewritten.

This additional profile does not replace the 16-file bundled 4.6.4 fallback described above. Upstream WebGAL code and derived patch snippets remain under MPL-2.0, and embedded third-party materials retain their existing licenses.


## Additional 4.6.6 compatibility profile

WebVideo+ 1.3.0 recognizes the exact official [WebGAL 4.6.6 web release](https://github.com/OpenWebGAL/WebGAL/releases/tag/4.6.6). The original archive SHA-256 is `d8011933005f62397b3d1ea6cd14b8a7f58ce34a390000afa48f12a2d8f0349a`; [`build/runtime-4.6.6-test.json`](../build/runtime-4.6.6-test.json) records the selected original bytes. The main bundle is `assets/index-Dcp3ZA1M.js`, SHA-256 `d2b34606a380b9575ce1e50ed2251cb5e38b3d6f9b00200b2b0f252a13d209c0`. The original Live2D plugin `assets/index.es-DlwKruus.js` has SHA-256 `1ad45bac171ff15a79b52e20c727d6201dc1f1bc228d10d01cdd4d6cfc3d3e08`; the split resource helper `assets/live2dAssets-BYMcvYkd.js` has SHA-256 `02892ed85989397f5b6c4939d1ddcacb785aab8f10e1c4fe8c5af1c76a2c31f1`.

The matching editor baseline is extracted from the [official Terre 4.6.6 Windows release](https://github.com/OpenWebGAL/WebGAL_Terre/releases/tag/4.6.6), archive SHA-256 `3b07f5025b0b0fe17d7200684a1bd07c8caeece0f262140314eee550d3a07e79`. Its `release/public/assets/index-0dc0b398.js` SHA-256 is `7f448b16c4c44cf8438afa3cc114c1072d2cd66604d07e2b7fc2d332159d8577`, recorded in [`baseline/terre-4.6.6.json`](../baseline/terre-4.6.6.json).

Animation v2 normalization, relative calculation, sparse property inheritance, restore/preview semantics, and the Cubism2 texture adaptor remain upstream code. Export instrumentation is applied to owned job snapshots: preview command access, shared core/parser/stage access, native timing hooks, an AnimationManager signature bridge, and removal of the unused audio polling placeholder. Explicit exporter Core memory preferences guard the original reservation API against later engine/config resets. No proprietary SDK or model is included in these regression fixtures or releases.

The original fonts, CSS, media and third-party notices remain unchanged; the additional profiles do not replace the bundled 4.6.4 fallback. Upstream WebGAL and Terre code and derived patch snippets remain under their [MPL-2.0 notices](https://github.com/OpenWebGAL/WebGAL/blob/4.6.6/LICENSE), [Terre MPL-2.0 notice](https://github.com/OpenWebGAL/WebGAL_Terre/blob/4.6.6/LICENSE). Existing third-party license exceptions continue to apply.

## 4.6.5 Cubism2 texture upload correction

The exporter applies a narrowly scoped source bridge to the exact original 4.6.5 plugin in its owned job snapshot. It recreates HTML image textures only when the upstream internal model requires flip-Y (Cubism2), performs the upload with a guarded `UNPACK_FLIP_Y_WEBGL`, and restores the prior GL state in `finally`. Shared originals, modern Moc3 resources and the original resource helper remain unchanged. Converted textures are reused via WeakMap and rebuilt if destroyed. This follows the texture-upload behavior corrected in the official [WebGAL 4.6.6 release](https://github.com/OpenWebGAL/WebGAL/releases/tag/4.6.6); it does not relabel the 4.6.5 engine as 4.6.6.

The original plugin SHA-256 is `8b6c11ea8b4724dd8254d61a009c4d0e7cc7389f31f76570dac354c56b11a724`; the prepared plugin SHA-256 is `e62170797a6556ae286a42fa9efa8d0cea234a7f20f8b108992148588f6dd670`. Both the original digest and unique patch anchors are enforced by `src/EngineAdapter.cs`; unknown bytes are rejected. The original helper SHA-256 stays `6699c4b430a02c1471d58405065b0026749e16c8270e8a35ae34eed0e8c4df34`. The bridge and modified WebGAL plugin source remain under the repository's MPL-2.0 terms. No SDK or model is redistributed.
