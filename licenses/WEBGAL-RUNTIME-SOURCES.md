# WebGAL 4.6.5 runtime: sources and license exceptions

The build assembles 17 runtime files from selected official WebGAL assets. The original fonts and CSS remain unchanged. Assets come from the official
[WebGAL 4.6.5 web release](https://github.com/OpenWebGAL/WebGAL/releases/tag/4.6.5).
The archive is
[`WebGAL-4.6.5-web.zip`](https://github.com/OpenWebGAL/WebGAL/releases/download/4.6.5/WebGAL-4.6.5-web.zip),
SHA-256 `30a6a446121482cb431950c4d0457ee48f4af9652ca81250fc3f5e244537ce1b`.
Source is pinned to the [4.6.5 release tag](https://github.com/OpenWebGAL/WebGAL/tree/4.6.5).
Per-file input/output hashes, sizes, and all export modifications are recorded in
[`build/runtime-patches.json`](../build/runtime-patches.json).

## Selected files

Paths below are relative to `runtime/web/` in the built package:

- Entry and metadata: `index.html`, `webgal-engine.json`
- Main bundle: `assets/index-CC7KTie-.js`
- Supporting JavaScript: `assets/index.es-0XzJiDJZ.js`, `assets/initRegister-CUE0BQlV.js`, `assets/live2dAssets-DlXks16s.js`, `assets/spineAssets-BFzEbEvC.js`
- Styles: `assets/index-Dch1g2w9.css`
- Images: `assets/cherryBlossoms-DzBBkOW8.webp`, `assets/rain-Bd8ZRQ7x.png`, `assets/snow-CJh9m2KR.png`
- Sounds: `assets/dialog-BDvwibdp.mp3`, `assets/page-flip-1-CZ8VQh4O.mp3`, `assets/switch-1-DI-7VpPw.mp3`
- Fonts: `assets/OPPOSans-R-tAcFw8I3.ttf`, `assets/ResourceHanRoundedCN-Regular-C1HdCLVq.ttf`, `assets/SourceHanSerifCN-Regular-B_f-kQ2u.ttf`

All 17 files remain unchanged official WebGAL 4.6.5 bytes, including original fonts and CSS. EngineAdapter verifies and instruments the official bundle in each job-local snapshot; the build does not patch the upstream archive.
Byte equality is a provenance check, not a license grant or a claim that every custom
project and preview setting will render identically.

WebGAL-authored source and the export changes are covered by
[upstream MPL-2.0](https://github.com/OpenWebGAL/WebGAL/blob/4.6.5/LICENSE),
copied as [`WEBGAL-MPL-2.0.txt`](WEBGAL-MPL-2.0.txt). Embedded third-party notices
remain intact. Bundled libraries, fonts, and media are not relicensed by this
repository's MPL-2.0 notice; this document is not a complete transitive-dependency audit.

## Font and sound notices

- Resource Han Rounded: the font's embedded metadata identifies Cyano Hao,
  portions by Adobe, and SIL Open Font License 1.1. The unmodified
  [`LICENSE-ResourceHanRounded.txt`](LICENSE-ResourceHanRounded.txt) is copied from
  [the pinned WebGAL source](https://github.com/OpenWebGAL/WebGAL/blob/4.6.5/packages/webgal/src/assets/fonts/LICENSE-ResourceHanRounded).
  Its separate code/resource sections do not change the font's OFL terms.
- Source Han Serif CN: the supplied font identifies version 1.00 (April 8, 2017),
  copyright 2017 Adobe Systems Incorporated, Reserved Font Name `Source`, and
  SIL Open Font License 1.1. The unmodified
  [`LICENSE-SourceHanSerif-OFL-1.1.txt`](LICENSE-SourceHanSerif-OFL-1.1.txt) comes from
  [Adobe's 1.000 source commit](https://github.com/adobe-fonts/source-han-serif/blob/d7013fd24095e4c0147b019d2cd4a97d92a30773/LICENSE.txt).
  The embedded copyright and name records are preserved in the unchanged font.
- Sounds: [`WebGAL-SFX-NOTICE.txt`](WebGAL-SFX-NOTICE.txt) is copied unchanged from
  [the pinned WebGAL sound attribution](https://github.com/OpenWebGAL/WebGAL/blob/4.6.5/packages/webgal/src/assets/se/license.txt).
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
