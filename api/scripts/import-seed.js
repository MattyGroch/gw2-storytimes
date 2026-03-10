const fs = require('fs');
const path = require('path');
const db = require('../src/db');

const seedPath = process.argv[2] || path.join(__dirname, '..', 'seed-data.json');

if (!fs.existsSync(seedPath)) {
  console.error(`Seed file not found: ${seedPath}`);
  console.error('Run "npm run fetch-missions" first to generate it.');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));

console.log(`Importing from ${seedPath}`);
console.log(`  Seasons: ${data.seasons?.length || 0}`);
console.log(`  Stories: ${data.stories?.length || 0}`);
console.log(`  Missions: ${data.missions?.length || 0}`);

const d = db.getDb();

const importAll = d.transaction(() => {
  for (const s of data.seasons || []) {
    db.upsertSeason(s.id, s.name, s.order);
  }
  for (const st of data.stories || []) {
    db.upsertStory(st.id, st.season_id, st.name, st.group_name, st.order, st.races);
  }
  for (const m of data.missions || []) {
    db.upsertMission(m.id, m.story_id, m.name, m.order, m.seed_full_mins, m.seed_speed_mins);
  }
});

importAll();

const seasonCount = d.prepare('SELECT COUNT(*) AS c FROM seasons').get().c;
const storyCount = d.prepare('SELECT COUNT(*) AS c FROM stories').get().c;
const missionCount = d.prepare('SELECT COUNT(*) AS c FROM missions').get().c;
const withFull = d.prepare('SELECT COUNT(*) AS c FROM missions WHERE seed_full_mins IS NOT NULL').get().c;
const withSpeed = d.prepare('SELECT COUNT(*) AS c FROM missions WHERE seed_speed_mins IS NOT NULL').get().c;

console.log(`\nDatabase now contains:`);
console.log(`  ${seasonCount} seasons`);
console.log(`  ${storyCount} stories`);
console.log(`  ${missionCount} missions (${withFull} with full times, ${withSpeed} with speed times)`);
