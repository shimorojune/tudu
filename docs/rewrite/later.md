# Later

Things we decided to do after the rewrite ships. Each line says where it came from.

- Close matches by meaning in Search and Quick Add (vector search, pgvector is already in the database image). Canvas 07, decided 20 Oct 2026.
- OS notifications on desktop and in the browser, driven by Settings › Notifications. Decided 20 Oct 2026.
- WebKit end-to-end runs, since the macOS app renders in WebKit. Decided 20 Oct 2026.
- Jira Cloud (email plus API token) alongside Data Center. Decided 20 Oct 2026.
- Upgrade the Dokploy host from t4g.large when test runs and production start to compete. Decided 20 Oct 2026.
- Database backups from Dokploy to object storage once production has data worth keeping.
- Object storage runs RustFS because the MinIO vendor pulled its public Docker images. Re-check RustFS maturity, or move to Garage, before production carries real files. Decided 20 Oct 2026.
