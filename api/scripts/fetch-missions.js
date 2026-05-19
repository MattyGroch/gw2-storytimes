const fs = require('fs');
const path = require('path');
const { fetchMissionsFromAPI } = require('../src/lib/gw2-fetch');

const OUTPUT_PATH = path.join(__dirname, '..', 'seed-data.json');

async function main() {
  const existingSeedData = fs.existsSync(OUTPUT_PATH)
    ? JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf-8'))
    : {};

  const result = await fetchMissionsFromAPI(existingSeedData);

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2) + '\n');

  console.log(`\nWrote to seed-data.json:`);
  console.log(`  ${result.seasons.length} seasons`);
  console.log(`  ${result.stories.length} stories`);
  console.log(`  ${result.missions.length} missions (quests)`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
