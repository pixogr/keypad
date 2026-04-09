// fetch-fixtures.js
// Runs every Sunday 23:00 UTC via GitHub Actions.
// Fetches next-week fixtures for 6 Greek teams from SofaScore API (RapidAPI)
// and saves them to Supabase app_data table.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_KEY;
const RAPIDAPI_KEY  = process.env.RAPIDAPI_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !RAPIDAPI_KEY) {
  console.error('Missing required env vars: SUPABASE_URL, SUPABASE_KEY, RAPIDAPI_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// SofaScore team IDs
const TEAMS = [
  { id: 3250, name: 'ΑΕΚ',           sport: 'football'   },
  { id: 3251, name: 'ΠΑΟΚ',          sport: 'football'   },
  { id: 3245, name: 'ΟΛΥΜΠΙΑΚΟΣ',    sport: 'football'   },
  { id: 3248, name: 'ΠΑΝΑΘΗΝΑΙΚΟΣ',  sport: 'football'   },
  { id: 3508, name: 'ΠΑΝΑΘΗΝΑΙΚΟΣ',  sport: 'basketball' },
  { id: 3501, name: 'ΟΛΥΜΠΙΑΚΟΣ',    sport: 'basketball' },
];

// Format a UTC timestamp as Athens local date/time strings
function athensDateTime(ts) {
  const d = new Date(ts * 1000);
  const opts = { timeZone: 'Europe/Athens' };
  const parts = new Intl.DateTimeFormat('en-CA', {
    ...opts, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(d);
  const get = (t) => parts.find(p => p.type === t)?.value ?? '00';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
  };
}

// Next Monday ISO (when run Sunday night: day=0 → +1 day)
function nextMondayISO() {
  const d = new Date();
  const dow = d.getDay(); // 0=Sun
  d.setDate(d.getDate() + (dow === 0 ? 1 : 8 - dow));
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

async function fetchTeam(teamId) {
  const res = await fetch(
    `https://sportapi7.p.rapidapi.com/api/v1/team/${teamId}/events/next/0`,
    { headers: { 'x-rapidapi-host': 'sportapi7.p.rapidapi.com', 'x-rapidapi-key': RAPIDAPI_KEY } }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status} for team ${teamId}`);
  const data = await res.json();
  return data.events || [];
}

async function main() {
  const monday = nextMondayISO();
  const sunday = (() => { const d = new Date(monday); d.setDate(d.getDate() + 6); return d.toISOString().split('T')[0]; })();
  console.log(`📅 Fetching fixtures for ${monday} – ${sunday}`);

  const seen = new Set();
  const fixtures = [];

  for (const team of TEAMS) {
    console.log(`  Fetching team ${team.name} (${team.id})...`);
    try {
      const events = await fetchTeam(team.id);
      for (const e of events) {
        if (seen.has(e.id)) continue;
        if (!e.startTimestamp) continue;
        const { date, time } = athensDateTime(e.startTimestamp);
        if (date < monday || date > sunday) continue;
        seen.add(e.id);
        fixtures.push({
          id:         e.id,
          sport:      team.sport,
          home:       e.homeTeam?.shortName || e.homeTeam?.name || '?',
          away:       e.awayTeam?.shortName || e.awayTeam?.name || '?',
          date,
          time,
          tournament: e.tournament?.name || '',
        });
      }
    } catch (err) {
      console.warn(`  ⚠️  Failed for team ${team.name}: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 600)); // rate-limit guard
  }

  fixtures.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  console.log(`\n✅ ${fixtures.length} fixture(s) found:`);
  fixtures.forEach(f =>
    console.log(`  ${f.date} ${f.time}  ${f.sport === 'football' ? '⚽' : '🏀'}  ${f.home} vs ${f.away}  (${f.tournament})`)
  );

  const { error } = await supabase
    .from('app_data')
    .upsert(
      { store: 'fixtures', key: monday, value: fixtures, updated_at: new Date().toISOString() },
      { onConflict: 'store,key' }
    );

  if (error) { console.error('Supabase error:', error); process.exit(1); }
  console.log(`\n💾 Saved → fixtures/${monday}`);
}

main().catch(e => { console.error(e); process.exit(1); });
