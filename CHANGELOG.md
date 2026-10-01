# [0.36.0](https://github.com/eGainDev/tudu/compare/tudu-0.35.1...tudu-0.36.0) (2026-10-01)


### Bug Fixes

* **ci:** align desktop deep-link versions and gate prod on macOS ([d97cf57](https://github.com/eGainDev/tudu/commit/d97cf57047182e32d4229f8da69203644554b1ba))
* **ci:** install full Tauri GTK deps on Linux ([d117c9b](https://github.com/eGainDev/tudu/commit/d117c9b67db3c666d274b29b619c74a0b6fbf039))
* **ci:** pass repo secrets into reusable CI workflow ([e99ae67](https://github.com/eGainDev/tudu/commit/e99ae67627d74691fd7b714444fcc519702d4457))
* **ci:** stabilize UI typecheck and desktop cargo on Linux ([4b39b35](https://github.com/eGainDev/tudu/commit/4b39b35d16d11d2bebf7b97d0d9d9a1866271bac))
* **ci:** use bracket syntax for E2E_DATABASE_URL_N secrets ([bfe290a](https://github.com/eGainDev/tudu/commit/bfe290ac2ed66f6250626a3afe3823cc3db33c39))
* **ci:** use E2E_DATABASE_URL secret for unit test:db job ([5f03ce2](https://github.com/eGainDev/tudu/commit/5f03ce289532c081ef91843393a222a2a4e14b7b))
* **db:** backfill drizzle journal when schema exists without history ([85e0374](https://github.com/eGainDev/tudu/commit/85e03745c67b4f8c47e5a891737ebef8f1540b00))
* **db:** repair partial drizzle journal and improve migration detection ([fb3745e](https://github.com/eGainDev/tudu/commit/fb3745e9ec067ca6d65ed93114868316b0a8f8b5))
* **e2e:** pass auth secret into CI database seed ([3097f24](https://github.com/eGainDev/tudu/commit/3097f2416334be63f7f1c1808736b71f0d36f368))
* **e2e:** prepare DB without local .env on CI ([83f9b20](https://github.com/eGainDev/tudu/commit/83f9b204cc3b2153804835e9337b83326d6d93f4))
* **e2e:** read dev DATABASE_URL only from repo .env ([9e4c893](https://github.com/eGainDev/tudu/commit/9e4c89335f96bf178708be5ec3dc5084ae0a76a5))
* **e2e:** repair inspector hooks and day navigation helpers ([d1abd28](https://github.com/eGainDev/tudu/commit/d1abd2827e107a4d53c4fef6bbbaee9200043dde))
* **e2e:** reuse server env for database seed in CI ([835e1f0](https://github.com/eGainDev/tudu/commit/835e1f0fcb5d73d69466634e2a71710278337751))
* **e2e:** unset DATABASE_URL during CI reset when no dev .env ([a647cf6](https://github.com/eGainDev/tudu/commit/a647cf693ca104484666eb05a1dcc0ad40859375))
* effective-day Today UX and Playwright E2E stability ([cbe21c3](https://github.com/eGainDev/tudu/commit/cbe21c3d99f95628c89291f91ff75ef76d6404e8))
* **server:** satisfy tsc in Docker build for staging deploy ([69eda23](https://github.com/eGainDev/tudu/commit/69eda233f17e2d5b2ba3570b1b9257d76baebd1c))
* tighten task key derivation and test fixtures ([c25f7f5](https://github.com/eGainDev/tudu/commit/c25f7f5556abcc998739c4beba2737948c6f4aff))
* Update DayJump and NavTabs components to use effective day logic ([c51d6f5](https://github.com/eGainDev/tudu/commit/c51d6f55f28595299a8c354f37e6f912637ba5a6))


### Features

* Enhance JIRA notification handling with status update presentation ([cc84dfc](https://github.com/eGainDev/tudu/commit/cc84dfcf8e442c8f7ea886551d181cb5b1470e4c))
* **ui:** colour picker 8b, toolbar 5.1b, requests badge ([9e9b5f2](https://github.com/eGainDev/tudu/commit/9e9b5f200c2cf7c9c912ebb02dc18de37b4427fe))
* **ui:** colour picker 8b, toolbar 5.1b, requests badge ([a6878ad](https://github.com/eGainDev/tudu/commit/a6878ad9ffafaf95d48df09467fc23ed2949b495))
* **ui:** move day switcher into Today tab per design 9a ([1dd0378](https://github.com/eGainDev/tudu/commit/1dd03784a76075a8dc6078483b4a1efa19656d39))
* **ui:** Quick Add attachments and note line (PR6) ([a990b2b](https://github.com/eGainDev/tudu/commit/a990b2b7d6ad07e7a921ac750607ff84e608a5d0))

## [0.35.1](https://github.com/eGainDev/tudu/compare/tudu-0.35.0...tudu-0.35.1) (2026-09-25)


### Bug Fixes

* Restore shared JIRA constant and narrow notification kind mapping ([62b1351](https://github.com/eGainDev/tudu/commit/62b13517d67e8077366f700dbfe1469747a112bd))
* Revamp notification preferences and introduce regular check system ([5d66c50](https://github.com/eGainDev/tudu/commit/5d66c50c4c5f78ce8994f00dc7f967a6dc0fb9a0))

# [0.35.0](https://github.com/eGainDev/tudu/compare/tudu-0.34.1...tudu-0.35.0) (2026-09-23)


### Bug Fixes

* Update task handling for NowCap management ([df2f731](https://github.com/eGainDev/tudu/commit/df2f7314b0320f1ff0884bd4a7b3500939e62559))


### Features

* Implement task capacity management for 'Now' bucket ([a1d9cf8](https://github.com/eGainDev/tudu/commit/a1d9cf8a98615247bcd6586810e8305afc53cbd2))

## [0.34.1](https://github.com/eGainDev/tudu/compare/tudu-0.34.0...tudu-0.34.1) (2026-09-21)


### Bug Fixes

* Enhance notification system with unread badge and permission handling ([d56d423](https://github.com/eGainDev/tudu/commit/d56d423f8e46400535f7cd94a5aaf612f948e8f6))

# [0.34.0](https://github.com/eGainDev/tudu/compare/tudu-0.33.1...tudu-0.34.0) (2026-09-21)


### Bug Fixes

* Add Docker Compose configurations for deployment and image building ([1e3693f](https://github.com/eGainDev/tudu/commit/1e3693f02be5bc48a6dae03357a71b41e38522a5))


### Features

* Enhance notification system with new reminder features ([4f0f964](https://github.com/eGainDev/tudu/commit/4f0f9643b6827a8640d48f2c26fcfd9e43e4d9c5))

## [0.33.1](https://github.com/eGainDev/tudu/compare/tudu-0.33.0...tudu-0.33.1) (2026-09-20)


### Bug Fixes

* **ci:** retry cancelled Dokploy prod deploys and skip staging on release ([011fd05](https://github.com/eGainDev/tudu/commit/011fd056c521f3c6575b560482c03705824c386e))
* **ci:** serialize Dokploy deploys and fail fast on cancel ([bbc6141](https://github.com/eGainDev/tudu/commit/bbc614165088b3440530603722fa5e6c9f951e48))
* update release workflow and configuration ([3a417e4](https://github.com/eGainDev/tudu/commit/3a417e475ebb78befdffde37b69d46ed367df401))

# [0.33.0](https://github.com/eGainDev/tudu/compare/tudu-0.32.0...tudu-0.33.0) (2026-09-20)


### Bug Fixes

* **ci:** exclude design folder from em-dash lint ([9837da5](https://github.com/eGainDev/tudu/commit/9837da5efab5783f50d2b30f068f0e9a8e514581))
* **db:** restore update(tasks) in deleteProject ([9f30b8b](https://github.com/eGainDev/tudu/commit/9f30b8ba16617b6869a4e7f76e8c9674139c39bd))


### Features

* **ci:** add staging release track and Dokploy helpers ([845bb69](https://github.com/eGainDev/tudu/commit/845bb69b1362bb9a7cd8d48fafde0a58799b9867))
* **ui:** add design folder guidelines and project settings component ([287d889](https://github.com/eGainDev/tudu/commit/287d88984d772d302a24b5beaca804e4921957cc))
* update Quick Add dimensions and enhance theme styling ([906dc44](https://github.com/eGainDev/tudu/commit/906dc4493559fa97768bda8656ec59845bda68bc))

# [0.32.0](https://github.com/eGainDev/tudu/compare/tudu-0.31.0...tudu-0.32.0) (2026-09-19)


### Bug Fixes

* align quick-add suggest tests with request schema ([44dfcc7](https://github.com/eGainDev/tudu/commit/44dfcc77063b27be95c022b7bc0803e43bbeac4d))
* defer FCM load so prod server starts in Docker ([5f6e323](https://github.com/eGainDev/tudu/commit/5f6e323d9caaf005fb09814d47f72af8de617fcd))
* dynamic-import firebase-admin inside FCM sender ([746289c](https://github.com/eGainDev/tudu/commit/746289cb49cca6d01396db6f7089f4c0ed6ebdba))


### Features

* enhance Quick Add functionality with start and deadline management ([c56850e](https://github.com/eGainDev/tudu/commit/c56850e95af3a8bcc35b89b373078ddcf1ec50da))
* enhance theme customization options and implement theme persistence ([22377f3](https://github.com/eGainDev/tudu/commit/22377f3a3b979fd2a4fde0d1211410e472436e89))
* integrate TypeSafe AI suggestions for Quick Add functionality ([490e148](https://github.com/eGainDev/tudu/commit/490e148af471730e049419c51eb6b65124df9314))

# [0.31.0](https://github.com/eGainDev/tudu/compare/tudu-0.30.0...tudu-0.31.0) (2026-09-18)


### Features

* integrate Firebase Cloud Messaging for web push notifications ([79e632c](https://github.com/eGainDev/tudu/commit/79e632c72a3c2e1a070196483b65d6ccf49d6483))

# [0.30.0](https://github.com/eGainDev/tudu/compare/tudu-0.29.0...tudu-0.30.0) (2026-09-18)


### Features

* enhance analytics integration with PostHog ([8e3eb5a](https://github.com/eGainDev/tudu/commit/8e3eb5a0d4de98763f3902623a278047c6a86e36))

# [0.29.0](https://github.com/eGainDev/tudu/compare/tudu-0.28.0...tudu-0.29.0) (2026-09-17)


### Bug Fixes

* streamline Quick Add window visibility management ([9f2a6e8](https://github.com/eGainDev/tudu/commit/9f2a6e8940c8a1d2055ec79b057a2455ba9c47ad))


### Features

* integrate PostHog analytics for user tracking ([807cea1](https://github.com/eGainDev/tudu/commit/807cea1fdecd92fd8ba253ec361850787ff76bbe))

# [0.28.0](https://github.com/eGainDev/tudu/compare/tudu-0.27.0...tudu-0.28.0) (2026-09-17)


### Bug Fixes

* update environment and API configurations ([fcff464](https://github.com/eGainDev/tudu/commit/fcff4642a7838153feb2db8bce1fda6cb1900568))


### Features

* add Quick Add feature for task management ([2098957](https://github.com/eGainDev/tudu/commit/2098957ae80bbe2f6b003be895dff8e8d22b8c6a))

# [0.27.0](https://github.com/eGainDev/tudu/compare/tudu-0.26.0...tudu-0.27.0) (2026-09-17)


### Features

* enhance desktop updater with update scheduling and notification features ([4854d0b](https://github.com/eGainDev/tudu/commit/4854d0bbad635962fa69083e3a53b7255bc4da41))

# [0.26.0](https://github.com/eGainDev/tudu/compare/tudu-0.25.0...tudu-0.26.0) (2026-09-17)


### Features

* document rraj.dev API requirement for desktop installs ([aa937b7](https://github.com/eGainDev/tudu/commit/aa937b70b3cb1a4baf149c96431ebaae8532b601))
* enhance task attachment functionality with dialog and filesystem support ([11f433d](https://github.com/eGainDev/tudu/commit/11f433d7da9b0948521006a60858183535f06f06))

# [0.25.0](https://github.com/eGainDev/tudu/compare/tudu-0.24.0...tudu-0.25.0) (2026-09-17)


### Bug Fixes

* ensure MinIO bucket on first upload ([7928cd8](https://github.com/eGainDev/tudu/commit/7928cd8ba4b28479c152857501c7d2f6877c32e6))
* release build and MinIO attachment compose for prod ([1387d5b](https://github.com/eGainDev/tudu/commit/1387d5b3c267d9f9846ef47d09b2019b2f49ad1d))
* use filesystem attachment volume on Dokploy ([742cf44](https://github.com/eGainDev/tudu/commit/742cf44ce1fa4e68b55fb01b278bece85ad874c0))


### Features

* implement task attachment functionality ([1515759](https://github.com/eGainDev/tudu/commit/15157592f6604fe858327eb538e985686bfd0aee))

# [0.24.0](https://github.com/eGainDev/tudu/compare/tudu-0.23.0...tudu-0.24.0) (2026-09-16)


### Features

* add CompletedSection component and related functionality ([6067858](https://github.com/eGainDev/tudu/commit/6067858f6ea5329f7acc2d151d6e84cd70712885))

# [0.23.0](https://github.com/eGainDev/tudu/compare/tudu-0.22.0...tudu-0.23.0) (2026-09-16)


### Bug Fixes

* enhance navigation components with improved active link handling ([f77466e](https://github.com/eGainDev/tudu/commit/f77466ee61533f9ec3ade8257353badf1c9a0823))
* update Jira issue status structure to include colorName ([971f82f](https://github.com/eGainDev/tudu/commit/971f82fcf273fb0fd00dc17aba05a285b4c5aa93))


### Features

* configure Workbox to cache larger files ([b7c3c1f](https://github.com/eGainDev/tudu/commit/b7c3c1ff53ac58450fb837a1775c0ec3e467e3ae))
* integrate Playwright for end-to-end testing and enhance environment configuration ([c95f74c](https://github.com/eGainDev/tudu/commit/c95f74c65587a69238e13eb679cf9c6c8d635736))

# [0.22.0](https://github.com/eGainDev/tudu/compare/tudu-0.21.0...tudu-0.22.0) (2026-09-12)


### Features

* add report inbox and unscheduled tasks functionality ([b1398fd](https://github.com/eGainDev/tudu/commit/b1398fd3af2086b27c4892263be6c2385518e476))
* enhance inbox item acceptance with scheduled date support ([508cded](https://github.com/eGainDev/tudu/commit/508cded426f2ed1e2923383ea76e3f9479464dbf))
* implement day hydration and search synchronization ([ac31047](https://github.com/eGainDev/tudu/commit/ac3104789d6aff33552b95427c944cab25199f55))
* prevent duplicate comments during server echo ([bc505a9](https://github.com/eGainDev/tudu/commit/bc505a9caf48fa10ca60ef5595458694811f0d4d))

# [0.21.0](https://github.com/eGainDev/tudu/compare/tudu-0.20.0...tudu-0.21.0) (2026-09-11)


### Features

* enhance project management with privacy features ([f1f63d8](https://github.com/eGainDev/tudu/commit/f1f63d86b0511c3d02804038fe0c7059fd5cabcf))
* implement PWA support and enhance web app configuration ([7eb6973](https://github.com/eGainDev/tudu/commit/7eb69736a45d75d652367aba50eec5fa4628181a))

# [0.20.0](https://github.com/eGainDev/tudu/compare/tudu-0.19.0...tudu-0.20.0) (2026-09-11)


### Features

* enhance task schemas and UI with new updateTaskRequestSchema and improved TaskRow behavior ([61a3b1c](https://github.com/eGainDev/tudu/commit/61a3b1c1275ec7ef8c12413177c090ae9987034f))
* enhance team management UI with new components and responsive design ([0d03017](https://github.com/eGainDev/tudu/commit/0d03017da0e42c41aaf45f2e7fd61a567f844db6))
* implement project management features in task system ([22f7a99](https://github.com/eGainDev/tudu/commit/22f7a99ef4109e3a1b9560af59a929139439529c))
* integrate notification system into desktop app ([954d0f4](https://github.com/eGainDev/tudu/commit/954d0f4f5c6435104945ea27f6269dc6f52f1971))

# [0.19.0](https://github.com/eGainDev/tudu/compare/tudu-0.18.0...tudu-0.19.0) (2026-09-11)


### Features

* introduce loading skeleton components for improved UI experience ([08ca510](https://github.com/eGainDev/tudu/commit/08ca510ed9c5ad5b8cf6e1ff18117b8b82aaa04c))
* update viewport handling and enhance UI components ([4bbef54](https://github.com/eGainDev/tudu/commit/4bbef542abe7ebc8fbb3df5ec6cdac2e6ec52525))

# [0.18.0](https://github.com/eGainDev/tudu/compare/tudu-0.17.0...tudu-0.18.0) (2026-09-11)


### Features

* add task description support across the application ([9f1f1aa](https://github.com/eGainDev/tudu/commit/9f1f1aa21ff9bf455ac67b0385a19c18513791d3))

# [0.17.0](https://github.com/eGainDev/tudu/compare/tudu-0.16.0...tudu-0.17.0) (2026-09-11)


### Features

* add live sync so task changes show up without a reload ([9e136e4](https://github.com/eGainDev/tudu/commit/9e136e4da9d9922ebdf3c1b17ad59eba5b74d910))

# [0.16.0](https://github.com/eGainDev/tudu/compare/tudu-0.15.1...tudu-0.16.0) (2026-09-10)


### Bug Fixes

* persist in-progress and stop complete overlap ([30a1b59](https://github.com/eGainDev/tudu/commit/30a1b5904741948420d74f56be8427d6f879f918))


### Features

* add in-progress flag and lighter task row UX ([d43b353](https://github.com/eGainDev/tudu/commit/d43b353aa44486474c43d05d7bed4c12a914431b))
* add manager inbox, team roster, and report day ([20a9e68](https://github.com/eGainDev/tudu/commit/20a9e685296eb79743b5839f02f2a2dba9ba779b))

## [0.15.1](https://github.com/eGainDev/tudu/compare/tudu-0.15.0...tudu-0.15.1) (2026-09-08)


### Bug Fixes

* prefix git tags with tudu- to dodge org tag rules ([35db685](https://github.com/eGainDev/tudu/commit/35db68585626db766b89d9b22cf28e4ac48d0844))

# [0.14.0](https://github.com/eGainDev/tudu/compare/v0.13.0...v0.14.0) (2026-09-08)


### Bug Fixes

* add DOM lib so shared linkPreview builds in CI ([22df317](https://github.com/eGainDev/tudu/commit/22df31712b27f72b2007918bddf9a095460e028b))
* checkout release commit SHA when tag push is blocked ([d8306b1](https://github.com/eGainDev/tudu/commit/d8306b10233c7c400bec6357c5a25fe45cd9ef85))
* reset git state before retrying release as 0.15.0 ([60c92c2](https://github.com/eGainDev/tudu/commit/60c92c228868afd999dd9bd1131a016aa7b6c9a7))
* skip immutable v0.14.0 tag and retry release as 0.15.0 ([05b43e8](https://github.com/eGainDev/tudu/commit/05b43e8f42030dd15f8faa181ab8a18d6164d9b5))


### Features

* add link preview functionality and task description support ([891894a](https://github.com/eGainDev/tudu/commit/891894a46d1edb4abceb3b7dd40d89c77cae34c6))

# [0.13.0](https://github.com/eGainDev/tudu/compare/v0.12.1...v0.13.0) (2026-09-07)


### Features

* implement command palette with keyboard shortcuts ([bac70bc](https://github.com/eGainDev/tudu/commit/bac70bc3d0aed2c12e6085add3601e44910383b9))

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
