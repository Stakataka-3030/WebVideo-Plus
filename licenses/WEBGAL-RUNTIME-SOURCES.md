# WebGAL 4.6.4 runtime: sources and license exceptions

The build assembles 16 runtime files from selected official WebGAL assets and an unmodified OFL UI font. WebGAL assets come from the official
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
- Fonts: `assets/SourceHanSansSC-Regular.otf`, `assets/ResourceHanRoundedCN-Regular-C1HdCLVq.ttf`, `assets/SourceHanSerifCN-Regular-B_f-kQ2u.ttf`

Thirteen files are unchanged WebGAL upstream bytes; the UI font comes from Adobe, and the CSS changes only its font URL/format. The main bundle has 11 checked
replacements and a probe suffix: export command/core/parser/stage access,
microtask-based asset scheduling, and removal of an unused polling interval.
The original shipped mixed newline encoding is reproduced explicitly.
Its upstream SHA-256 is `e49e15f0db25c95556b6b1eccad89d6e77a32e284cd4e4852fad7dc9a3019902`;
the output SHA-256 is `d9efa39b4eabdb3a54c3d209ca5db6cb04d1cc60fdef3acdcd2532712a8a6d10`.
Fourteen files (including the instrumented main bundle) remain byte-for-byte equal to the previously shipped runtime. The old OPPO font is removed, the unmodified Source Han Sans font is added, and one CSS URL/format is updated. Font rendering is deliberately not claimed to be pixel-identical. The compatibility comparison is not a license grant.

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

## UI font: Source Han Sans SC Regular 2.004R

The unmodified static OpenType font is downloaded from
[Adobe's pinned 2.004R source commit](https://github.com/adobe-fonts/source-han-sans/blob/a8b073bbf80f7226af03abeeb31e27017d5e3f67/OTF/SimplifiedChinese/SourceHanSansSC-Regular.otf).
It is 16,437,608 bytes, SHA-256 `84bbd4ace91d327b3ad1a581c688196278a4e41308520176f419180064e4af2b`.
The exact upstream [license](https://github.com/adobe-fonts/source-han-sans/blob/a8b073bbf80f7226af03abeeb31e27017d5e3f67/LICENSE.txt)
is copied as [`LICENSE-SourceHanSans-OFL-1.1.txt`](LICENSE-SourceHanSans-OFL-1.1.txt),
SHA-256 `f55c2d43dd905011515f5e46ba78d180027e314ef8ccaaf53a9e88fe316767cd`.
It preserves copyright 2014–2021 Adobe and the Reserved Font Name `Source` under SIL OFL 1.1.
No conversion, subsetting, internal renaming or glyph modification is performed.
The existing CSS family alias `WebgalUI` is retained for application compatibility;
its source is now `SourceHanSansSC-Regular.otf` with `format("opentype")`.
The font remains independently licensed under OFL, not MPL.

The font adds about 6.28 MB uncompressed relative to the previous file. CJK sample
advances are similar, but Latin/digit widths and some symbol coverage differ;
existing system fallbacks are retained. This is not a blanket glyph-coverage
superset or an assertion of unchanged line wrapping in every user theme.

## Removed legacy OPPO font

The earlier snapshot included `OPPOSans-R-tAcFw8I3.ttf` (2019 OPPO, version 1.00)
without a matching, verified redistribution notice. Current OPPO Sans 3.0 website
terms do not establish the exact grant for that older binary. The build now excludes
that asset entirely, including when importing a pinned legacy installer. The upstream
WebGAL download may still contain it in the build cache, but it is not selected or
copied into the runtime, package, or installer. No OPPO permission is inferred or invented.

The three copied notice files are byte-identical to their linked sources:

- Resource Han Rounded: SHA-256 `8b219980c8603383dccc0d82c00e8be6880f0b91026e4509d41e0ad681a76b47`
- Source Han Serif: SHA-256 `6a73f9541c2de74158c0e7cf6b0a58ef774f5a780bf191f2d7ec9cc53efe2bf2`
- WebGAL sounds: SHA-256 `498270c14ba7b0a1062ff79d5f948724d5015e6486b295ab01ae74dcd5e7bc04`
