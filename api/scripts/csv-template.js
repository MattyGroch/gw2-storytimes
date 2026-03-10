const fs = require('fs');
const path = require('path');

const seedPath = path.join(__dirname, '..', 'seed-data.json');
const outputPath = process.argv[2] || path.join(__dirname, '..', 'seed-times.csv');

if (!fs.existsSync(seedPath)) {
  console.error('seed-data.json not found. Run "npm run fetch-missions" first.');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));

const seasonMap = {};
for (const s of data.seasons) seasonMap[s.id] = s;

const storyMap = {};
for (const st of data.stories) storyMap[st.id] = st;

const rows = ['mission_id,season,story,group,name,full_1,full_2,full_3,speed_1,speed_2,speed_3'];

for (const m of data.missions) {
  const story = storyMap[m.story_id];
  const season = story ? seasonMap[story.season_id] : null;

  const seasonName = season?.name || '';
  const storyName = story?.name || '';
  const groupName = story?.group_name || '';
  const missionName = m.name;

  const full1 = m.seed_full_mins != null ? m.seed_full_mins : '';
  const full2 = '';
  const full3 = '';
  const speed1 = m.seed_speed_mins != null ? m.seed_speed_mins : '';
  const speed2 = '';
  const speed3 = '';

  rows.push([
    m.id,
    csvEscape(seasonName),
    csvEscape(storyName),
    csvEscape(groupName),
    csvEscape(missionName),
    full1, full2, full3,
    speed1, speed2, speed3,
  ].join(','));
}

function csvEscape(str) {
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

fs.writeFileSync(outputPath, rows.join('\n') + '\n');
console.log(`Wrote ${data.missions.length} missions to ${outputPath}`);
console.log('Fill in full_1/2/3 and speed_1/2/3 columns with time estimates in minutes.');
