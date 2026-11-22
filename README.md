# FloodGuard

From early warning to rescue for flood-prone Nigerian communities (ISF × ATC Africa BuildAthon, ClimateTech).

> Work in progress — full README with architecture, demo script and data licences lands in phase 8.

## Quick start (local)

```bash
docker compose up -d db        # PostGIS on localhost:54329
cp .env.example .env
npm install
npm run setup                  # migrations + Lokoja seed data
npm run dev                    # http://localhost:3000
```
