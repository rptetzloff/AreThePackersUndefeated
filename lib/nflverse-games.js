// nflverse's schedules file (games.csv, CC BY 4.0) as rows of the games
// CSV: the mapping update-data.js writes data/packers_games.csv with, and the
// server reads the season being played through, for the game-day columns
// (stadium, roof, surface, weather, referee) ESPN's schedule does not carry.
//
// Pure: no fetch, no fs.
import { splitCsvLine } from '../records-core.js';

// Quoted fields are real in games.csv (99 rows carry "" for an empty roof
// or surface), so lines split with the site's own CSV splitter rather than
// on every comma, which kept the two quote characters as the value.
export function parseCsv(raw) {
    const lines = raw.trim().split('\n');
    const headers = splitCsvLine(lines[0]);
    return lines.slice(1).map(line => {
        const vals = splitCsvLine(line);
        const obj = {};
        headers.forEach((h, i) => { obj[h.trim()] = (vals[i] ?? '').trim(); });
        return obj;
    });
}

export const NFL_TEAM_NAMES = {
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
export function mapNflverseRow(r) {
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
export function clean(v) {
    const t = String(v ?? '').trim();
    return t === 'NA' ? '' : t;
}

// The columns a kept row takes from nflverse on every run. A row that
// already has its result is otherwise left alone (see main), which would
// leave every game played before these columns existed without them.
export const GAME_DAY = ['espn_id', 'stadium', 'roof', 'surface', 'temp', 'wind', 'referee'];

// A field with a comma or a quote is quoted, as CSV has it; a stadium or a
// referee's name could carry either.
export function csvField(v) {
    const t = String(v ?? '');
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

export function rowToCsv(r) {
    return [
        r.date, r.season, r.regular_season, r.playoff, r.superbowl,
        r.Opponent, r['Packers Win'], r.packers_score, r.opponent_score, r.location,
        ...GAME_DAY.map(k => r[k] ?? ''),
    ].map(csvField).join(',');
}

export const GAMES_HEADER = ['date,season,regular_season,playoff,superbowl,Opponent,Packers Win,packers_score,opponent_score,location', ...GAME_DAY].join(',');
