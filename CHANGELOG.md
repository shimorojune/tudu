## [0.12.1](https://github.com/eGainDev/tudu/compare/v0.12.0...v0.12.1) (2026-09-07)


### Bug Fixes

* expose TAURI env vars so desktop update check runs ([12cc98b](https://github.com/eGainDev/tudu/commit/12cc98b6fa9a23bdf991a9869fd32997efadf287))

# [0.12.0](https://github.com/eGainDev/tudu/compare/v0.11.0...v0.12.0) (2026-09-07)


### Bug Fixes

* simplify window management in Tauri app ([99aa765](https://github.com/eGainDev/tudu/commit/99aa765a3d33b9be595b1c54966902f87def08ac))


### Features

* add week view with drag reschedule and unscheduled rail ([89eac24](https://github.com/eGainDev/tudu/commit/89eac243b80155e8535d665ce52c1e62a914b7dc))

# [0.11.0](https://github.com/eGainDev/tudu/compare/v0.10.1...v0.11.0) (2026-09-07)


### Bug Fixes

* update font weights for Archivo in HTML files and adjust TaskRow component styling ([ddc988c](https://github.com/eGainDev/tudu/commit/ddc988cd8f016b4af276214b860d28689cdb9604))


### Features

* add in-app OTA update banner with GitHub release link ([6dff7c6](https://github.com/eGainDev/tudu/commit/6dff7c6600662c0f9152b78b1db31e0078846e8b))

## [0.10.1](https://github.com/eGainDev/tudu/compare/v0.10.0...v0.10.1) (2026-09-07)


### Bug Fixes

* bake prod API URL into macOS release builds ([c6af65c](https://github.com/eGainDev/tudu/commit/c6af65c0ec4976f3480627fd709b0c959f261965))

# [0.10.0](https://github.com/eGainDev/tudu/compare/v0.9.0...v0.10.0) (2026-09-07)


### Bug Fixes

* correct tauri dialog API for macOS updater prompts ([577002a](https://github.com/eGainDev/tudu/commit/577002abaad3ba21a23faf9d790d0196e7866e50))
* pass UPDATES env vars through docker-compose ([29cd441](https://github.com/eGainDev/tudu/commit/29cd441df43e49b4e3b20d860aca1e8a27cb8bcb))


### Features

* add Mac OTA updates via API proxy and update prompts ([db8170e](https://github.com/eGainDev/tudu/commit/db8170e8487085e8dc0cb58494532f68cdf31671))

# [0.9.0](https://github.com/eGainDev/tudu/compare/v0.8.0...v0.9.0) (2026-09-07)


### Features

* add per-bucket task modal and subtask edit/delete ([3c75d10](https://github.com/eGainDev/tudu/commit/3c75d1098a429d5a78d3757636f1d892f92f670a))

# [0.8.0](https://github.com/eGainDev/tudu/compare/v0.7.0...v0.8.0) (2026-09-07)


### Features

* rollover, carry dots, and task creation UX ([de596b9](https://github.com/eGainDev/tudu/commit/de596b9cf0639fc18304d5ddaf44423ced80cb6d))

# [0.7.0](https://github.com/eGainDev/tudu/compare/v0.6.1...v0.7.0) (2026-09-06)


### Bug Fixes

* harden release workflow for blocked tags and CI-only publish ([8c79b10](https://github.com/eGainDev/tudu/commit/8c79b10e18775e7154c4f2c041734e5d9a59d674))


### Features

* add detail pane with comments and timeline ([be6766b](https://github.com/eGainDev/tudu/commit/be6766bc45a3e5edfe10719253598a1e3cc7788e))

# [0.6.0](https://github.com/eGainDev/tudu/compare/v0.5.2...v0.6.0) (2026-09-06)


### Bug Fixes

* improve deployment logic in Dokploy action ([ca7faa8](https://github.com/eGainDev/tudu/commit/ca7faa8194fd087fbd97e339cbb9bb6252279623))
* narrow element type in useSlideOnReorder for tsc build ([cc4f527](https://github.com/eGainDev/tudu/commit/cc4f527ebdd6c053a9a0897249a0e481786be5e8))
* repair release publish and rollback in CI workflow ([e6c386e](https://github.com/eGainDev/tudu/commit/e6c386e3c5dc9cf91fe1363e06f6d5b454c0e6ef))


### Features

* add drag-drop reordering, subtask reorder, and task row UX ([9fe1093](https://github.com/eGainDev/tudu/commit/9fe109349843e9c1c8306678d26cc4e08c432076))

# [0.6.0](https://github.com/eGainDev/tudu/compare/v0.5.2...v0.6.0) (2026-09-06)


### Bug Fixes

* improve deployment logic in Dokploy action ([ca7faa8](https://github.com/eGainDev/tudu/commit/ca7faa8194fd087fbd97e339cbb9bb6252279623))
* narrow element type in useSlideOnReorder for tsc build ([cc4f527](https://github.com/eGainDev/tudu/commit/cc4f527ebdd6c053a9a0897249a0e481786be5e8))


### Features

* add drag-drop reordering, subtask reorder, and task row UX ([9fe1093](https://github.com/eGainDev/tudu/commit/9fe109349843e9c1c8306678d26cc4e08c432076))

# [0.6.0](https://github.com/eGainDev/tudu/compare/v0.5.2...v0.6.0) (2026-09-06)


### Bug Fixes

* improve deployment logic in Dokploy action ([ca7faa8](https://github.com/eGainDev/tudu/commit/ca7faa8194fd087fbd97e339cbb9bb6252279623))


### Features

* add drag-drop reordering, subtask reorder, and task row UX ([9fe1093](https://github.com/eGainDev/tudu/commit/9fe109349843e9c1c8306678d26cc4e08c432076))

## [0.5.2](https://github.com/eGainDev/tudu/compare/v0.5.1...v0.5.2) (2026-09-06)


### Bug Fixes

* enhance dokploy deployment action with polling options ([f55c693](https://github.com/eGainDev/tudu/commit/f55c69399cbe6142db7368906306de535807030e))

## [0.5.1](https://github.com/eGainDev/tudu/compare/v0.5.0...v0.5.1) (2026-09-05)


### Bug Fixes

* build @tudu/shared before web and desktop bundles ([651e0f8](https://github.com/eGainDev/tudu/commit/651e0f82453081e875d0359b3d6ce93902fe8951))

# [0.5.0](https://github.com/eGainDev/tudu/compare/v0.4.0...v0.5.0) (2026-09-05)


### Features

* add database migration step and new tray icon generation ([b72aa26](https://github.com/eGainDev/tudu/commit/b72aa267ac5ae7d4b2f81c6dcdc7e6564caa5e5a))
* add read-only Today screen and dynamic day tab ([a76af6d](https://github.com/eGainDev/tudu/commit/a76af6d584f2106847a36dd84d780f72a2812cc3))


### Reverts

* Revert "refactor: clean up styles in BrandMark, DayJump, Calendar, and ToggleGroup components" ([de379a6](https://github.com/eGainDev/tudu/commit/de379a661619f7d81d9b46b6a3cf3ec02d3f9f58))

# [0.4.0](https://github.com/eGainDev/tudu/compare/v0.3.0...v0.4.0) (2026-09-05)


### Bug Fixes

* update icon generation logic and improve image resizing ([dc30cb7](https://github.com/eGainDev/tudu/commit/dc30cb7e37107d797e93c384b7705e4e8877c451))


### Features

* add task data model and API ([ba25c3b](https://github.com/eGainDev/tudu/commit/ba25c3be7323f507c269e9f8cdd3b685245b38ed))

# [0.3.0](https://github.com/eGainDev/tudu/compare/v0.2.1...v0.3.0) (2026-09-05)


### Bug Fixes

* Exempt /health from Clerk auth and pass publishable key to server ([bb7ee9d](https://github.com/eGainDev/tudu/commit/bb7ee9d1dc44ad144b019510a154d848e8c1961b))
* Harden Dokploy deploy with Docker build fixes and API retries ([a7de1da](https://github.com/eGainDev/tudu/commit/a7de1dac26fba50cf5dd13fdd3702ae3158a5d23))
* Point workspace package exports at compiled JS in production ([2126d4b](https://github.com/eGainDev/tudu/commit/2126d4b7f37ed4750fe6f946512efcec0c7ce569))
* Use pnpm deploy for production server Docker image ([90da0fb](https://github.com/eGainDev/tudu/commit/90da0fb3503e90ef0c13963c58746f6938c70d2d))


### Features

* replace Clerk with Better Auth and add UI foundations ([539a878](https://github.com/eGainDev/tudu/commit/539a8783652d9b1e4d972e65fc52f9b06a72ea5a))

## [0.2.1](https://github.com/eGainDev/tudu/compare/v0.2.0...v0.2.1) (2026-09-05)


### Bug Fixes

* Install ripgrep in release workflow ([f840020](https://github.com/eGainDev/tudu/commit/f840020b375b22b7e1300a5f462ed47c3f1f420b))

# [0.2.0](https://github.com/eGainDev/tudu/compare/v0.1.1...v0.2.0) (2026-09-05)


### Bug Fixes

* Update README.md to clarify environment variable usage for production ([549ae0b](https://github.com/eGainDev/tudu/commit/549ae0bab8ab111276d6a4ca101d88949343dd24))


### Features

* Add Docker support and enhance environment configuration ([c1e2d3e](https://github.com/eGainDev/tudu/commit/c1e2d3ebf5b9ca40fbc5b2b9ad455f908ff2e65b))

## [0.1.1](https://github.com/eGainDev/tudu/compare/v0.1.0...v0.1.1) (2026-09-04)


### Bug Fixes

* use draft GitHub releases until macOS assets upload ([4763546](https://github.com/eGainDev/tudu/commit/4763546886aa2aa3262b4ecb1d7bf773e995f199))

# [0.1.0](https://github.com/eGainDev/tudu/compare/v0.0.1...v0.1.0) (2026-09-04)


### Bug Fixes

* add conventional-changelog-conventionalcommits for semantic-release ([23df5d4](https://github.com/eGainDev/tudu/commit/23df5d403b518318fb9b311a8c5e08a775442d7a))
* Enhance release workflow for macOS app packaging ([261bef2](https://github.com/eGainDev/tudu/commit/261bef2f25865648f254f27cd74fb448be754b36))
* repair release workflow for master branch and CI lint ([53e29a6](https://github.com/eGainDev/tudu/commit/53e29a6b43cda3364d2c10bee55da747557f6e47))


### Features

* Initialize Tudu monorepo with version 0.0.1 and add essential configurations. ([09247ff](https://github.com/eGainDev/tudu/commit/09247ff1ab0db41f3ba9bb2686e1e22da8396d56))

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.1](https://github.com/your-org/tudu/releases/tag/v0.0.1) (2026-09-04)

### Features

* initial monorepo setup
