// Minimal web service for arethepackersundefeated.com
// - serves the static site
// - injects per-URL Open Graph / Twitter meta so shared links preview correctly
// - renders per-season social cards at /og/:season.png
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';
import { renderPng, renderRecordsPng, renderH2hPng, renderHistoryPng, renderCoachesPng } from './lib/cards.js';
import { originOf } from './lib/origin.js';
import { getSeasonState, defaultSeason, allGames } from './lib/seasons.js';
import { records, recordsMeta, isRecordSlug, seasonHistory, historyMeta } from './lib/records.js';
import { coaches, coachesMeta } from './lib/coaches.js';
import { h2h, h2hMeta, isOpponentSlug } from './lib/h2h.js';
import { esc } from './records-core.js';
import { espnTarget } from './lib/espn-target.js';
import { createEspnCache, browserMaxAge } from './lib/espn-proxy.js';
import { espnBoxscore, withGameDay } from './lib/espn-box.js';

// The games CSV's rows by ESPN id, for each past game's game-day details.
const gameByEspnId = new Map(allGames.filter((g) => g.espnId).map((g) => [g.espnId, g]));
import { staticCacheControl } from './lib/static-cache.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
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

// /records and /records/<slug>: same shell, per-slug meta + social card.
function serveRecordsHtml(req, res, slug) {
  const origin = originOf(req);
  const { title, desc } = recordsMeta(slug);
  const canonical = slug ? `${origin}/records/${slug}` : `${origin}/records`;
  const img = `${origin}/og/records/${slug || 'overview'}.png`;
  sendPage(res, RECORDS_VERSIONED, { title, desc, img, canonical });
}

// /vs and /vs/<opponent>: same shell, per-opponent meta + social card.
function serveVsHtml(req, res, slug) {
  const origin = originOf(req);
  const { title, desc } = h2hMeta(slug);
  const canonical = slug ? `${origin}/vs/${slug}` : `${origin}/vs`;
  const img = `${origin}/og/vs/${slug || 'overview'}.png`;
  sendPage(res, VS_VERSIONED, { title, desc, img, canonical });
}

// Records/h2h data is fixed for the lifetime of the process (CSV is read at
// startup; updates arrive via redeploy), so render each card at most once.
const staticImgCache = new Map(); // cache key -> buf
function serveCachedPng(res, key, render) {
  let buf = staticImgCache.get(key);
  if (!buf) {
    buf = render();
    staticImgCache.set(key, buf);
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
  try { box = withGameDay(espnBoxscore(summary, { scoreboard }), gameByEspnId.get(String(eventId))); } catch { /* not a game */ }
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
      return serveCachedPng(res, `records:${ogRec[1]}`, () => renderRecordsPng(ogRec[1], records));
    }

    const ogVs = pathname.match(/^\/og\/vs\/([a-z0-9-]+)\.png$/);
    if (ogVs) {
      if (ogVs[1] !== 'overview' && !isOpponentSlug(ogVs[1])) return notFound(res);
      return serveCachedPng(res, `vs:${ogVs[1]}`, () => renderH2hPng(ogVs[1], h2h));
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

    if (pathname === '/records' || pathname === '/records/' || pathname === '/records.html')
      return serveRecordsHtml(req, res, undefined);
    if (pathname.startsWith('/records/')) {
      // Only exact known slugs get the page; anything else (bad case, extra
      // segments) must 404, not fall through to the homepage SPA fallback.
      const slug = pathname.slice('/records/'.length).replace(/\/$/, '');
      if (!isRecordSlug(slug)) return notFound(res);
      return serveRecordsHtml(req, res, slug);
    }

    if (pathname === '/history' || pathname === '/history/' || pathname === '/history.html') {
      const origin = originOf(req);
      const { title, desc } = historyMeta();
      return sendPage(res, HISTORY_VERSIONED, {
        title, desc, img: `${origin}/og/history.png`, canonical: `${origin}/history`,
      });
    }
    if (pathname === '/og/history.png')
      return serveCachedPng(res, 'history', () => renderHistoryPng(seasonHistory));

    if (pathname === '/coaches' || pathname === '/coaches/' || pathname === '/coaches.html') {
      const origin = originOf(req);
      const { title, desc } = coachesMeta();
      return sendPage(res, COACHES_VERSIONED, {
        title, desc, img: `${origin}/og/coaches.png`, canonical: `${origin}/coaches`,
      });
    }
    if (pathname === '/og/coaches.png')
      return serveCachedPng(res, 'coaches', () => renderCoachesPng(coaches));

    if (pathname === '/vs' || pathname === '/vs/' || pathname === '/vs.html')
      return serveVsHtml(req, res, undefined);
    if (pathname.startsWith('/vs/')) {
      const slug = pathname.slice('/vs/'.length).replace(/\/$/, '');
      if (!isOpponentSlug(slug)) return notFound(res);
      return serveVsHtml(req, res, slug);
    }

    return await serveStatic(req, res, pathname);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Server error');
    console.error(e);
  }
});

server.listen(PORT, () => console.log(`listening on :${PORT}`));