# GW2 Story Times

A community-driven database of Guild Wars 2 story mission completion times, exposed via an open REST API.

Two categories per mission:
- **Full Experience** -- watching all cutscenes, reading dialogue
- **Speedrun** -- skipping everything, optimal pathing

Seeded with data from YouTube walkthroughs, refined over time by user submissions.

## API

Base URL: `https://api.gw2storytimes.com/v1`

CORS is open to all origins. Any browser app can consume it directly.

### Endpoint Summary

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/seasons` | All seasons with mission counts and total time estimates |
| `GET` | `/v1/seasons/:id` | Single season with nested stories and missions |
| `GET` | `/v1/missions` | All missions with computed average times |
| `GET` | `/v1/missions/:id` | Single mission with seed times, user averages, and submission count |
| `POST` | `/v1/missions/:id/submit` | Submit a time entry |
| `GET` | `/v1/estimate?missions=id1,id2,...` | Bulk time estimate for a set of missions |
| `GET` | `/v1/stats` | Submission count and the site-wide speedrun ratio |

### Rate Limits

| Scope | Limit |
|-------|-------|
| Global (API endpoints) | 300 requests / 15 minutes |
| Submissions | 10 per minute |
| Per-mission submission | 1 per mission per category per 24 hours (per IP) |

### GET /v1/seasons

List all seasons with mission counts and aggregate time estimates.

```bash
curl https://api.gw2storytimes.com/v1/seasons
```

**Response:**

```json
[
  {
    "id": "215AAA0F-CDAC-4F93-86DA-C155A99B5784",
    "name": "My Story",
    "order": 0,
    "mission_count": 313,
    "total_full_mins": 3180.5,
    "total_speed_mins": 478.54,
    "speed_mission_count": 88,
    "speed_ratio": 0.29,
    "est_total_speed_mins": 1673.21,
    "speed_is_estimated": true
  },
  {
    "id": "A515A1D3-4BD7-4594-AE30-2C5D05FF5960",
    "name": "Living World Season 1",
    "order": 1,
    "mission_count": 46,
    "total_full_mins": 540,
    "total_speed_mins": 0,
    "speed_mission_count": 0,
    "speed_ratio": null,
    "est_total_speed_mins": null,
    "speed_is_estimated": false
  }
]
```

**Speedrun totals.** Speedrun times are submitted far less often than
full-experience times, so `total_speed_mins` — the plain sum of what has been
submitted — reads as though a season is over in an hour. Use
`est_total_speed_mins` for a season total: missions with no speedrun time are
projected from their full-experience time at `speed_ratio`, the season's own
speedrun ratio shrunk toward the site-wide one (see `/v1/stats`) so a season
resting on a handful of times does not swing on those few missions.

| Field | Meaning |
|-------|---------|
| `total_speed_mins` | Sum of submitted speedrun times only — a floor, not a season total |
| `speed_mission_count` | Missions in the season that have a speedrun time |
| `speed_ratio` | Speedrun time as a share of full-experience time, used for the projection |
| `est_total_speed_mins` | Season total including projections, or `null` when the season has no speedrun times at all |
| `speed_is_estimated` | `true` when the total contains at least one projected mission |

### GET /v1/seasons/:id

Single season with nested stories and their missions (including full time data).

**Parameters:**
- `:id` — Season ID (GW2 API GUID format)

```bash
curl https://api.gw2storytimes.com/v1/seasons/215AAA0F-CDAC-4F93-86DA-C155A99B5784
```

**Response:**

```json
{
  "id": "215AAA0F-CDAC-4F93-86DA-C155A99B5784",
  "name": "My Story",
  "order": 0,
  "stories": [
    {
      "id": 8,
      "name": "My Story (Asura)",
      "group_name": "Ch. 1-3",
      "order": 1,
      "races": ["Asura"],
      "missions": [
        {
          "id": 15,
          "name": "Explosive Intellect",
          "story_id": 8,
          "story_name": "My Story (Asura)",
          "group_name": "Ch. 1-3",
          "season_id": "215AAA0F-CDAC-4F93-86DA-C155A99B5784",
          "season_name": "My Story",
          "order": 1,
          "races": ["Asura"],
          "times": {
            "full": {
              "seed_mins": 12,
              "avg_mins": 12,
              "submissions": 0,
              "min_mins": null,
              "max_mins": null
            },
            "speed": {
              "seed_mins": null,
              "avg_mins": null,
              "submissions": 0,
              "min_mins": null,
              "max_mins": null
            }
          }
        }
      ]
    }
  ]
}
```

### GET /v1/missions

All missions with computed average times. Mission `id` values correspond directly to GW2 API quest IDs, making it easy to cross-reference with `/v2/characters/:name/quests`.

```bash
curl https://api.gw2storytimes.com/v1/missions
```

**Response:** Array of mission objects (same shape as shown in the season detail response above).

### GET /v1/missions/:id

Single mission with full time data and submission statistics.

**Parameters:**
- `:id` — Mission ID (integer, matches GW2 quest ID)

```bash
curl https://api.gw2storytimes.com/v1/missions/15
```

**Response:**

```json
{
  "id": 15,
  "name": "Explosive Intellect",
  "story_id": 8,
  "story_name": "My Story (Asura)",
  "group_name": "Ch. 1-3",
  "season_id": "215AAA0F-CDAC-4F93-86DA-C155A99B5784",
  "season_name": "My Story",
  "order": 1,
  "races": ["Asura"],
  "times": {
    "full": {
      "seed_mins": 12,
      "avg_mins": 12,
      "submissions": 0,
      "min_mins": null,
      "max_mins": null
    },
    "speed": {
      "seed_mins": null,
      "avg_mins": null,
      "submissions": 0,
      "min_mins": null,
      "max_mins": null
    }
  }
}
```

**Time fields:**
- `seed_mins` — Initial estimate from YouTube walkthroughs
- `avg_mins` — Average of community submissions (falls back to `seed_mins` when no submissions exist)
- `submissions` — Number of community submissions
- `min_mins` / `max_mins` — Fastest and slowest community submissions

### POST /v1/missions/:id/submit

Submit a completion time for a mission.

**Parameters:**
- `:id` — Mission ID (integer)

**Request body:**

```json
{
  "category": "full",
  "duration_mins": 14
}
```

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `category` | string | Yes | `"full"` or `"speed"` |
| `duration_mins` | number | Yes | Between 1 and 480 |

```bash
curl -X POST https://api.gw2storytimes.com/v1/missions/15/submit \
  -H "Content-Type: application/json" \
  -d '{"category": "full", "duration_mins": 14}'
```

**Response (201):**

```json
{
  "message": "Submission recorded",
  "mission_id": 15,
  "category": "full",
  "duration_mins": 14
}
```

### GET /v1/estimate

Bulk time estimate for a set of mission IDs. Useful for calculating total remaining playtime.

**Query parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `missions` | string | Yes | — | Comma-separated mission IDs |
| `category` | string | No | `"full"` | `"full"` or `"speed"` |

```bash
curl "https://api.gw2storytimes.com/v1/estimate?missions=15,16,17&category=full"
```

**Response:**

```json
{
  "category": "full",
  "requested": 3,
  "found": 3,
  "with_data": 3,
  "without_data": 0,
  "total_mins": 36.5,
  "total_hours": 0.61,
  "missions": [
    { "id": 15, "name": "Explosive Intellect", "avg_mins": 12 },
    { "id": 16, "name": "Interested Parties", "avg_mins": 11 },
    { "id": 17, "name": "Golem Positioning System", "avg_mins": 13.5 }
  ]
}
```

### GET /v1/stats

Site-wide totals.

```bash
curl https://api.gw2storytimes.com/v1/stats
```

**Response:**

```json
{
  "total_submissions": 628,
  "speed_ratio": 0.433
}
```

`speed_ratio` is speedrun time as a share of full-experience time across every
mission that has both — the prior that `/v1/seasons` shrinks each season's own
ratio toward when projecting missing speedrun times. `null` if no mission has
both times yet.

### Error Responses

All errors return JSON with an `error` field:

```json
{ "error": "Mission not found" }
```

| Status | Cause |
|--------|-------|
| `400` | Validation error — invalid ID format, missing required fields, duration out of range |
| `404` | Season or mission not found |
| `429` | Rate limit exceeded, or duplicate submission within 24 hours |

## How to Credit

If you use GW2 Story Times data in a public-facing project, we appreciate a visible attribution. Here's a snippet you can drop into your README, About page, or footer:

```
Data sourced from [GW2 Story Times](https://gw2storytimes.com). Community contributions welcome.
```

Linking back to [gw2storytimes.com](https://gw2storytimes.com) helps keep the database a community-supported resource. Users can contribute times directly on the site or through the [Blish HUD](https://blishhud.com/modules/?module=mattygroch.storytimes) and [Nexus](https://github.com/MattyGroch/gw2-storytimes-nexus) addons.

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

Built as a Docker container behind Traefik. Push to `master` triggers a Portainer webhook redeploy.

```bash
docker compose up -d --build
```
