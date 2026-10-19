#!/usr/bin/env node
/**
 * Fetches current Green Bay Packers game data from nflverse-data (CC-BY-4.0)
 * and merges it with the pre-1999 FiveThirtyEight base data to produce:
 *   data/packers_games.csv       — game-by-game results
 *   data/packers_season_records.csv — per-season win/loss/tie totals
 *
 * Run manually or as a pre-build step to refresh data during the live season.
 *
 * Data sources:
 *   1921–1998: FiveThirtyEight nfl-elo-game dataset (MIT License)
 *   1999–present: nflverse-data schedules (CC-BY-4.0, nflverse.com)
 */

import { createWriteStream, readFileSync, writeFileSync } from 'fs';
import https from 'https';
import { gunzipSync } from 'zlib';
import { splitCsvLine, seasonBeingPlayed } from './records-core.js';
import { gameDetails, addsUp, PBP_COLUMNS } from './lib/game-details.js';
import { packersPlayerRows, playerRowsToCsv } from './lib/player-stats.js';

const NFLVERSE_URL =
    'https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv';

function fetchText(url) {
    return fetchBuffer(url).then(b => b.toString('utf8'));
}

function fetchBuffer(url) {
    return new Promise((resolve, reject) => {
        const follow = (u) => {
            https.get(u, { headers: { 'User-Agent': 'packers-data-updater/1.0' } }, res => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    follow(res.headers.location);
                    return;
                }
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode} for ${u}`));
                    return;
                }
                const chunks = [];
                res.on('data', d => chunks.push(d));
                res.on('end', () => resolve(Buffer.concat(chunks)));
                res.on('error', reject);
            }).on('error', reject);
        };
        follow(url);
    });
}

// Quoted fields are real in games.csv (99 rows carry "" for an empty roof
// or surface), so lines split with the site's own CSV splitter rather than
// on every comma, which kept the two quote characters as the value.
function parseCsv(raw) {
    const lines = raw.trim().split('\n');
    const headers = splitCsvLine(lines[0]);
    return lines.slice(1).map(line => {
        const vals = splitCsvLine(line);
        const obj = {};
        headers.forEach((h, i) => { obj[h.trim()] = (vals[i] ?? '').trim(); });
        return obj;
    });
}

const NFL_TEAM_NAMES = {
    ARI: 'Arizona Cardinals',
    ATL: 'Atlanta Falcons',
    BAL: 'Baltimore Ravens',
    BUF: 'Buffalo Bills',
    CAR: 'Carolina Panthers',
    CHI: 'Chicago Bears',
    CIN: 'Cincinnati Bengals',
    CLE: 'Cleveland Browns',
    DAL: 'Dallas Cowboys',
    DEN: 'Denver Broncos',
    DET: 'Detroit Lions',
    GB:  'Green Bay Packers',
    HOU: 'Houston Texans',
    IND: 'Indianapolis Colts',
    JAC: 'Jacksonville Jaguars',
    JAX: 'Jacksonville Jaguars',
    KC:  'Kansas City Chiefs',
    LA:  'Los Angeles Rams',
    LAC: 'Los Angeles Chargers',
    LAR: 'Los Angeles Rams',
    LV:  'Las Vegas Raiders',
    MIA: 'Miami Dolphins',
    MIN: 'Minnesota Vikings',
    NE:  'New England Patriots',
    NO:  'New Orleans Saints',
    NYG: 'New York Giants',
    NYJ: 'New York Jets',
    OAK: 'Oakland Raiders',
    PHI: 'Philadelphia Eagles',
    PIT: 'Pittsburgh Steelers',
    SD:  'San Diego Chargers',
    SEA: 'Seattle Seahawks',
    SF:  'San Francisco 49ers',
    STL: 'St. Louis Rams',
    TB:  'Tampa Bay Buccaneers',
    TEN: 'Tennessee Titans',
    WAS: 'Washington Commanders',
    WSH: 'Washington Commanders',
};

// Map a nflverse games.csv row to our internal format
function mapNflverseRow(r) {
    const season = parseInt(r.season);
    const isAway = r.away_team === 'GB';
    const isHome = r.home_team === 'GB';
    if (!isAway && !isHome) return null;

    // Only include completed games (both scores present)
    const awayScore = r.away_score === '' ? null : parseInt(r.away_score);
    const homeScore = r.home_score === '' ? null : parseInt(r.home_score);
    if (awayScore === null || homeScore === null) return null;

    const packersScore = isHome ? homeScore : awayScore;
    const oppScore = isHome ? awayScore : homeScore;
    const oppAbbr = isHome ? r.away_team : r.home_team;
    const oppTeam = NFL_TEAM_NAMES[oppAbbr] ?? oppAbbr;

    const result = packersScore > oppScore ? 'WIN' : packersScore < oppScore ? 'LOSS' : 'TIE';

    // game_type: REG = regular season; WC/DIV/CON/SB = playoffs
    const isPlayoff = !['REG'].includes(r.game_type);
    const isRegular = r.game_type === 'REG';
    const isSuperBowl = r.game_type === 'SB';

    // location from nflverse: "Home"/"Away"/"Neutral" is in r.location (relative to home_team)
    // We need it relative to GB
    let location;
    if (r.location === 'Neutral') {
        location = 'NEUTRAL';
    } else if (isHome) {
        location = 'HOME';
    } else {
        location = 'AWAY';
    }

    return {
        date: r.gameday,
        season,
        regular_season: isRegular ? 1 : 0,
        playoff: isPlayoff ? 1 : 0,
        superbowl: isSuperBowl ? r.game_type : '',
        Opponent: oppTeam,
        'Packers Win': result,
        packers_score: packersScore,
        opponent_score: oppScore,
        location,
        // ESPN's id for the game, for its box score page, and the game-day
        // details ESPN's summary does not carry. nflverse has these for every
        // game it lists, 1999 on; earlier rows leave them empty.
        espn_id: clean(r.espn),
        stadium: clean(r.stadium),
        roof: clean(r.roof),
        surface: clean(r.surface),
        temp: clean(r.temp),
        wind: clean(r.wind),
        referee: clean(r.referee),
    };
}

// nflverse writes a missing value as NA or an empty string.
function clean(v) {
    const t = String(v ?? '').trim();
    return t === 'NA' ? '' : t;
}

// The columns a kept row takes from nflverse on every run. A row that
// already has its result is otherwise left alone (see main), which would
// leave every game played before these columns existed without them.
const GAME_DAY = ['espn_id', 'stadium', 'roof', 'surface', 'temp', 'wind', 'referee'];

function buildSeasonRecords(games) {
    const seasons = {};
    games.forEach(g => {
        const yr = parseInt(g.season);
        if (!seasons[yr]) seasons[yr] = { season: yr, reg_w: 0, reg_l: 0, reg_t: 0, post_w: 0, post_l: 0, post_t: 0 };
        const s = seasons[yr];
        const result = g['Packers Win'];
        if (String(g.regular_season) === '1') {
            if (result === 'WIN') s.reg_w++;
            else if (result === 'LOSS') s.reg_l++;
            else if (result === 'TIE') s.reg_t++;
        } else if (String(g.playoff) === '1') {
            if (result === 'WIN') s.post_w++;
            else if (result === 'LOSS') s.post_l++;
            else if (result === 'TIE') s.post_t++;
        }
    });
    return Object.values(seasons).sort((a, b) => a.season - b.season);
}

// A field with a comma or a quote is quoted, as CSV has it; a stadium or a
// referee's name could carry either.
function csvField(v) {
    const t = String(v ?? '');
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

function rowToCsv(r) {
    return [
        r.date, r.season, r.regular_season, r.playoff, r.superbowl,
        r.Opponent, r['Packers Win'], r.packers_score, r.opponent_score, r.location,
        ...GAME_DAY.map(k => r[k] ?? ''),
    ].map(csvField).join(',');
}

const GAMES_HEADER = ['date,season,regular_season,playoff,superbowl,Opponent,Packers Win,packers_score,opponent_score,location', ...GAME_DAY].join(',');
const RECORDS_HEADER = 'season,reg_w,reg_l,reg_t,post_w,post_l,post_t';

async function main() {
    console.log('Fetching nflverse schedules (CC-BY-4.0)...');
    const nflverseRaw = await fetchText(NFLVERSE_URL);
    console.log(`Downloaded ${nflverseRaw.length} bytes`);

    const nflverseRows = parseCsv(nflverseRaw);
    const incomingGames = nflverseRows
        .map(mapNflverseRow)
        .filter(r => r !== null && r.season >= 1999);

    console.log(`Mapped ${incomingGames.length} GB games (1999–present) from nflverse`);

    // Load all existing games
    const baseRaw = readFileSync('./data/packers_games.csv', 'utf8');
    const existingGames = parseCsv(baseRaw);
    const pre1999 = existingGames.filter(g => parseInt(g.season) < 1999);
    console.log(`Loaded ${pre1999.length} base games (pre-1999, FiveThirtyEight)`);

    // Build a lookup of existing 1999+ rows keyed by date+opponent
    const existingMap = new Map();
    existingGames
        .filter(g => parseInt(g.season) >= 1999)
        .forEach(g => existingMap.set(`${g.date}|${g.Opponent}`, g));

    // Upsert: keep existing row if it already has a score, otherwise use incoming
    let kept = 0, updated = 0;
    const merged1999 = incomingGames.map(incoming => {
        const key = `${incoming.date}|${incoming.Opponent}`;
        const existing = existingMap.get(key);
        if (existing && existing['Packers Win'] !== '') {
            kept++;
            // Its result stays as it was; its game-day columns are refreshed.
            const gameDay = Object.fromEntries(GAME_DAY.map(k => [k, incoming[k]]));
            return { ...existing, ...gameDay };
        }
        updated++;
        return incoming;
    });

    console.log(`Upsert: ${kept} rows kept from CSV, ${updated} rows updated from nflverse`);

    const allGames = [...pre1999, ...merged1999].sort((a, b) => {
        if (a.season !== b.season) return a.season - b.season;
        return new Date(a.date) - new Date(b.date);
    });

    // Write games CSV
    const gamesLines = [GAMES_HEADER, ...allGames.map(rowToCsv)].join('\n');
    writeFileSync('./data/packers_games.csv', gamesLines + '\n');
    console.log(`Wrote data/packers_games.csv (${allGames.length} games)`);

    // Write season records CSV
    const records = buildSeasonRecords(allGames);
    const recordsLines = [RECORDS_HEADER, ...records.map(r =>
        `${r.season},${r.reg_w},${r.reg_l},${r.reg_t},${r.post_w},${r.post_l},${r.post_t}`
    )].join('\n');
    writeFileSync('./data/packers_season_records.csv', recordsLines + '\n');
    console.log(`Wrote data/packers_season_records.csv (${records.length} seasons)`);

    // Report latest season in data
    const maxSeason = Math.max(...allGames.map(g => parseInt(g.season)));
    const maxSeasonGames = allGames.filter(g => parseInt(g.season) === maxSeason);
    const completed = maxSeasonGames.filter(g => g['Packers Win'] !== '');
    console.log(`Latest season: ${maxSeason} (${completed.length} completed games)`);

    await updatePlayerGames(maxSeason);
    await updateGameDetails(nflverseRows);
}

// Each past Packers game's quarters, scoring plays and drives, from
// nflverse's play-by-play (lib/game-details.js), for the box score sections
// ESPN's older records lack. A season's file is 12-18MB gzipped, every team's
// plays, so only seasons with a Packers game not yet in the file are
// fetched: a finished game's play-by-play does not change, and fetching all
// 28 seasons every run would be 400MB a week for the check workflow. The
// season being played is left out; its box scores come from ESPN whole.
const PBP_URL = (season) =>
    `https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_${season}.csv.gz`;
const DETAILS_FILE = './data/packers_game_details.json';

async function updateGameDetails(nflverseRows) {
    let details = {};
    try { details = JSON.parse(readFileSync(DETAILS_FILE, 'utf8')); } catch { /* first run */ }
    const playing = seasonBeingPlayed();
    // nflverse game_id -> ESPN id, for every finished Packers game before
    // the season being played.
    const wanted = new Map();
    for (const r of nflverseRows) {
        if (r.home_team !== 'GB' && r.away_team !== 'GB') continue;
        if (!r.espn || r.espn === 'NA' || r.home_score === '' || r.home_score === 'NA') continue;
        if (Number(r.season) >= playing) continue;
        wanted.set(r.game_id, { espn: r.espn, season: Number(r.season), away: r.away_score, home: r.home_score });
    }
    const seasons = [...new Set([...wanted.values()].filter(g => !details[g.espn]).map(g => g.season))].sort((a, b) => a - b);
    if (!seasons.length) {
        console.log(`Game details: all ${wanted.size} games present`);
        return;
    }
    for (const season of seasons) {
        const text = gunzipSync(await fetchBuffer(PBP_URL(season))).toString('utf8');
        const lines = text.split('\n');
        const head = splitCsvLine(lines[0]);
        const at = PBP_COLUMNS.map(c => head.indexOf(c));
        if (at.includes(-1)) throw new Error(`play_by_play_${season} is missing ${PBP_COLUMNS.filter((c, i) => at[i] < 0).join(', ')}`);
        const byGame = new Map();
        for (const line of lines.slice(1)) {
            if (!line.includes('GB')) continue; // most lines are other games
            const v = splitCsvLine(line);
            const id = v[at[0]];
            if (!wanted.has(id)) continue;
            const play = Object.fromEntries(PBP_COLUMNS.map((c, i) => [c, v[at[i]] === 'NA' ? '' : (v[at[i]] ?? '')]));
            (byGame.get(id) || byGame.set(id, []).get(id)).push(play);
        }
        for (const [id, plays] of byGame) {
            const d = gameDetails(plays);
            const g = wanted.get(id);
            // Kept only if it adds up to the final score nflverse itself has
            // for the game; one that does not is wrong somewhere, and the
            // box score keeps ESPN's record instead.
            if (d && addsUp(d, g.away, g.home)) details[g.espn] = { season, ...d };
            else console.log(`  ${id}: play-by-play does not add up to ${g.away}-${g.home}; left out`);
        }
        console.log(`Game details ${season}: ${byGame.size} games`);
    }
    // One game a line, by id, so a regenerated file diffs by the games
    // that changed.
    const ids = Object.keys(details).sort();
    writeFileSync(DETAILS_FILE, `{\n${ids.map(id => `${JSON.stringify(id)}: ${JSON.stringify(details[id])}`).join(',\n')}\n}\n`);
    console.log(`Wrote ${DETAILS_FILE} (${ids.length} games)`);
}

// Every Packers player's stats, game by game, 1999 on, from nflverse's
// stats_player_week (CC BY 4.0): one gzipped file a season. Before 1999
// nflverse has none, and no source this site can use has any.
const PLAYER_STATS_URL = (season) =>
    `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv.gz`;

async function updatePlayerGames(lastSeason) {
    const rows = [];
    for (let season = 1999; season <= lastSeason; season++) {
        let text;
        try {
            text = gunzipSync(await fetchBuffer(PLAYER_STATS_URL(season))).toString('utf8');
        } catch (err) {
            // The season being played may not be published yet; an earlier
            // one missing is an error.
            if (season === lastSeason) { console.log(`No player stats yet for ${season}`); break; }
            throw err;
        }
        const seasonRows = packersPlayerRows(text);
        rows.push(...seasonRows);
        console.log(`Player stats ${season}: ${seasonRows.length} rows`);
    }
    writeFileSync('./data/packers_player_games.csv', playerRowsToCsv(rows));
    console.log(`Wrote data/packers_player_games.csv (${rows.length} player-games)`);
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
