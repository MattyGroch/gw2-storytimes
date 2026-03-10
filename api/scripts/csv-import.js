const fs = require('fs');
const path = require('path');

const csvPath = process.argv[2] || path.join(__dirname, '..', 'seed-times.csv');
const seedPath = path.join(__dirname, '..', 'seed-data.json');

if (!fs.existsSync(csvPath)) {
  console.error(`CSV file not found: ${csvPath}`);
  console.error('Run "npm run csv:template" first to generate the template.');
  process.exit(1);
}

if (!fs.existsSync(seedPath)) {
  console.error('seed-data.json not found. Run "npm run fetch-missions" first.');
  process.exit(1);
}

const csvContent = fs.readFileSync(csvPath, 'utf-8').trim();
const lines = csvContent.split('\n');
const header = lines[0];

const expectedCols = ['mission_id', 'season', 'story', 'group', 'name', 'full_1', 'full_2', 'full_3', 'speed_1', 'speed_2', 'speed_3'];
const headerCols = parseCsvLine(header);
if (headerCols[0] !== 'mission_id') {
  console.error(`Unexpected header. Expected first column "mission_id", got "${headerCols[0]}"`);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));

const missionMap = {};
for (const m of data.missions) missionMap[m.id] = m;

let updated = 0;
let skipped = 0;

for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;

  const cols = parseCsvLine(line);
  const missionId = parseInt(cols[0], 10);

  if (isNaN(missionId)) {
    console.warn(`  Line ${i + 1}: skipping, invalid mission_id "${cols[0]}"`);
    skipped++;
    continue;
  }

  const mission = missionMap[missionId];
  if (!mission) {
    console.warn(`  Line ${i + 1}: skipping, mission_id ${missionId} not found in seed-data.json`);
    skipped++;
    continue;
  }

  const fullIdx = headerCols.indexOf('full_1');
  const speedIdx = headerCols.indexOf('speed_1');

  const fullValues = parseTimeValues(cols, fullIdx, 3);
  const speedValues = parseTimeValues(cols, speedIdx, 3);

  let changed = false;

  if (fullValues.length > 0) {
    mission.seed_full_mins = Math.round(fullValues.reduce((a, b) => a + b, 0) / fullValues.length);
    changed = true;
  }

  if (speedValues.length > 0) {
    mission.seed_speed_mins = Math.round(speedValues.reduce((a, b) => a + b, 0) / speedValues.length);
    changed = true;
  }

  if (changed) {
    updated++;
  }
}

fs.writeFileSync(seedPath, JSON.stringify(data, null, 2) + '\n');

console.log(`\nCSV import complete:`);
console.log(`  ${updated} missions updated with time data`);
console.log(`  ${skipped} lines skipped`);

const withFull = data.missions.filter(m => m.seed_full_mins != null).length;
const withSpeed = data.missions.filter(m => m.seed_speed_mins != null).length;
console.log(`\nseed-data.json now has:`);
console.log(`  ${withFull} / ${data.missions.length} missions with full experience times`);
console.log(`  ${withSpeed} / ${data.missions.length} missions with speedrun times`);

function parseTimeValues(cols, startIdx, count) {
  const values = [];
  for (let i = 0; i < count; i++) {
    const raw = cols[startIdx + i]?.trim();
    if (raw && raw !== '') {
      const val = parseFloat(raw);
      if (!isNaN(val) && val > 0) values.push(val);
    }
  }
  return values;
}

function parseCsvLine(line) {
  const cols = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        cols.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  cols.push(current);
  return cols;
}
