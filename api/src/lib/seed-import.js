'use strict';

const fs = require('fs');
const path = require('path');
const db = require('../db');

const SEED_PATH = path.join(__dirname, '..', '..', 'seed-data.json');

// Only reconcile genuinely-manual stories (id = manual_id), not API stories
// that received a manual_id tag after a previous reconciliation.
function reconcileManualStories(d, seedStories) {
  const manualStories = d.prepare(
    'SELECT id, season_id, "order", manual_id FROM stories WHERE manual_id IS NOT NULL AND id = manual_id'
  ).all();
  if (!manualStories.length) return 0;

  let reconciled = 0;
  for (const manual of manualStories) {
    const match = seedStories.find(
      s => s.season_id === manual.season_id && s.order === manual.order
    );
    if (!match) continue;

    const apiStoryExists = d.prepare('SELECT 1 FROM stories WHERE id = ?').get(match.id);
    if (!apiStoryExists) continue;

    d.prepare('UPDATE missions SET story_id = ? WHERE story_id = ?').run(match.id, manual.id);
    d.prepare('DELETE FROM stories WHERE id = ?').run(manual.id);
    d.prepare('UPDATE stories SET manual_id = ? WHERE id = ?').run(manual.manual_id, match.id);
    reconciled++;
  }

  if (reconciled) console.log(`Reconciled ${reconciled} manual stor${reconciled === 1 ? 'y' : 'ies'} with API data`);
  return reconciled;
}

// Only reconcile genuinely-manual missions (id = manual_id), not API missions
// that received a manual_id tag after a previous reconciliation.
function reconcileManualMissions(d, seedMissions) {
  const manualMissions = d.prepare(
    'SELECT id, story_id, "order", manual_id FROM missions WHERE manual_id IS NOT NULL AND id = manual_id'
  ).all();
  if (!manualMissions.length) return 0;

  let reconciled = 0;
  for (const manual of manualMissions) {
    const match = seedMissions.find(
      m => m.story_id === manual.story_id && m.order === manual.order
    );
    if (!match) continue;

    const realExists = d.prepare('SELECT 1 FROM missions WHERE id = ?').get(match.id);
    if (!realExists) continue;

    d.prepare('UPDATE submissions SET mission_id = ? WHERE mission_id = ?').run(match.id, manual.id);
    d.prepare('DELETE FROM missions WHERE id = ?').run(manual.id);
    d.prepare('UPDATE missions SET manual_id = ? WHERE id = ?').run(manual.manual_id, match.id);
    reconciled++;
  }

  if (reconciled) console.log(`Reconciled ${reconciled} manual mission(s) with API data`);
  return reconciled;
}

function applySeedData(data) {
  console.log(`Importing seed data: ${data.seasons?.length || 0} seasons, ${data.stories?.length || 0} stories, ${data.missions?.length || 0} missions`);

  const d = db.getDb();
  let reconciledStories = 0;
  let reconciledMissions = 0;
  let added = 0;
  let removed = 0;

  const importAll = d.transaction(() => {
    for (const s of data.seasons || []) {
      db.upsertSeason(s.id, s.name, s.order);
    }
    for (const st of data.stories || []) {
      db.upsertStory(st.id, st.season_id, st.name, st.group_name, st.order, st.races);
    }

    const seedMissionIds = new Set((data.missions || []).map(m => m.id));
    const beforeCount = d.prepare('SELECT COUNT(*) AS c FROM missions WHERE manual_id IS NULL').get().c;

    for (const m of data.missions || []) {
      db.upsertMission(m.id, m.story_id, m.name, m.order, m.seed_full_mins, m.seed_speed_mins, m.description, m.canonical_id);
    }

    // Reconcile stories first so mission story_id FKs are correct before mission reconciliation
    reconciledStories = reconcileManualStories(d, data.stories || []);
    reconciledMissions = reconcileManualMissions(d, data.missions || []);

    // Remove API-sourced missions no longer in seed data (e.g. removed placeholders)
    const dbMissions = d.prepare('SELECT id, manual_id FROM missions').all();
    for (const row of dbMissions) {
      if (row.manual_id != null) continue;
      if (seedMissionIds.has(row.id)) continue;
      d.prepare('DELETE FROM submissions WHERE mission_id = ?').run(row.id);
      d.prepare('DELETE FROM missions WHERE id = ?').run(row.id);
      removed++;
    }
    if (removed > 0) console.log(`Removed ${removed} mission(s) no longer in seed data`);

    const afterCount = d.prepare('SELECT COUNT(*) AS c FROM missions WHERE manual_id IS NULL').get().c;
    added = Math.max(0, afterCount - beforeCount + removed);
  });

  importAll();
  console.log('Seed data imported successfully');

  return {
    reconciled_stories: reconciledStories,
    reconciled_missions: reconciledMissions,
    added,
    removed,
    mission_ids: (data.missions || []).map(m => m.id),
  };
}

function importSeedData() {
  if (!fs.existsSync(SEED_PATH)) {
    console.log('No seed-data.json found, skipping seed import');
    return [];
  }

  const data = JSON.parse(fs.readFileSync(SEED_PATH, 'utf-8'));
  const result = applySeedData(data);
  return result.mission_ids;
}

module.exports = { importSeedData, applySeedData, reconcileManualMissions, reconcileManualStories, SEED_PATH };
