const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'storytimes.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS seasons (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      "order" INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stories (
      id INTEGER PRIMARY KEY,
      season_id TEXT NOT NULL REFERENCES seasons(id),
      name TEXT NOT NULL,
      group_name TEXT,
      "order" INTEGER NOT NULL,
      races TEXT
    );

    CREATE TABLE IF NOT EXISTS missions (
      id INTEGER PRIMARY KEY,
      story_id INTEGER NOT NULL REFERENCES stories(id),
      name TEXT NOT NULL,
      "order" INTEGER NOT NULL,
      seed_full_mins REAL,
      seed_speed_mins REAL,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mission_id INTEGER NOT NULL REFERENCES missions(id),
      category TEXT NOT NULL CHECK(category IN ('full', 'speed')),
      duration_mins REAL NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      ip_hash TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_missions_story
      ON missions(story_id);

    CREATE INDEX IF NOT EXISTS idx_submissions_mission_category
      ON submissions(mission_id, category);

    CREATE INDEX IF NOT EXISTS idx_submissions_ratelimit
      ON submissions(ip_hash, mission_id, category, created_at);
  `);

  const cols = db.prepare("PRAGMA table_info(missions)").all().map(c => c.name);
  if (!cols.includes('description')) {
    db.exec("ALTER TABLE missions ADD COLUMN description TEXT");
  }
}

// ---- Season queries ----

function getAllSeasons() {
  return getDb().prepare(`
    SELECT
      s.id,
      s.name,
      s."order",
      COUNT(m.id) AS mission_count,
      COALESCE(SUM(
        COALESCE(sub_full.avg_mins, m.seed_full_mins)
      ), 0) AS total_full_mins,
      COALESCE(SUM(
        COALESCE(sub_speed.avg_mins, m.seed_speed_mins)
      ), 0) AS total_speed_mins
    FROM seasons s
    LEFT JOIN stories st ON st.season_id = s.id
    LEFT JOIN missions m ON m.story_id = st.id
    LEFT JOIN (
      SELECT mission_id, AVG(duration_mins) AS avg_mins
      FROM submissions WHERE category = 'full'
      GROUP BY mission_id
    ) sub_full ON sub_full.mission_id = m.id
    LEFT JOIN (
      SELECT mission_id, AVG(duration_mins) AS avg_mins
      FROM submissions WHERE category = 'speed'
      GROUP BY mission_id
    ) sub_speed ON sub_speed.mission_id = m.id
    GROUP BY s.id
    ORDER BY s."order"
  `).all();
}

function getSeasonById(id) {
  const season = getDb().prepare(`
    SELECT id, name, "order" FROM seasons WHERE id = ?
  `).get(id);
  if (!season) return null;

  season.stories = getStoriesBySeasonId(id);
  return season;
}

// ---- Story queries ----

function getStoriesBySeasonId(seasonId) {
  const stories = getDb().prepare(`
    SELECT id, name, group_name, "order", races
    FROM stories WHERE season_id = ? ORDER BY "order"
  `).all(seasonId);

  for (const story of stories) {
    story.races = story.races ? JSON.parse(story.races) : null;
    story.missions = getMissionsByStoryId(story.id);
  }
  return stories;
}

// ---- Mission queries ----

const MISSION_SELECT = `
  SELECT
    m.id,
    m.name,
    m.story_id,
    st.name AS story_name,
    st.group_name,
    st.races,
    s.id AS season_id,
    s.name AS season_name,
    m."order",
    m.seed_full_mins,
    m.seed_speed_mins,
    m.description
  FROM missions m
  JOIN stories st ON st.id = m.story_id
  JOIN seasons s ON s.id = st.season_id
`;

function getAllMissions() {
  return getDb().prepare(`
    ${MISSION_SELECT}
    ORDER BY s."order", st."order", m."order"
  `).all().map(formatMission);
}

function getMissionsByStoryId(storyId) {
  return getDb().prepare(`
    ${MISSION_SELECT}
    WHERE m.story_id = ?
    ORDER BY m."order"
  `).all(storyId).map(formatMission);
}

function getMissionById(id) {
  const mission = getDb().prepare(`
    ${MISSION_SELECT}
    WHERE m.id = ?
  `).get(id);
  if (!mission) return null;
  return formatMission(mission);
}

function getMissionsByIds(ids) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  return getDb().prepare(`
    ${MISSION_SELECT}
    WHERE m.id IN (${placeholders})
    ORDER BY s."order", st."order", m."order"
  `).all(...ids).map(formatMission);
}

function formatMission(row) {
  const stats = getDb().prepare(`
    SELECT
      category,
      COUNT(*) AS submissions,
      AVG(duration_mins) AS avg_mins,
      MIN(duration_mins) AS min_mins,
      MAX(duration_mins) AS max_mins
    FROM submissions
    WHERE mission_id = ?
    GROUP BY category
  `).all(row.id);

  const fullStats = stats.find(s => s.category === 'full');
  const speedStats = stats.find(s => s.category === 'speed');

  return {
    id: row.id,
    name: row.name,
    story_id: row.story_id,
    story_name: row.story_name,
    group_name: row.group_name,
    season_id: row.season_id,
    season_name: row.season_name,
    order: row.order,
    races: row.races ? JSON.parse(row.races) : null,
    description: row.description || null,
    times: {
      full: {
        seed_mins: row.seed_full_mins,
        avg_mins: fullStats ? round2(fullStats.avg_mins) : row.seed_full_mins,
        submissions: fullStats ? fullStats.submissions : 0,
        min_mins: fullStats ? fullStats.min_mins : null,
        max_mins: fullStats ? fullStats.max_mins : null,
      },
      speed: {
        seed_mins: row.seed_speed_mins,
        avg_mins: speedStats ? round2(speedStats.avg_mins) : row.seed_speed_mins,
        submissions: speedStats ? speedStats.submissions : 0,
        min_mins: speedStats ? speedStats.min_mins : null,
        max_mins: speedStats ? speedStats.max_mins : null,
      },
    },
  };
}

function round2(n) {
  return n == null ? null : Math.round(n * 100) / 100;
}

// ---- Submission queries ----

function createSubmission(missionId, category, durationMins, ipHash, source = 'manual') {
  return getDb().prepare(`
    INSERT INTO submissions (mission_id, category, duration_mins, ip_hash, source)
    VALUES (?, ?, ?, ?, ?)
  `).run(missionId, category, durationMins, ipHash, source);
}

function hasRecentSubmission(ipHash, missionId, category) {
  const row = getDb().prepare(`
    SELECT 1 FROM submissions
    WHERE ip_hash = ? AND mission_id = ? AND category = ?
      AND created_at > datetime('now', '-24 hours')
    LIMIT 1
  `).get(ipHash, missionId, category);
  return !!row;
}

function missionExists(id) {
  return !!getDb().prepare('SELECT 1 FROM missions WHERE id = ?').get(id);
}

// ---- Seed import ----

function upsertSeason(id, name, order) {
  getDb().prepare(`
    INSERT INTO seasons (id, name, "order") VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, "order" = excluded."order"
  `).run(id, name, order);
}

function upsertStory(id, seasonId, name, groupName, order, races) {
  const racesJson = races && races.length ? JSON.stringify(races) : null;
  getDb().prepare(`
    INSERT INTO stories (id, season_id, name, group_name, "order", races)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      season_id = excluded.season_id,
      name = excluded.name,
      group_name = excluded.group_name,
      "order" = excluded."order",
      races = excluded.races
  `).run(id, seasonId, name, groupName, order, racesJson);
}

function upsertMission(id, storyId, name, order, seedFullMins, seedSpeedMins, description) {
  getDb().prepare(`
    INSERT INTO missions (id, story_id, name, "order", seed_full_mins, seed_speed_mins, description)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      story_id = excluded.story_id,
      name = excluded.name,
      "order" = excluded."order",
      seed_full_mins = COALESCE(excluded.seed_full_mins, missions.seed_full_mins),
      seed_speed_mins = COALESCE(excluded.seed_speed_mins, missions.seed_speed_mins),
      description = COALESCE(excluded.description, missions.description)
  `).run(id, storyId, name, order, seedFullMins, seedSpeedMins, description || null);
}

// ---- Admin queries ----

function getSubmissions({ page = 1, limit = 50, mission_id, category, source } = {}) {
  const conditions = [];
  const params = [];

  if (mission_id) { conditions.push('s.mission_id = ?'); params.push(mission_id); }
  if (category) { conditions.push('s.category = ?'); params.push(category); }
  if (source) { conditions.push('s.source = ?'); params.push(source); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const offset = (page - 1) * limit;

  return getDb().prepare(`
    SELECT
      s.id, s.mission_id, m.name AS mission_name,
      s.category, s.duration_mins, s.source, s.created_at, s.ip_hash,
      avg_t.avg_mins
    FROM submissions s
    JOIN missions m ON m.id = s.mission_id
    LEFT JOIN (
      SELECT mission_id, category, AVG(duration_mins) AS avg_mins
      FROM submissions GROUP BY mission_id, category
    ) avg_t ON avg_t.mission_id = s.mission_id AND avg_t.category = s.category
    ${where}
    ORDER BY s.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);
}

function getSubmissionCount({ mission_id, category, source } = {}) {
  const conditions = [];
  const params = [];

  if (mission_id) { conditions.push('mission_id = ?'); params.push(mission_id); }
  if (category) { conditions.push('category = ?'); params.push(category); }
  if (source) { conditions.push('source = ?'); params.push(source); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  return getDb().prepare(`SELECT COUNT(*) AS total FROM submissions ${where}`).get(...params).total;
}

function deleteSubmission(id) {
  const result = getDb().prepare('DELETE FROM submissions WHERE id = ?').run(id);
  return result.changes > 0;
}

function deleteSubmissions(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const result = getDb().prepare(`DELETE FROM submissions WHERE id IN (${placeholders})`).run(...ids);
  return result.changes;
}

module.exports = {
  getDb,
  getAllSeasons,
  getSeasonById,
  getAllMissions,
  getMissionById,
  getMissionsByIds,
  createSubmission,
  hasRecentSubmission,
  missionExists,
  upsertSeason,
  upsertStory,
  upsertMission,
  getSubmissions,
  getSubmissionCount,
  deleteSubmissions,
  deleteSubmission,
};
