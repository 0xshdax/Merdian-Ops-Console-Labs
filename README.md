# Meridian Ops Console

A local operations workspace for account activity. The interface is a single-page console: overview, records, insights, reconciliation, and workspace preferences all run in the browser against a small JSON API.

## Requirements

- Node.js >= 22.5 (uses the built-in `node:sqlite` module — no dependencies to install).

## Run

```bash
npm start
# or: node --no-warnings server.js
```

Then open http://localhost:3000

Set a different port with `PORT=8080 npm start`.

The SQLite database is created and seeded on first run at `data/meridian.db`. Delete that file to reset records, notes, reconciliations, and sessions.
