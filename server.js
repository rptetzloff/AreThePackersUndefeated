// Minimal web service for arethepackersundefeated.com
// - serves the static site
// - injects per-URL Open Graph / Twitter meta so shared links preview correctly
// - renders per-season social cards at /og/:season.png
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';
import { renderPng, renderRecordsPng, renderH2hPng, renderHistoryPng, renderCoachesPng } from './lib/cards.js';
import { originOf } from './lib/origin.js';
import { getSeasonState, defaultSeason, allGames } from './lib/seasons.js';
import { recordsMeta, isRecordSlug, historyMeta } from './lib/records.js';
import { coachesMeta } from './lib/coaches.js';
import { h2hMeta, isOpponentSlug } from './lib/h2h.js';
import { derive } from './lib/derived.js';
import { currentSeasonRows, rowsToCsv } from './lib/current-season.js';
import { packersPlayerRows, parsePlayerGames } from './lib/player-stats.js';
import { birthDates, parseBirths } from './lib/player-births.js';
import { parseCsv as parseNflverseCsv, mapNflverseRow, rowToCsv, GAMES_HEADER } from './lib/nflverse-games.js';
import { attendanceOf, parseAttendance } from './lib/attendance.js';
import { stadiumStats } from './stadiums-core.js';
import { splitStats, starterRecord } from './splits-core.js';
import { CATEGORIES, seasonTables, seasonsOf, leaders, playerSummary, gameLog, playerIndex, bornOn, PLAYER_ID } from './stats-core.js';
import { esc, parseGames, poolCurrentSeason, seasonBeingPlayed } from './records-core.js';
import { espnTarget } from './lib/espn-target.js';
import { createEspnCache, browserMaxAge } from './lib/espn-proxy.js';
import { espnBoxscore, withGameDay, withDetails } from './lib/espn-box.js';

// The games CSV's rows by ESPN id, for each past game's game-day details.
const gameByEspnId = new Map(allGames.filter((g) => g.espnId).map((g) => [g.espnId, g]));
import { staticCacheControl } from './lib/static-cache.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;

// Each past game's quarters, scoring plays and drives from nflverse's
// play-by-play, for the sections ESPN's older records lack (lib/game-details.js).
const gameDetailsById = JSON.parse(readFileSync(join(ROOT, 'data', 'packers_game_details.json'), 'utf8'));

const PORT = process.env.PORT || 3000;

// Stamp a short content hash onto local asset refs so a new deploy busts the
// browser cache automatically (main.js?v=<hash>). Change the file -> new hash.
// Files do not change while the server runs, so each is hashed once: the
// static handler asks on every versioned request (lib/static-cache.js).
const assetVersions = new Map();
function assetVersion(file) {
  if (!assetVersions.has(file)) {
    let v = null;
    try { v = createHash('sha1').update(readFileSync(join(ROOT, file))).digest('hex').slice(0, 8); }
    catch { /* not a file */ }
    assetVersions.set(file, v);
  }
  return assetVersions.get(file);
}

// Load an HTML shell: strip any hardcoded <title>/description/OG/Twitter/
// canonical tags so the server is the single source of truth and pages never
// ship duplicate, conflicting meta (a static og:url will otherwise override
// per-URL tags), then version the given local assets (relative or /-rooted).
function loadShell(file, assets) {
  const raw = readFileSync(join(ROOT, file), 'utf8');
  const stripped = [
    /<title>[\s\S]*?<\/title>\s*/i,
    /<meta[^>]*\b(?:property=["']og:[^"']*["']|name=["']twitter:[^"']*["']|name=["']description["'])[^>]*>\s*/gi,
    /<link[^>]*\brel=["']canonical["'][^>]*>\s*/gi,
  ].reduce((html, re) => html.replace(re, ''), raw);
  return assets.reduce((html, asset) => {
    const v = assetVersion(asset);
    if (!v) return html;
    for (const attr of ['src', 'href']) {
      html = html
        .replace(`${attr}="${asset}"`, `${attr}="${asset}?v=${v}"`)
        .replace(`${attr}="/${asset}"`, `${attr}="/${asset}?v=${v}"`);
    }
    return html;
  }, stripped);
}
const INDEX_VERSIONED = loadShell('index.html', ['main.js', 'styles.css', 'theme.js']);
const RECORDS_VERSIONED = loadShell('records.html', ['records.js', 'styles.css', 'theme.js']);
const VS_VERSIONED = loadShell('vs.html', ['vs.js', 'styles.css', 'theme.js']);
const HISTORY_VERSIONED = loadShell('history.html', ['history.js', 'styles.css', 'theme.js']);
const COACHES_VERSIONED = loadShell('coaches.html', ['coaches.js', 'styles.css', 'theme.js']);
const GAME_VERSIONED = loadShell('game.html', ['game.js', 'styles.css', 'theme.js']);
const STATS_VERSIONED = loadShell('stats.html', ['stats.js', 'styles.css', 'theme.js']);
const PLAYER_VERSIONED = loadShell('player.html', ['player.js', 'styles.css', 'theme.js']);
const STADIUMS_VERSIONED = loadShell('stadiums.html', ['stadiums.js', 'styles.css', 'theme.js']);
const SPLITS_VERSIONED = loadShell('splits.html', ['splits.js', 'styles.css', 'theme.js']);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8',
};

function copy(state) {
  const s = state.season;
  const past = s < defaultSeason();
  const are = past ? 'finished' : 'are';
  switch (state.kind) {
    case 'undefeated':
      return { title: `Are the Packers Undefeated? YES — ${state.record} (${s})`,
        desc: `The ${s} Green Bay Packers ${past ? 'finished' : 'are'} UNDEFEATED at ${state.record}.` };
    case 'champions':
      return { title: `${s} Green Bay Packers — Super Bowl Champions`,
        desc: `The ${s} Green Bay Packers won ${state.superBowlName || 'the Super Bowl'}.` };
    case 'offseason':
      return { title: `Are the Packers Undefeated? — ${s} offseason`,
        desc: `The ${s} season hasn't started yet. Undefeated for now!` };
    case 'no':
      return { title: `Are the Packers Undefeated? NO — ${state.record} (${s})`,
        desc: `The ${s} Green Bay Packers ${are} ${state.record}.` };
    default:
      return { title: 'Are the Packers Undefeated?',
        desc: 'The only question that matters: are the Green Bay Packers undefeated this season?' };
  }
}

function metaBlock({ title, desc, img, canonical }) {
  return `
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(desc)}">
    <link rel="canonical" href="${esc(canonical)}">
    <meta property="og:title" content="${esc(title)}">
    <meta property="og:description" content="${esc(desc)}">
    <meta property="og:image" content="${esc(img)}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:url" content="${esc(canonical)}">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Are the Packers Undefeated?">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${esc(title)}">
    <meta name="twitter:description" content="${esc(desc)}">
    <meta name="twitter:image" content="${esc(img)}">`;
}



// no-store: a 404 is often a file this server does not have yet. In the
// 18 October release the old server, asked for the new theme.js, answered
// 404 with no Cache-Control, and Cloudflare cached the "Not found" under
// the new URL, so production had no theme button until it was purged.
function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end('Not found');
}

function sendPage(res, shell, meta) {
  const html = shell.replace('</head>', `${metaBlock(meta)}\n</head>`);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
  res.end(html);
}

async function serveHtml(req, res, season) {
  const origin = originOf(req);
  const state = await getSeasonState(season);
  // Canonical/og:url must be the CLEAN per-season URL — never echo the query
  // string (Facebook/X append ?fbclid=, ?utm_*), and never fall back to root
  // for a season page, or crawlers will canonicalize the whole thing away.
  const canonical = season ? `${origin}/${state.season}` : `${origin}/`;
  const { title, desc } = copy(state);
  sendPage(res, INDEX_VERSIONED, { title, desc, img: `${origin}/og/${state.season}.png`, canonical });
}

// The season being played, from ESPN's schedule through the proxy's cache
// (lib/current-season.js): its completed games as CSV text, and a version
// that changes when they do. Null when ESPN cannot be reached and nothing
// is cached; everything then counts the CSV alone.
let currentMemo = null; // { key, csv, rows }
async function currentSeason() {
  const season = seasonBeingPlayed();
  const path = 'apis/site/v2/sports/football/nfl/teams/gb/schedule';
  const [reg, post] = await Promise.all([
    espn.get(espnTarget(path, `season=${season}&seasontype=2`)),
    espn.get(espnTarget(path, `season=${season}&seasontype=3`)),
  ]);
  if (reg?.status !== 200) return null;
  const key = `${season}|${reg.at}|${post?.status === 200 ? post.at : ''}`;
  if (currentMemo?.key === key) return currentMemo;
  try {
    const rows = currentSeasonRows({
      regular: JSON.parse(reg.body),
      post: post?.status === 200 ? JSON.parse(post.body) : null,
    }, season);
    const csv = rowsToCsv(rows);
    currentMemo = { key, csv, season, games: parseGames(csv), version: createHash('sha1').update(csv).digest('hex').slice(0, 12) };
    return currentMemo;
  } catch {
    return null;
  }
}

// Player stats, game by game, 1999 on (lib/player-stats.js): the committed
// file, with the season being played read from nflverse at runtime, as the
// season's games are read from ESPN. Refreshed every six hours; until the
// first fetch succeeds, and whenever it fails, the file's rows stand.
const committedPlayerGames = parsePlayerGames(readFileSync(join(ROOT, 'data', 'packers_player_games.csv'), 'utf8'));
const PLAYER_STATS_TTL = 6 * 60 * 60 * 1000;
let playerCurrent = { at: 0, season: null, rows: null, inFlight: null };
async function currentPlayerRows() {
  const season = seasonBeingPlayed();
  const fresh = playerCurrent.season === season && Date.now() - playerCurrent.at < PLAYER_STATS_TTL;
  if (fresh || playerCurrent.inFlight) return playerCurrent.rows;
  playerCurrent.inFlight = (async () => {
    try {
      const r = await fetch(`https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv.gz`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const rows = packersPlayerRows(gunzipSync(Buffer.from(await r.arrayBuffer())).toString('utf8'));
      playerCurrent = { at: Date.now(), season, rows, inFlight: null };
    } catch {
      // Keep what we had; try again on the next request after a minute.
      playerCurrent = { ...playerCurrent, at: Date.now() - PLAYER_STATS_TTL + 60 * 1000, inFlight: null };
    }
  })();
  // The first request waits for the fetch; later ones get the last rows.
  if (!playerCurrent.rows) await playerCurrent.inFlight;
  return playerCurrent.rows;
}

let statsMemo = null; // { key, rows, leaders: Map }
async function playerGamesNow() {
  const season = seasonBeingPlayed();
  const cur = await currentPlayerRows();
  const key = `${season}|${playerCurrent.at}|${cur ? cur.length : 'file'}`;
  if (statsMemo?.key === key) return statsMemo;
  const rows = cur
    ? [...committedPlayerGames.filter((r) => Number(r.season) !== season), ...cur]
    : committedPlayerGames;
  statsMemo = { key, rows, seasons: seasonsOf(rows), cache: new Map() };
  return statsMemo;
}

// Birth dates (lib/player-births.js): the committed file, and anyone it
// lacks, a player new in the season being played, from nflverse's
// players.csv (7MB), at most once a day and only while someone is missing.
// The fetch is not waited for: the card shows who is known now and the
// newcomer from the next request after it lands.
const committedBirths = parseBirths(readFileSync(join(ROOT, 'data', 'packers_player_births.csv'), 'utf8'));
const BIRTHS_TTL = 24 * 60 * 60 * 1000;
let birthsAdded = { at: 0, births: new Map(), inFlight: null };
function birthsNow(rows) {
  const missing = new Set();
  for (const r of rows) if (r.player_id && !committedBirths.has(r.player_id) && !birthsAdded.births.has(r.player_id)) missing.add(r.player_id);
  if (missing.size && !birthsAdded.inFlight && Date.now() - birthsAdded.at > BIRTHS_TTL) {
    birthsAdded.inFlight = (async () => {
      try {
        const r = await fetch('https://github.com/nflverse/nflverse-data/releases/download/players/players.csv');
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const got = birthDates(await r.text(), missing);
        birthsAdded = { at: Date.now(), births: new Map([...birthsAdded.births, ...got]), inFlight: null };
      } catch {
        // Try again in an hour.
        birthsAdded = { ...birthsAdded, at: Date.now() - BIRTHS_TTL + 60 * 60 * 1000, inFlight: null };
      }
    })();
  }
  return birthsAdded.births.size ? new Map([...committedBirths, ...birthsAdded.births]) : committedBirths;
}

// The Stadiums page (stadiums-core.js). Its games are the CSV's, with the
// season being played from nflverse's schedules at runtime, refreshed every
// six hours: ESPN's schedule, which counts that season everywhere else, has
// no roof, surface, weather or referee. Until the first fetch succeeds, and
// whenever nflverse has fewer of the season's games than the CSV, the CSV's
// stand.
const NFLVERSE_GAMES_TTL = 6 * 60 * 60 * 1000;
let nflverseCurrent = { at: 0, season: null, games: null, inFlight: null };
async function currentGameDayRows() {
  const season = seasonBeingPlayed();
  const fresh = nflverseCurrent.season === season && Date.now() - nflverseCurrent.at < NFLVERSE_GAMES_TTL;
  if (!fresh && !nflverseCurrent.inFlight) {
    nflverseCurrent.inFlight = (async () => {
      try {
        const r = await fetch('https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv');
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const mapped = parseNflverseCsv(await r.text()).map(mapNflverseRow).filter((g) => g && g.season === season);
        const games = parseGames([GAMES_HEADER, ...mapped.map(rowToCsv)].join('\n'));
        nflverseCurrent = { at: Date.now(), season, games, inFlight: null };
      } catch {
        // Keep what we had; try again on the next request after a minute.
        nflverseCurrent = { ...nflverseCurrent, at: Date.now() - NFLVERSE_GAMES_TTL + 60 * 1000, inFlight: null };
      }
    })();
  }
  if (!nflverseCurrent.games) await nflverseCurrent.inFlight;
  const committed = allGames.filter((g) => Number(g.season) === season);
  const cur = nflverseCurrent.season === season ? nflverseCurrent.games : null;
  if (!cur || cur.length < committed.length) return { version: 'csv', rows: allGames };
  return { version: String(nflverseCurrent.at), rows: [...allGames.filter((g) => Number(g.season) !== season), ...cur] };
}

// Crowds (lib/attendance.js): the committed file, and a game it lacks (the
// season being played) from ESPN's summary through the proxy's cache. A
// finished game's crowd is kept for good once read; ESPN not answering
// leaves it out until a later request.
const committedAttendance = parseAttendance(readFileSync(join(ROOT, 'data', 'packers_attendance.csv'), 'utf8'));
const addedAttendance = new Map();
async function attendanceFor(rows) {
  const missing = rows.filter((g) => g.espnId && g.result && !committedAttendance.has(g.espnId) && !addedAttendance.has(g.espnId));
  await Promise.all(missing.map(async (g) => {
    const got = await espn.get(espnTarget('apis/site/v2/sports/football/nfl/summary', `event=${g.espnId}`)).catch(() => null);
    if (!got || got.status !== 200) return;
    try {
      const summary = JSON.parse(got.body);
      if (summary?.header?.competitions?.[0]?.status?.type?.completed) addedAttendance.set(g.espnId, attendanceOf(summary));
    } catch { /* left out */ }
  }));
  return addedAttendance.size ? new Map([...committedAttendance, ...addedAttendance]) : committedAttendance;
}

let stadiumsMemo = null; // { key, json, data }
async function stadiumsNow() {
  const { version, rows } = await currentGameDayRows();
  const attendance = await attendanceFor(rows);
  const key = `${version}|${attendance.size}`;
  if (stadiumsMemo?.key !== key) {
    const data = stadiumStats(rows, attendance);
    stadiumsMemo = { key, data, json: JSON.stringify(data) };
  }
  return stadiumsMemo;
}

// The Splits page (splits-core.js), from the same rows as Stadiums: the CSV's,
// with the season being played from nflverse's schedules.
let splitsMemo = null; // { version, json }
async function splitsNow() {
  const { version, rows } = await currentGameDayRows();
  if (splitsMemo?.version !== version) splitsMemo = { version, rows, json: JSON.stringify(splitStats(rows)) };
  return splitsMemo;
}

// /api/born/<MM-DD>: the Packers born that day, for the On This Day card.
async function serveBornApi(res, monthDay) {
  const d = await playerGamesNow();
  const key = `born|${monthDay}|${birthsAdded.at}`;
  if (!d.cache.has(key)) d.cache.set(key, JSON.stringify(bornOn(d.rows, birthsNow(d.rows), monthDay)));
  else birthsNow(d.rows);
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' });
  res.end(d.cache.get(key));
}

// /api/players: every player since 1999, for search. /api/player/<id>: one
// player's seasons and career by category, and a season's game log (the
// latest, unless ?season= names another of his). Both from the same rows
// as the Stats page, cached per version of them.
async function servePlayersApi(res) {
  const d = await playerGamesNow();
  if (!d.cache.has('players')) d.cache.set('players', JSON.stringify(playerIndex(d.rows)));
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' });
  res.end(d.cache.get('players'));
}

async function servePlayerApi(res, url, id) {
  const d = await playerGamesNow();
  const type = STAT_TYPES.has(url.searchParams.get('type')) ? url.searchParams.get('type') : 'REG';
  const summary = playerSummary(d.rows, id, type);
  if (!summary) {
    res.writeHead(404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ error: 'No such player' }));
  }
  const asked = Number(url.searchParams.get('season'));
  const season = summary.seasons.includes(asked) ? asked : summary.seasons[0];
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' });
  // A quarterback's record as the Packers' starter (splits-core.js), from
  // nflverse's schedules; null for everyone else.
  const starts = starterRecord((await splitsNow()).rows, id);
  res.end(JSON.stringify({ ...summary, starts, log: gameLog(d.rows, id, season) }));
}

async function servePlayerHtml(req, res, id) {
  const d = await playerGamesNow();
  const summary = playerSummary(d.rows, id, 'REG') || playerSummary(d.rows, id, 'ALL');
  if (!summary) return notFound(res);
  const origin = originOf(req);
  return sendPage(res, PLAYER_VERSIONED, {
    title: `${summary.name} — Packers stats, ${summary.span}`,
    desc: `${summary.name} (${summary.pos}) with the Green Bay Packers, ${summary.span}: every season and game since 1999.`,
    img: `${origin}/og/default.png`, canonical: `${origin}/player/${id}`,
  });
}

const STAT_TYPES = new Set(['REG', 'POST', 'ALL']);
async function serveStatsApi(res, url, which) {
  const d = await playerGamesNow();
  const type = STAT_TYPES.has(url.searchParams.get('type')) ? url.searchParams.get('type') : 'REG';
  let body;
  if (which === 'leaders') {
    const k = `leaders|${type}`;
    if (!d.cache.has(k)) d.cache.set(k, JSON.stringify({ type, first: d.seasons.at(-1), last: d.seasons[0], leaders: leaders(d.rows, { type }) }));
    body = d.cache.get(k);
  } else {
    const asked = Number(url.searchParams.get('season'));
    const season = d.seasons.includes(asked) ? asked : d.seasons[0];
    const k = `season|${season}|${type}`;
    if (!d.cache.has(k)) {
      d.cache.set(k, JSON.stringify({
        season, type, seasons: d.seasons,
        categories: CATEGORIES.map((c) => ({ key: c.key, title: c.title, sort: c.sort, columns: c.columns.map(([key, label]) => [key, label]) })),
        tables: seasonTables(d.rows, season, type),
      }));
    }
    body = d.cache.get(k);
  }
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' });
  res.end(body);
}

// Records, history, head-to-head and coaches for the games as they stand:
// the CSV plus the season being played. Recomputed only when a game is
// added (lib/derived.js).
async function derivedNow() {
  const cur = await currentSeason();
  const games = cur ? poolCurrentSeason(allGames, cur.games, cur.season) : allGames;
  return derive(games, cur?.version ?? 'csv');
}

// /records and /records/<slug>: same shell, per-slug meta + social card.
function serveRecordsHtml(req, res, slug, d) {
  const origin = originOf(req);
  const { title, desc } = recordsMeta(slug, d.records);
  const canonical = slug ? `${origin}/records/${slug}` : `${origin}/records`;
  const img = `${origin}/og/records/${slug || 'overview'}.png`;
  sendPage(res, RECORDS_VERSIONED, { title, desc, img, canonical });
}

// /vs and /vs/<opponent>: same shell, per-opponent meta + social card.
function serveVsHtml(req, res, slug, d) {
  const origin = originOf(req);
  const { title, desc } = h2hMeta(slug, d.h2h);
  const canonical = slug ? `${origin}/vs/${slug}` : `${origin}/vs`;
  const img = `${origin}/og/vs/${slug || 'overview'}.png`;
  sendPage(res, VS_VERSIONED, { title, desc, img, canonical });
}

// Each card is rendered at most once per version of the games: records,
// history and head-to-head change when a game of the season being played
// is added, and a card from before then would show the old numbers. Cards
// of an older version are dropped as soon as a newer one is asked for.
const staticImgCache = new Map(); // `${version}:${key}` -> buf
let staticImgVersion = null;
function serveCachedPng(res, key, render, version = 'static') {
  if (version !== staticImgVersion && version !== 'static') {
    for (const k of staticImgCache.keys()) if (!k.startsWith('static:')) staticImgCache.delete(k);
    staticImgVersion = version;
  }
  const cacheKey = `${version}:${key}`;
  let buf = staticImgCache.get(cacheKey);
  if (!buf) {
    buf = render();
    staticImgCache.set(cacheKey, buf);
  }
  res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' });
  res.end(buf);
}

const imgCache = new Map(); // season -> { buf, at }
async function serveImage(req, res, season) {
  const cur = defaultSeason();
  const isPast = season < cur;
  const ttl = isPast ? Infinity : 60 * 1000;
  const hit = imgCache.get(season);
  let buf;
  if (hit && Date.now() - hit.at < ttl) {
    buf = hit.buf;
  } else {
    const state = await getSeasonState(season);
    buf = renderPng(state);
    imgCache.set(season, { buf, at: Date.now() });
  }
  res.writeHead(200, {
    'Content-Type': 'image/png',
    'Cache-Control': isPast ? 'public, max-age=31536000, immutable' : 'public, max-age=60',
  });
  res.end(buf);
}

async function serveStatic(req, res, pathname) {
  const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const file = join(ROOT, safe);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
  try {
    const st = await stat(file);
    if (st.isDirectory()) throw new Error('dir');
    const body = await readFile(file);
    const ext = extname(file).toLowerCase();
    // Immutable only for the version this server has; see lib/static-cache.js.
    const asked = new URL(req.url, 'http://x').searchParams.get('v');
    const rel = safe.replace(/\\/g, '/').replace(/^\//, '');
    const cache = staticCacheControl({ asked, have: asked == null ? null : assetVersion(rel), ext });
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': cache,
    });
    res.end(body);
  } catch {
    // Real assets (paths with a file extension) that don't exist must 404 —
    // returning HTML for a missing .png/.ico/.txt confuses crawlers (esp. Twitterbot).
    if (extname(pathname)) return notFound(res);
    // Extension-less route: serve the app shell with default meta (SPA fallback).
    await serveHtml(req, res, undefined);
  }
}

// /api/espn/<path>: the three ESPN endpoints the pages call, through the
// cache in lib/espn-proxy.js. Anything not on lib/espn-target.js's list 404s.
const espn = createEspnCache();
async function serveEspnProxy(res, path, search) {
  const target = espnTarget(path, search);
  if (!target) return notFound(res);
  const got = await espn.get(target);
  if (!got) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'ESPN unreachable' }));
  }
  res.writeHead(got.status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': `public, max-age=${browserMaxAge(got)}`,
    'X-Proxy-Cache': got.cacheState,
  });
  res.end(got.body);
}

// A game's box score, from ESPN: /game/<ESPN event id> and its data at
// /api/boxscore/<id>. Reduced once per summary fetched (lib/espn-box.js),
// however many viewers ask in between; the summary itself comes through
// the same cache as the proxy, so a live game is 15 seconds old at most.
const ESPN_GAME_ID = /^\d{6,12}$/;
const boxMemo = new Map(); // event id -> { at, box }
// A game in progress also reads this week's scoreboard, through the same
// cache, for its clock, scores and situation: the summary has no timeouts
// left, often no one in possession, and can be a refresh behind
// (lib/espn-box.js).
async function espnBox(eventId) {
  const got = await espn.get(espnTarget('apis/site/v2/sports/football/nfl/summary', `event=${eventId}`));
  if (!got || got.status !== 200) return null;
  let summary;
  try { summary = JSON.parse(got.body); } catch { return null; }
  const live = summary?.header?.competitions?.[0]?.status?.type?.state === 'in';
  const sb = live ? await espn.get(espnTarget('apis/site/v2/sports/football/nfl/scoreboard')) : null;
  const key = `${got.at}|${sb?.at ?? ''}`;
  const memo = boxMemo.get(eventId);
  if (memo && memo.key === key) return memo.box;
  let scoreboard = null;
  if (sb?.status === 200) {
    try { scoreboard = JSON.parse(sb.body).events?.find((e) => String(e.id) === String(eventId))?.competitions?.[0] || null; } catch { /* not on it */ }
  }
  let box = null;
  try {
    const id = String(eventId);
    box = withDetails(withGameDay(espnBoxscore(summary, { scoreboard }), gameByEspnId.get(id)), gameDetailsById[id]);
  } catch { /* not a game */ }
  if (boxMemo.size > 100) boxMemo.clear();
  boxMemo.set(eventId, { key, box });
  return box;
}

async function serveBoxscoreApi(res, eventId) {
  const box = await espnBox(eventId);
  if (!box) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Game not found' }));
  }
  // A final box score is settled; one in progress changes every play, and
  // the page asks every 15 seconds.
  const maxAge = box.final ? 3600 : box.live ? 5 : 60;
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${maxAge}` });
  res.end(JSON.stringify(box));
}

async function serveGameHtml(req, res, eventId) {
  const box = await espnBox(eventId);
  if (!box) return notFound(res);
  const origin = originOf(req);
  const { away, home } = box;
  const matchup = `${away.name} @ ${home.name}`;
  const score = `${away.short} ${away.score}, ${home.short} ${home.score}`;
  const desc = box.final ? `Box score: ${score} (${box.date}).`
    : box.live ? `Live: ${score}, ${box.status}.`
    : `${matchup}, ${box.date}.`;
  return sendPage(res, GAME_VERSIONED, {
    title: box.state === 'pre' ? `${matchup} — ${box.date}` : `${score} — ${box.date}`,
    desc, img: `${origin}/og/default.png`, canonical: `${origin}/game/${eventId}`,
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const pathname = decodeURIComponent(url.pathname);

    const boxApi = pathname.match(/^\/api\/boxscore\/(\d+)$/);
    if (boxApi) {
      if (!ESPN_GAME_ID.test(boxApi[1])) return notFound(res);
      return await serveBoxscoreApi(res, boxApi[1]);
    }
    if (pathname.startsWith('/game/')) {
      // Only an ESPN event id gets the page; anything else 404s rather than
      // falling through to the home page.
      const game = pathname.match(/^\/game\/(\d+)\/?$/);
      if (!game || !ESPN_GAME_ID.test(game[1])) return notFound(res);
      return await serveGameHtml(req, res, game[1]);
    }

    if (pathname.startsWith('/api/espn/'))
      return await serveEspnProxy(res, pathname.slice('/api/espn/'.length), url.search);

    const ogRec = pathname.match(/^\/og\/records\/([a-z-]+)\.png$/);
    if (ogRec) {
      if (ogRec[1] !== 'overview' && !isRecordSlug(ogRec[1])) return notFound(res);
      const d = await derivedNow();
      return serveCachedPng(res, `records:${ogRec[1]}`, () => renderRecordsPng(ogRec[1], d.records), d.version);
    }

    const ogVs = pathname.match(/^\/og\/vs\/([a-z0-9-]+)\.png$/);
    if (ogVs) {
      const d = await derivedNow();
      if (ogVs[1] !== 'overview' && !isOpponentSlug(ogVs[1], d.h2h)) return notFound(res);
      return serveCachedPng(res, `vs:${ogVs[1]}`, () => renderH2hPng(ogVs[1], d.h2h), d.version);
    }

    const img = pathname.match(/^\/og\/(\d{4})\.png$/);
    if (img) return await serveImage(req, res, parseInt(img[1], 10));
    if (pathname === '/og/default.png' || pathname === '/og.png')
      return await serveImage(req, res, defaultSeason());

    if (pathname === '/robots.txt') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
      return res.end('User-agent: *\nAllow: /\n');
    }

    if (pathname === '/' || pathname === '/index.html') {
      const q = url.searchParams.get('season');
      return await serveHtml(req, res, q ? parseInt(q, 10) : undefined);
    }
    const yr = pathname.match(/^\/(\d{4})\/?$/);
    if (yr) return await serveHtml(req, res, parseInt(yr[1], 10));

    // The games CSV's rows for the season being played, from ESPN, for the
    // pages to pool with the file (poolCurrentSeason in records-core.js).
    // 503 when ESPN cannot be reached: the pages then count the file alone.
    if (pathname === '/api/current/games.csv') {
      const cur = await currentSeason();
      if (!cur) {
        res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end('ESPN unreachable');
      }
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'public, max-age=60', 'X-Season': String(cur.season) });
      return res.end(cur.csv);
    }

    const born = pathname.match(/^\/api\/born\/((?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01]))$/);
    if (born) return await serveBornApi(res, born[1]);
    if (pathname === '/api/players') return await servePlayersApi(res);
    if (pathname.startsWith('/api/player/')) {
      const id = pathname.slice('/api/player/'.length);
      if (!PLAYER_ID.test(id)) return notFound(res);
      return await servePlayerApi(res, url, id);
    }
    if (pathname.startsWith('/player/')) {
      const id = pathname.slice('/player/'.length).replace(/\/$/, '');
      if (!PLAYER_ID.test(id)) return notFound(res);
      return await servePlayerHtml(req, res, id);
    }
    if (pathname === '/api/stats') return await serveStatsApi(res, url, 'season');
    if (pathname === '/api/stats/leaders') return await serveStatsApi(res, url, 'leaders');
    if (pathname === '/api/stadiums') {
      const st = await stadiumsNow();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' });
      return res.end(st.json);
    }
    if (pathname === '/api/splits') {
      const sp = await splitsNow();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' });
      return res.end(sp.json);
    }
    if (pathname === '/splits' || pathname === '/splits/' || pathname === '/splits.html') {
      const origin = originOf(req);
      return sendPage(res, SPLITS_VERSIONED, {
        title: 'Packers Splits',
        desc: 'The Packers by day and kickoff, in close games and overtime, as favorites and underdogs, and by starting quarterback, since 1999.',
        img: origin + '/og/default.png', canonical: origin + '/splits',
      });
    }
    if (pathname === '/stadiums' || pathname === '/stadiums/' || pathname === '/stadiums.html') {
      const origin = originOf(req);
      return sendPage(res, STADIUMS_VERSIONED, {
        title: 'Packers Stadiums',
        desc: "Lambeau Field, the coldest and windiest games, the biggest crowds, and the Packers' record in every road stadium and with every referee, since 1999.",
        img: `${origin}/og/default.png`, canonical: `${origin}/stadiums`,
      });
    }
    if (pathname === '/stats' || pathname === '/stats/' || pathname === '/stats.html') {
      const origin = originOf(req);
      return sendPage(res, STATS_VERSIONED, {
        title: 'Packers Player Stats',
        desc: "Every Green Bay Packers player's season, and the leaders, since 1999.",
        img: `${origin}/og/default.png`, canonical: `${origin}/stats`,
      });
    }

    if (pathname === '/records' || pathname === '/records/' || pathname === '/records.html')
      return serveRecordsHtml(req, res, undefined, await derivedNow());
    if (pathname.startsWith('/records/')) {
      // Only exact known slugs get the page; anything else (bad case, extra
      // segments) must 404, not fall through to the homepage SPA fallback.
      const slug = pathname.slice('/records/'.length).replace(/\/$/, '');
      if (!isRecordSlug(slug)) return notFound(res);
      return serveRecordsHtml(req, res, slug, await derivedNow());
    }

    if (pathname === '/history' || pathname === '/history/' || pathname === '/history.html') {
      const origin = originOf(req);
      const { title, desc } = historyMeta((await derivedNow()).seasonHistory);
      return sendPage(res, HISTORY_VERSIONED, {
        title, desc, img: `${origin}/og/history.png`, canonical: `${origin}/history`,
      });
    }
    if (pathname === '/og/history.png') {
      const d = await derivedNow();
      return serveCachedPng(res, 'history', () => renderHistoryPng(d.seasonHistory), d.version);
    }

    if (pathname === '/coaches' || pathname === '/coaches/' || pathname === '/coaches.html') {
      const origin = originOf(req);
      const { title, desc } = coachesMeta((await derivedNow()).coaches);
      return sendPage(res, COACHES_VERSIONED, {
        title, desc, img: `${origin}/og/coaches.png`, canonical: `${origin}/coaches`,
      });
    }
    if (pathname === '/og/coaches.png') {
      const d = await derivedNow();
      return serveCachedPng(res, 'coaches', () => renderCoachesPng(d.coaches), d.version);
    }

    if (pathname === '/vs' || pathname === '/vs/' || pathname === '/vs.html')
      return serveVsHtml(req, res, undefined, await derivedNow());
    if (pathname.startsWith('/vs/')) {
      const slug = pathname.slice('/vs/'.length).replace(/\/$/, '');
      const d = await derivedNow();
      if (!isOpponentSlug(slug, d.h2h)) return notFound(res);
      return serveVsHtml(req, res, slug, d);
    }

    return await serveStatic(req, res, pathname);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Server error');
    console.error(e);
  }
});

server.listen(PORT, () => console.log(`listening on :${PORT}`));