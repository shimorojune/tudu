# Later

Things we decided to do after the rewrite ships. Each line says where it came from.

- Close matches by meaning in Search and Quick Add: brought forward as chunk 13 on 22 Oct 2026.
- OS notifications on desktop and in the browser: brought forward as chunk 14 on 22 Oct 2026. Push to closed phones and browsers stays here.
- WebKit end-to-end runs, since the macOS app renders in WebKit. Decided 20 Oct 2026.
- Jira Cloud (email plus API token) alongside Data Center. Decided 20 Oct 2026.
- Upgrade the Dokploy host from t4g.large when test runs and production start to compete. Decided 20 Oct 2026.
- Database backups: brought forward as chunk 15 on 22 Oct 2026. A quarterly restore rehearsal on staging stays here as a reminder.
- Object storage runs RustFS because the MinIO vendor pulled its public Docker images. Re-check RustFS maturity, or move to Garage, before production carries real files. Decided 20 Oct 2026.
- A periodic clean-up of sign-in codes nobody used (today they are cleared a day after they expire, when the next code is sent). Chunk 02, 20 Oct 2026.
