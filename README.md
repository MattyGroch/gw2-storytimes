# GW2 Story Times

A community-driven database of Guild Wars 2 story mission completion times, exposed via an open REST API.

Two categories per mission:
- **Full Experience** -- watching all cutscenes, reading dialogue
- **Speedrun** -- skipping everything, optimal pathing

Seeded with data from YouTube walkthroughs, refined over time by user submissions.

## API

Base URL: `https://api.gw2storytimes.com/v1`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/seasons` | All seasons with mission counts and total time estimates |
| `GET` | `/v1/seasons/:id` | Single season with all missions and times |
| `GET` | `/v1/missions` | All missions with computed average times |
| `GET` | `/v1/missions/:id` | Single mission with seed times, user averages, and submission count |
| `POST` | `/v1/missions/:id/submit` | Submit a time entry (category + duration) |
| `GET` | `/v1/estimate?missions=id1,id2,...` | Bulk time estimate for a set of missions |

## Development

```bash
cd api
npm install
npm start
```

The API runs on port 3000 by default. Set `PORT` and `IP_HASH_SALT` environment variables as needed.

### Seed data

Generate a `seed-data.json` template from the GW2 API:

```bash
npm run fetch-missions
```

Import seed data into the database:

```bash
npm run import-seed
```

Seed data is also automatically imported on server startup.

## Deployment

Built as a Docker container behind Traefik. Push to `main` triggers a Portainer webhook redeploy.

```bash
docker compose up -d --build
```
