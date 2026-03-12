const fs = require('fs');
const path = require('path');

const API_BASE = 'https://api.guildwars2.com/v2';

// Placeholder quests that are no longer playable
const EXCLUDED_QUEST_IDS = new Set([587, 600, 602, 606]); // "Calm in the Storm" chapter-gate placeholders

const SEASON_ORDER = [
  'My Story', 'Living World Season 1', 'Living World Season 2',
  'Heart of Thorns', 'Living World Season 3', 'Path of Fire',
  'Living World Season 4', 'The Icebrood Saga', 'End of Dragons',
  'Secrets of the Obscure', 'Janthir Wilds', 'Visions of Eternity',
];

const SEASON_GROUPS = {
  '215AAA0F-CDAC-4F93-86DA-C155A99B5784': [
    { label: 'Ch. 1-3', count: 1 },
    { label: 'Ch. 4-6', count: 1 },
    { label: 'Ch. 7-8', count: 1 },
  ],
  'A49D0CD7-E725-4141-8E10-180F1CED7CAF': [
    { label: 'Ep. 1', count: 1 }, { label: 'Ep. 2', count: 1 },
    { label: 'Ep. 3', count: 1 }, { label: 'Ep. 4', count: 1 },
    { label: 'Ep. 5', count: 1 },
  ],
  'A515A1D3-4BD7-4594-AE30-2C5D05FF5960': [
    { label: 'Ep. 1', count: 1 }, { label: 'Ep. 2', count: 1 },
    { label: 'Ep. 3', count: 1 }, { label: 'Ep. 4', count: 1 },
    { label: 'Ep. 5', count: 1 }, { label: 'Ep. 6', count: 1 },
    { label: 'Ep. 7', count: 1 }, { label: 'Ep. 8', count: 1 },
  ],
  'B8901E58-DC9D-4525-ADB2-79C93593291E': [
    { label: 'Act 1', count: 6 }, { label: 'Act 2', count: 4 },
    { label: 'Act 3', count: 4 }, { label: 'Act 4', count: 2 },
  ],
  '09766A86-D88D-4DF2-9385-259E9A8CA583': [
    { label: 'Ep. 1', count: 1 }, { label: 'Ep. 2', count: 1 },
    { label: 'Ep. 3', count: 1 }, { label: 'Ep. 4', count: 1 },
    { label: 'Ep. 5', count: 1 }, { label: 'Ep. 6', count: 1 },
  ],
  'EAB597C0-C484-4FD3-9430-31433BAC81B6': [
    { label: 'Act 1', count: 4 }, { label: 'Act 2', count: 4 },
    { label: 'Act 3', count: 5 },
  ],
  'C22AFD21-667A-4AA8-8210-AC74EAEE58BB': [
    { label: 'Ep. 1', count: 1 }, { label: 'Ep. 2', count: 1 },
    { label: 'Ep. 3', count: 1 }, { label: 'Ep. 4', count: 1 },
    { label: 'Ep. 5', count: 1 }, { label: 'Ep. 6', count: 1 },
  ],
  'EDCAE800-302A-4D9B-8331-3CC769ADA0B3': [
    { label: 'Prologue', count: 1 }, { label: 'Ep. 1', count: 1 },
    { label: 'Ep. 2', count: 1 }, { label: 'Visions', count: 1 },
    { label: 'Ep. 3', count: 1 }, { label: 'Ep. 4', count: 1 },
    { label: 'Ep. 5', count: 1 },
  ],
  'D1B709AB-92B6-4EE9-8B40-2B7C628E5022': [
    { label: 'Act 1', count: 5 }, { label: 'Act 2', count: 3 },
    { label: 'Act 3', count: 3 }, { label: 'Act 4', count: 2 },
    { label: 'Act 5', count: 3 },
  ],
  'AEE99452-D323-4ABB-8F49-D7C0A752CBD1': [
    { label: 'Act 1', count: 4 }, { label: 'Act 2', count: 4 },
    { label: 'Act 3', count: 3 },
  ],
  '5EFFBB71-7C6D-4594-A87D-88B8CF38FDA3': [
    { label: 'Act 1', count: 6 }, { label: 'Act 2', count: 5 },
  ],
  '5F35F25C-AE33-4D92-A061-227CE54FA5DC': [
    { label: 'Act 1', count: 5 }, { label: 'Act 2', count: 4 },
  ],
};

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json();
}

async function fetchAllById(endpoint) {
  const items = await fetchJson(`${API_BASE}/${endpoint}?ids=all`);
  const map = {};
  for (const item of items) map[item.id] = item;
  return map;
}

function assignGroup(seasonId, positionIndex) {
  const groups = SEASON_GROUPS[seasonId];
  if (!groups) return null;

  let cumulative = 0;
  for (const group of groups) {
    cumulative += group.count;
    if (positionIndex < cumulative) return group.label;
  }
  return groups[groups.length - 1]?.label || null;
}

async function main() {
  console.log('Fetching seasons from GW2 API...');
  const apiSeasons = await fetchJson(`${API_BASE}/stories/seasons?ids=all`);

  const allStoryIds = new Set();
  const knownSeasons = [];
  for (const s of apiSeasons) {
    if (SEASON_ORDER.includes(s.name)) {
      knownSeasons.push(s);
      for (const id of s.stories || []) allStoryIds.add(id);
    } else {
      console.log(`  Skipping unknown season: "${s.name}"`);
    }
  }

  console.log(`Fetching ${allStoryIds.size} stories from GW2 API...`);
  const storyIds = [...allStoryIds];
  const storiesById = {};
  for (let i = 0; i < storyIds.length; i += 200) {
    const batch = storyIds.slice(i, i + 200);
    const stories = await fetchJson(`${API_BASE}/stories?ids=${batch.join(',')}`);
    for (const story of stories) storiesById[story.id] = story;
  }

  console.log('Fetching all quests from GW2 API...');
  const questsById = await fetchAllById('quests');
  const questCount = Object.keys(questsById).length;
  console.log(`  Fetched ${questCount} quests`);

  // Build quest-to-story lookup
  const questsByStory = {};
  for (const quest of Object.values(questsById)) {
    if (quest.story != null) {
      if (!questsByStory[quest.story]) questsByStory[quest.story] = [];
      questsByStory[quest.story].push(quest);
    }
  }

  const seasons = [];
  const stories = [];
  const missions = [];

  knownSeasons.sort((a, b) => SEASON_ORDER.indexOf(a.name) - SEASON_ORDER.indexOf(b.name));

  for (const apiSeason of knownSeasons) {
    const orderIndex = SEASON_ORDER.indexOf(apiSeason.name);

    seasons.push({
      id: apiSeason.id,
      name: apiSeason.name,
      order: orderIndex + 1,
    });

    const seasonStories = (apiSeason.stories || [])
      .map(id => storiesById[id])
      .filter(Boolean)
      .sort((a, b) => (a.order || 0) - (b.order || 0));

    const uniqueOrders = [...new Set(seasonStories.map(s => s.order ?? 0))].sort((a, b) => a - b);
    const orderToPosition = {};
    uniqueOrders.forEach((o, i) => { orderToPosition[o] = i; });

    let storyOrder = 0;
    for (const story of seasonStories) {
      storyOrder++;
      const races = story.races?.length ? story.races : null;
      let storyName = story.name;
      if (races && races.length === 1) {
        storyName = `${story.name} (${races[0]})`;
      }

      const positionIndex = orderToPosition[story.order ?? 0];

      stories.push({
        id: story.id,
        season_id: apiSeason.id,
        name: storyName,
        group_name: assignGroup(apiSeason.id, positionIndex),
        order: storyOrder,
        races,
      });

      const storyQuests = (questsByStory[story.id] || [])
        .filter(q => !EXCLUDED_QUEST_IDS.has(q.id))
        .sort((a, b) => a.id - b.id);

      if (storyQuests.length === 0) {
        console.log(`  Warning: no quests found for story ${story.id} "${storyName}"`);
      }

      for (let qi = 0; qi < storyQuests.length; qi++) {
        const quest = storyQuests[qi];
        missions.push({
          id: quest.id,
          story_id: story.id,
          name: quest.name,
          order: qi + 1,
          seed_full_mins: null,
          seed_speed_mins: null,
        });
      }
    }
  }

  seasons.sort((a, b) => a.order - b.order);

  // Disambiguate duplicate mission names within the same story.
  // Pairs (count == 2) are sequential parts -- rename to (Part 1), (Part 2).
  // Larger groups (3+) are race variants -- assign canonical_id (lowest ID) to all aliases.
  const byStory = {};
  for (const m of missions) {
    if (!byStory[m.story_id]) byStory[m.story_id] = [];
    byStory[m.story_id].push(m);
  }
  let dupeCount = 0;
  let canonicalCount = 0;
  for (const storyMissions of Object.values(byStory)) {
    const nameCounts = {};
    for (const m of storyMissions) {
      nameCounts[m.name] = (nameCounts[m.name] || 0) + 1;
    }
    for (const [name, count] of Object.entries(nameCounts)) {
      if (count === 2) {
        let part = 0;
        for (const m of storyMissions) {
          if (m.name === name) {
            part++;
            m.name = `${name} (Part ${part})`;
            dupeCount++;
          }
        }
      } else if (count >= 3) {
        const group = storyMissions.filter(m => m.name === name).sort((a, b) => a.id - b.id);
        const canonicalId = group[0].id;
        for (const m of group) {
          if (m.id !== canonicalId) {
            m.canonical_id = canonicalId;
            canonicalCount++;
          }
        }
      }
    }
  }
  if (dupeCount > 0) console.log(`  Disambiguated ${dupeCount} duplicate mission names`);
  if (canonicalCount > 0) console.log(`  Assigned canonical_id to ${canonicalCount} race-variant missions`);

  // Preserve existing seed data (manually-corrected orders and time estimates)
  const outputPath = path.join(__dirname, '..', 'seed-data.json');
  let existingMissionData = {};
  if (fs.existsSync(outputPath)) {
    const existing = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    for (const m of existing.missions || []) {
      existingMissionData[m.id] = {
        order: m.order,
        seed_full_mins: m.seed_full_mins,
        seed_speed_mins: m.seed_speed_mins,
        canonical_id: m.canonical_id,
      };
    }
    console.log(`Preserving data for ${Object.keys(existingMissionData).length} existing missions (orders + times)`);
  }

  for (const m of missions) {
    const prev = existingMissionData[m.id];
    if (prev) {
      if (prev.order != null) m.order = prev.order;
      if (prev.seed_full_mins != null) m.seed_full_mins = prev.seed_full_mins;
      if (prev.seed_speed_mins != null) m.seed_speed_mins = prev.seed_speed_mins;
      if (!m.canonical_id && prev.canonical_id != null) m.canonical_id = prev.canonical_id;
    }
  }

  const output = { seasons, stories, missions };
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n');

  console.log(`\nWrote to seed-data.json:`);
  console.log(`  ${seasons.length} seasons`);
  console.log(`  ${stories.length} stories`);
  console.log(`  ${missions.length} missions (quests)`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
