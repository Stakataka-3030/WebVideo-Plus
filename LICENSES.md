# License scope

Unless otherwise noted below, WebVideo+ project-specific source code, build scripts, browser modules, installer/manager/launcher code, schemas, and original project data are licensed under the **Mozilla Public License 2.0 (MPL-2.0)**. The full license text is in [`LICENSE`](LICENSE).

This scope statement is intended to make the repository's mixed provenance explicit. It does not relicense third-party material that is already governed by another license, nor does it grant rights in third-party trademarks, game assets, character images, Live2D models, music, voice recordings, or other separately owned material.

## Path and provenance map

| Path / material | License / status | Notes |
| --- | --- | --- |
| WebVideo+ original code under `src/`, `browser/`, `manager/`, `installer/`, `launcher/`, `bootstrap/`, and project build scripts | MPL-2.0 | Except where a file contains separately attributed third-party material. |
| WebVideo+ original prose documentation, including `README.md`, `CHANGELOG.md`, original guides and release notes under `docs/`, and original adaptation/fixture documentation | All rights reserved (ARR) | The reserved scope and prior-license limitations are defined below. |
| `WebVideo+_icon.svg`, `WebVideo+_icon.ico` | All rights reserved (ARR) | WebVideo+ original Logo artwork. |
| WebVideo+ project name, trademarks, service marks and other brand identifiers | All rights reserved (ARR); no brand-use license granted | No assertion of registration or exclusive control over descriptive references. |
| `baseline/terre-4.6.4.js` | MPL-2.0 (upstream) | Unmodified/fixed WebGAL Terre 4.6.4 release bundle used as the patching baseline. Upstream copyright remains with its contributors. |
| Terre/WebGAL-derived snippets or modifications embedded in patch definitions | MPL-2.0 | These remain under the same MPL-2.0 family as the upstream source. |
| `anogo-actions.factory.json` default action vocabulary | AGPL-3.0 | Copied/adapted from `A-kirami/anogo`, `src/stores/state.ts`. See `licenses/ANOGO-ATTRIBUTION.txt` and `licenses/LICENSE-Anogo-AGPL-3.0.txt`. WebVideo+'s independently implemented Anogo importer code remains MPL-2.0. |
| `vendor/js-yaml-4.1.1.min.js` | MIT | See `vendor/js-yaml-LICENSE` and `licenses/LICENSE-js-yaml.txt`. |
| Material adapted from `xxSak1xx/webgal-skill`, including portions of the preset/effect reference data | Upstream repository: MIT; underlying effect reference also carries its own attribution | The upstream repository license is preserved in `licenses/LICENSE-webgal-skill-MIT.txt`. Its effect reference explicitly credits 北风的猫5306; that attribution is preserved in README/NOTICE. WebVideo+ schema, organization, compatibility edits, and original additions are MPL-2.0, but this MPL grant does not override rights in separately attributed underlying material. |
| `character-map.factory.json`, `filter-presets.factory.json`, and other project datasets containing factual names/IDs or contributor-supplied entries | MPL-2.0 for WebVideo+ original selection, schema, arrangement, and additions; third-party rights reserved where applicable | Names, trademarks, fictional characters, and separately attributed contributor material are not relicensed merely by inclusion in the dataset. |
| Bundled `runtime/web/assets/OPPOSans-R-tAcFw8I3.ttf` (selected unchanged from WebGAL) | OPPO public commercial-use grant; provisional embedded-distribution interpretation | Original OPPO Sans v1.00 bytes and metadata preserved. Not MPL or OFL; public terms, restrictions and interpretation limits are documented in `licenses/WEBGAL-RUNTIME-SOURCES.md`. |
| Files under `licenses/` | Their named upstream licenses/notices | These files are copies of third-party license/notice texts and are not relicensed by the root MPL-2.0 license. |
| WebView2, FFmpeg, Node.js, DeepSeek Harness / DSH, pi-ai and other packaged/runtime dependencies | Their respective upstream licenses | See `NOTICE.md`, `licenses/THIRD-PARTY.md`, package lockfiles, and license files shipped with dependencies. |
| Playwright / Electron references | Historical/research provenance only | Current 1.0.0 runtime does not bundle these runtimes; retained license/notice files document historical provenance. |

## Reserved original documentation, Logo and brand identifiers

All rights reserved (ARR) applies only to WebVideo+ original material for which the project is entitled to reserve rights:

- Original prose in `README.md`, `CHANGELOG.md`, usage/building/architecture and other guides under `docs/`, release notes, original root-level adaptation reports, and explanatory README files in test fixtures.
- Logo artwork in `WebVideo+_icon.svg` and `WebVideo+_icon.ico`.

This notice grants no additional permission to reproduce, modify, redistribute or otherwise reuse these reserved materials. The WebVideo+ name, trademarks, service marks and other brand identifiers are reserved; no license to use them is granted. This statement makes no assertion of registration or exclusive control over descriptive references to the project.

The documentation reservation excludes `LICENSE`, `LICENSES.md`, `NOTICE.md`, third-party license/attribution texts, and notices required by applicable licenses; their existing terms and notice obligations remain unchanged. Original code examples, ordinary UI text, source comments, CSS, configuration/schema data, runtime prompts, and executable test fixtures/data remain within the MPL-2.0 code/data scope. Quoted third-party code retains its own terms.

This reservation takes effect when this notice is first published, only to the extent of rights the project may reserve. It does not revoke or narrow licenses previously validly granted, including for previously distributed versions or content; those grants remain effective under their original terms. It does not restrict uses permitted by applicable law. Third-party and separately licensed material retains its own terms.

## MPL notice

For files covered by MPL-2.0, the following notice from Exhibit A applies:

> This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.

The repository-level `LICENSE` and this file provide that notice for covered files even where individual source files do not repeat the header.

## Released versions

The MPL-2.0 grant applies to WebVideo+ original code across the released series, including the original portions corresponding to `v0.4.10.2` and the 1.0.0 release line. The `v0.4.10.2` tag predates the repository-level license files, so that historical tag snapshot itself does not contain them; current release tags should include `LICENSE`, `LICENSES.md`, `NOTICE.md`, and the third-party notices shipped by the build.

For source and executable redistribution, preserve the notices and source-availability requirements of MPL-2.0 and any additional obligations of the separately licensed material listed above.
