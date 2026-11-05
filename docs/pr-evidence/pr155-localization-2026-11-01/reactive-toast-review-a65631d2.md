# QuestarrNG reactive toast browser review

- Pull request: [#155](https://github.com/snapetech-org/QuestarrNG/pull/155)
- Application source commit: `a65631d2ffe30118bc6c328b547b944d4b05afa1`
- Review environment: isolated, headed Agentic VM Chrome session; local QuestarrNG development server; viewport 1440×1000.
- Review date: 2026-11-01.

## Scenario and result

Completed first-run setup in Spanish, opened Settings → Appearance, saved Content Filtering, switched the interface to English, and saved again. The toast reflected the active interface language in both cases:

- Spanish: “Ajustes Actualizados” / “Se han salvado las preferencias de filtrado de contenidos.”
- English: “Settings Updated” / “Content filtering preferences have been saved.”

This checks the locale-reactive toast rendering and visible layout for this settings workflow. It also exercised the Spanish setup and settings labels. It does not cover the full application, mobile layouts, RTL rendering, dynamic error-placeholder language attributes, or qualified native-speaker review.

The browser review used a new task-scoped SQLite database and ordinary first-run UI setup. Nonfunctional, local-only IGDB values were supplied because the setup form requires both fields; no connection test or external service request was made. The database and its SQLite sidecars are removed after the server exits.

## Screenshots

Both screenshots are PNG, 1440×1000, captured at the application source commit listed above.

- [English content-filter save toast](content-filter-toast-en.png) — SHA-256 `6c993751b669090a7ad6511ba16f3bac5cd95146597722d4ae762d9ffe1392a0`
- [Spanish content-filter save toast](content-filter-toast-es.png) — SHA-256 `c3b72d8c17f99a52d22cd8430ce57b80683580c72b80bb1e06f0d5049d341584`

No tests, builds, scans, or CI jobs were run.
