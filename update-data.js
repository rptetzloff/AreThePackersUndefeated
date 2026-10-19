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
import { birthDates, birthsToCsv } from './lib/player-births.js';
import { parseCsv, mapNflverseRow, GAME_DAY, rowToCsv, GAMES_HEADER } from './lib/nflverse-games.js';
import { attendanceOf, attendanceToCsv, parseAttendance } from './lib/attendance.js';

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
    await updateBirths();
    await updateAttendance(allGames);
    await updateGameDetails(nflverseRows);
}

// Each past Packers game's crowd (lib/attendance.js), from ESPN's summary,
// for the Stadiums page: only the games the file lacks, eight at a time.
// The season being played is left out; the server reads it from ESPN.
const ATTENDANCE_FILE = './data/packers_attendance.csv';
const ESPN_SUMMARY_URL = (id) => `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${id}`;
async function updateAttendance(allGames) {
    let have = new Map();
    try { have = parseAttendance(readFileSync(ATTENDANCE_FILE, 'utf8')); } catch { /* first run */ }
    const playing = seasonBeingPlayed();
    const want = allGames
        .filter(g => g.espn_id && parseInt(g.season) < playing && !have.has(String(g.espn_id)))
        .map(g => String(g.espn_id));
    if (!want.length) { console.log(`Attendance: all ${have.size} games present`); return; }
    console.log(`Attendance: fetching ${want.length} games from ESPN`);
    // ESPN drops a connection now and then: each game is tried three times,
    // and the file is written after every batch, so a run that fails keeps
    // what it got and the next asks only for the rest.
    const summary = async (id) => {
        for (let attempt = 1; ; attempt++) {
            try { return JSON.parse(await fetchText(ESPN_SUMMARY_URL(id))); }
            catch (err) { if (attempt === 3) throw err; await new Promise(r => setTimeout(r, 1000 * attempt)); }
        }
    };
    for (let i = 0; i < want.length; i += 4) {
        await Promise.all(want.slice(i, i + 4).map(async id => { have.set(id, attendanceOf(await summary(id))); }));
        writeFileSync(ATTENDANCE_FILE, attendanceToCsv(have));
    }
    const none = [...have.values()].filter(n => n === null).length;
    console.log(`Wrote ${ATTENDANCE_FILE} (${have.size} games, ${none} without a crowd from ESPN)`);
}

// Each Packers player's birth date (lib/player-births.js), for the On This
// Day card: everyone in data/packers_player_games.csv. players.csv is every
// player in the league's records, about 7MB.
const PLAYERS_URL = 'https://github.com/nflverse/nflverse-data/releases/download/players/players.csv';
async function updateBirths() {
    const ids = new Set(readFileSync('./data/packers_player_games.csv', 'utf8').split('\n').slice(1)
        .map(line => line.slice(0, line.indexOf(','))).filter(Boolean));
    const births = birthDates((await fetchBuffer(PLAYERS_URL)).toString('utf8'), ids);
    writeFileSync('./data/packers_player_births.csv', birthsToCsv(births));
    console.log(`Wrote data/packers_player_births.csv (${births.size} of ${ids.size} players)`);
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
