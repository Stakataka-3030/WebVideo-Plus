# WebGAL 4.6.4 runtime: sources and license exceptions

The build selects 16 files (39,644,610 output bytes) from the official
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

Fifteen files are unchanged upstream bytes. The main bundle has 11 checked
replacements and a probe suffix: export command/core/parser/stage access,
microtask-based asset scheduling, and removal of an unused polling interval.
The original shipped mixed newline encoding is reproduced explicitly.
Its upstream SHA-256 is `e49e15f0db25c95556b6b1eccad89d6e77a32e284cd4e4852fad7dc9a3019902`;
the output SHA-256 is `d9efa39b4eabdb3a54c3d209ca5db6cb04d1cc60fdef3acdcd2532712a8a6d10`.
All 16 output files were compared byte-for-byte with the previously shipped
runtime. That comparison is a compatibility check, not a license grant.

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

## OPPO Sans: unresolved redistribution scope

`OPPOSans-R-tAcFw8I3.ttf` identifies version 1.00 and copyright 2019 OPPO.
No standalone license for this exact font was found in the pinned WebGAL source
or release. The [official ColorOS announcement](https://www.coloros.com/article/A00000050/)
confirms the 2019 free-use announcement, including commercial use, but its current
OPPO Sans 3.0 terms also prohibit font modification, font sales, and providing
other download channels. Those terms do not establish the precise redistribution
permission for the bundled version 1.00. The older official download URL now
returns a 3.0 font archive, without a matching 1.00 license notice.

The build preserves the existing font for rendering parity; this must not be
read as clearance to redistribute it or as an MPL/OFL grant. Before publishing
binary packages, establish the applicable version 1.00 redistribution permission,
or make a separately tested change to an appropriately licensed font. No new
OPPO license text or permission has been invented here.

The three copied notice files are byte-identical to their linked sources:

- Resource Han Rounded: SHA-256 `8b219980c8603383dccc0d82c00e8be6880f0b91026e4509d41e0ad681a76b47`
- Source Han Serif: SHA-256 `6a73f9541c2de74158c0e7cf6b0a58ef774f5a780bf191f2d7ec9cc53efe2bf2`
- WebGAL sounds: SHA-256 `498270c14ba7b0a1062ff79d5f948724d5015e6486b295ab01ae74dcd5e7bc04`
