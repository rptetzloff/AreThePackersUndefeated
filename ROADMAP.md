# Roadmap

Ideas worth doing, roughly in the order that makes sense to build them. Nothing
here is committed to a date — it's a parking lot so the reasoning doesn't have
to be re-derived each time.

This file covers both this repository and `AreTheBrewersOnTV`, because most of
what's left is about the two of them converging. It lives here because that's
where the work started; if a shared repo ever exists, it moves there.

Numbers were measured against the code rather than estimated, and were true
when written. Where one has since changed, the entry says so rather than being
quietly corrected — the trail is the point.

---

## Where this came from

Two sites, forked from one and drifted. As of August 2026: **205 commit
subjects in common, 188 only in Brewers, 3 only in Packers.** Same start date,
one actively developed and the other not since July.

The drift is mostly additive rather than architectural. The evidence that these
are the same site:

- Packers' CSS is nearly a subset of Brewers' — **131 of its 139 classes**
  already exist there
- Both palettes have identical *roles* and identical values for status colours;
  only four brand values differ. Neither stylesheet uses a single CSS variable —
  **282 hardcoded hex literals** between them
- `lib/cards.js` exports the same ten function names in both
- The route surfaces match apart from `/managers` versus `/coaches`, which is
  the same concept under a different noun

## Done

### ~~Tests, both repos~~ — done
211 tests where there were none: 106 here, 105 in Brewers. (Was 91 here when
this line was first written; the manifest work below added fifteen more.)
`node --test`, no dependencies, verified to run against a bare checkout with no `node_modules` at
all. Two layers — unit tests build their own rows and pin exact numbers; the
real-data files assert relations and floors, because `update-data.js` commits
new games weekly and any "there are N games" assertion fails every Monday until
someone edits it into meaninglessness.

Each rule was checked by breaking it. Nine mutations, nine kills.

### ~~Line endings~~ — done
`.gitattributes` in both, per extension rather than `* text=auto`. Surfaced two
latent problems: `!text` falls back to `core.autocrlf` and strips CRs on the
next add, and seven files across the two repos had CRLF working copies over LF
blobs, which `git status` hid by normalising before comparing.

### ~~Site manifests, both repos~~ — in review
`site.js` in each: the team's names, the sport's nouns, which records exist, and
the sentences a template gets wrong. Copy functions take it as a parameter with
a default, so a shared core can hand them a different sport and no call site
changed. Proved invisible by byte-diff — 24 rendered strings here, 50 there.

**The diff between the two files is the specification**, and it is now concrete:
eight fields differ, three match, six of twenty-one record slugs are shared, and
the copy overrides barely overlap. `streaksSpanSeasons` is the only genuine rule
disagreement.

Three fields stay declarative on purpose — `scoreNoun` has no prose reader yet,
and `streaksSpanSeasons` and `perfectSeasonIsPlausible` describe rules the
compute functions still hardcode. Their tests assert the declaration matches the
behaviour rather than driving it, so the day those cores merge, reading one
backwards fails a test.

### ~~Site manifest~~ — superseded by the entry above
`site.js` here: the team's names, the sport's nouns, which records exist, and
the handful of lines a template gets wrong. Copy functions take it as a
parameter with a default, so a shared core can hand them a different sport and
no existing call site changed.

---

## Next

### Brewers manifest
The same file for the other repo. Richer — **85** team-word occurrences in
`records-core.js` against **15** here, twenty record slugs against seven, and
its own flavour lines.

That 15 was 37 before the manifest landed, and the 15 that remain are all
`'Packers Win'` data keys plus one comment. Which is the measurement worth
keeping: the vocabulary half is done here and the mechanical half is the rename
below.

**The diff between the two `site.js` files is the specification of what a
shared core has to be told.** That's the actual deliverable, more than either
file.

### ~~Neutral row keys~~ — done. The team selector is not.
The rename shipped in August 2026. The selector below has not, so this entry
stays here rather than moving to Done.

**It shipped with a regression, and the regression is the useful part.** The
commit switched `main.js` and `lib/seasons.js` onto the normalised parser and
left fourteen field reads on the old names. Each returned `undefined` rather
than throwing, so every past season rendered a 0-0 record and a schedule of 0-0
ties, on production, through two release PRs and a green suite of 118 tests. The
commit message asserted that "one function owns the CSV's own names" — which was
false when written. `test/row-keys.test.js` now asserts it instead.

Read the entry below on `main.js` before doing the team-selector half: the same
file will be in the way, for the same reason.

The blocker for a shared core was that the row keys embed the team name.

| Now | Shared |
|---|---|
| `'Packers Win'` / `'Brewers Win'` | `result` |
| `packers_score` / `brewers_score` | `scoreFor` |
| `opponent_score` | `scoreAgainst` |
| `superbowl` / `worldseries` | `championship` |

One job, not two: `scoreFor` only means anything *relative to a selected team*,
so neutral names and a team selector are the same change. Normalise in the
parser rather than threading a config through every pure function — the latter
would put a config object in every one of the 211 test fixtures.

The two repos already differ here in a way that matters. Brewers' parser
carries `BREWERS_IDS` and filters league-wide rows by team id; Packers' CSV has
no team ids at all and is pre-flattened to one perspective. **Brewers' shape
generalises to any franchise and Packers' cannot.** Moving this repo onto a
league-wide feed with team ids is the same work as the rename.

### Break up `main.js`
Not because it is long. Because it is the only place bugs have shipped from.

| | Packers | Brewers |
|---|---|---|
| lines | 1,455 | 3,164 |
| functions | 74 | 173 |
| DOM references | 146 | 276 |

Three times the next-largest file in each repo, and the least covered. Both of
this month's production bugs lived here or in its server-side twin, and neither
was reachable from `node --test`: `main.js` fetches its own CSV in the browser,
and `lib/seasons.js` reads the file at import and calls ESPN. A green suite says
nothing about either.

The pattern already exists in both repos. Of the five `*-core.js` modules —
`records-core`, `h2h-core`, `coaches-core`, `share-core`, and `boxscore-core` on
the baseball side — four are entirely DOM-free and well covered. Only
`share-core` touches the DOM, deliberately. `main.js` is simply the part that
never got the treatment.

Extract in this order, smallest risk first:

1. ~~**The season tally.**~~ Done. `seasonTally` in `records-core.js`, 11 tests,
   `processCsvSeasonData` down from 56 lines to 30 and now only renders.

   This entry predicted it would be "likely deletion rather than extraction,
   since `computeSeasonHistory` already does most of it." That was wrong, and
   the reason is worth keeping. `computeSeasonHistory` exposes no postseason
   record, gives a boolean for the championship rather than its name, and means
   something different by `undefeated` — it also requires the season to have
   finished, because the records page lists completed undefeated seasons, while
   the front page answers a question a team can say yes to in October. Folding
   one into the other would either announce a perfect season in week three or
   refuse to call a team undefeated while it is. A test now pins that
   difference so a later merge has to fail it first.
2. ~~**On-this-day selection.**~~ Done. `onThisDayCandidates`, `onThisDayPool`
   and `onThisDayView` in `records-core.js`, 15 tests. `buildOnThisDay` 26 lines
   to 15, `_renderOnThisDay` 56 to 45; both now only touch the DOM.

   The ±3 day proximity test is `month * 31 + day`, which is not a date
   calculation. It is kept because changing it changes which games the page
   offers, and a test now documents the consequence rather than leaving it to be
   discovered: the window does not wrap around the end of the year, so on 1
   January nothing from late December is a candidate.
3. **The streak banner text** — `updateStreakBanner` (main.js:1226, 62 lines).

The largest method, `createGameItem` (main.js:798, 213 lines), is left for last
on purpose: it renders the live ESPN path, which has no fixtures and no tests at
all, so it is the one place where "extract, don't rewrite" is hardest to honour
and easiest to get wrong.

Do not rewrite it. Extraction keeps behaviour identical and is verifiable by
rendering the page before and after; a rewrite is a behaviour change wearing a
refactor's clothes, on the least-tested file in the repo.

**A render harness is complementary, not an alternative.** Extraction makes the
logic testable. It does nothing about "the container has no definite width, so
the grid collapses to one column" — and this month produced exactly one bug of
each kind. A headless-render test would cover the second, but it needs a browser
in CI, which is a real cost and a separate decision. The manual version is
already in the house rules and already earning its place.

Open question: whether the extracted core is shared between the two sites
immediately or lands per-repo first. Sharing it is the point, but every previous
attempt to share before both sides had tests went badly.

### Design tokens
282 hex literals into roughly fifteen custom properties, per repo. Independently
worth it — it's the prerequisite for contrast testing, as in
`vue-password-generator` — and it's what makes `styles.css` shareable at all.

### Backport what Brewers has and Packers doesn't
Footer nav bar with active-page highlight, the disclaimer/licence modal, mobile
tab bar, tiered ESPN proxy cache TTLs. Also `sortable.js`, where the two have
**zero shared exports** — Brewers' generates headers from a column spec and
emits `aria-sort`, Packers' reads `data-sort` from hand-written markup with no
accessibility affordance. Brewers' is strictly better; take it and port the four
call sites.

Not portable: everything TV — providers, channels, watch modal, sponsor slots.
Those exist because one site answers "can I watch this" and the other answers
"are they still undefeated."

### Commit the current season's data
Today the season in progress never touches a CSV. `lib/espn-current.js` fetches
ESPN, synthesises rows in Retrosheet's exact column order, serves them from
`/api/current/*.csv`, and the pages append them before parsing. A year guard
(`year <= maxSeason`) disables it the moment Retrosheet publishes.

It is clever and it is fragile in the way live dependencies are: the site's
history table is only as available as ESPN, the synthesis is untested, and a
team-name that fails to map to a Retrosheet code becomes an opponent that
silently does not exist.

Committing the current season instead — the same synthesis, run on a schedule,
output written to a file — makes the path testable, makes the site work when
ESPN does not, and removes the only place where what the page shows depends on
a network call. The Packers repo already commits its data weekly on a cron; this
is that pattern applied to the harder feed.

### Get the data out of the code repo
Brewers is **458MB of data against 916MB of working tree**, with
`plays.lfs.csv` at 387MB behind Git LFS — streamed on *every boot* to build
in-memory indices, which is why `render.yaml` carries
`--max-old-space-size=400`.

Precompute those indices at publish time and the service ships a small artifact
instead. Faster boots, no heap tuning, far smaller deploys. The pattern already
exists in `anagrimoire`: a scheduled Action publishes to a data branch, the
client reads a pinned CDN tag with bundled files as fallback.

This is also what decides the monorepo question. With data out, the code repo
is a couple of megabytes and Render's root directory plus build filters is
comfortably enough. With data in, every new site makes every existing site's
deploy heavier.

---

## Later, and deliberately vague

### More teams
Once the team selector exists, another team is a manifest file. Thirty-two NFL
sites are the same data, same parser, same rules — different ids, colours and
question.

The question is per *team*, not per sport, which is the useful realisation:
`AreThePackersUndefeated`, `AreTheBrewersOnTV`, `HaveTheBrownsWonAGame`. Same
engine, different predicate and headline, both manifest fields.
`IsMyTeamStatisticallyRelevant` is the fallback for teams whose situation isn't
funny enough to name.

### More sports
The four North American leagues are the same shape with different values, and
every difference already has a manifest slot:

| | ties | is "undefeated" meaningful | championship |
|---|---|---|---|
| NFL | rare | yes — the premise | Super Bowl |
| MLB | nearly extinct | no, 162 games | World Series |
| NBA | impossible | no, 82 games | Finals |
| NHL | abolished 2005, OT/SO since | no | Stanley Cup |

NHL is the interesting one: ties stopped existing at a known date, so `rec()`
needs an era rule rather than a flag.

**MLS fits too**, which was not the first assessment here. The initial note
said soccer broke the shape — that was about European football, with promotion,
relegation and concurrent league-and-cup competitions. MLS is a closed
franchise league with playoffs and a final, so "won the last playoff game"
works as it does everywhere else.

Two real additions for it:

- **Draws are ordinary**, and a season is measured in **points** (3 for a win,
  1 for a draw) rather than win percentage. A different primitive, not a
  different constant.
- **Two trophies** — MLS Cup by playoff, Supporters' Shield by regular-season
  record — so `champion` becomes ambiguous.

That second one is already half-modelled. `records-core.js` carries
`STANDINGS_TITLES = new Set([1929, 1930, 1931])` for the NFL titles awarded on
standing before there was a championship game. A title earned by finishing top
rather than winning a final is exactly the Supporters' Shield shape;
generalised, it's a manifest rule and a second flag on the season row.

### A hosting guide
By the time the above is done this is mostly documentation of what already
exists: write a `site.js`, point it at a league feed, deploy.

**Not planned:** European football. Promotion and relegation, no playoffs in
most leagues, and a season that is several concurrent competitions rather than
one list of games. That is a sibling project that reuses the manifest idea and
the chrome, not the compute layer. Bending `computeSeasonHistory` to cover it
would make it worse for the five leagues it does fit.

---

## Open questions

**The 2018 tiebreaker.** Exactly one game in Brewers' 9,067 carries gametype
`T` — Game 163 against the Cubs, which decided the NL Central. It's classified
as postseason, so the site shows 2018 as **95–67** where MLB counted it as a
regular-season game and reference sources say **96–67**. The tests pin the
current answer and name the discrepancy rather than settling it. Related:
`ROUND_ORDER` has no `T` entry, so it compares as `undefined` and loses to every
named round — which gives the right answer for 2018 by omission rather than by
decision. A season whose only postseason game was a lost tiebreaker is untested
territory.

**`/records/perfect-seasons` still says "perfect".** The label is now
"Undefeated" everywhere it's read — 1929 went 12–0–1, and in football "perfect"
means no losses *and* no ties. The slug is a live URL with a social card at
`/og/records/perfect-seasons.png`, so changing it needs a redirect. The label
and the slug are allowed to disagree when only one is read by a person.

**`lib/seasons.js` isn't testable** in either repo. It reads the CSV at import
time and calls ESPN, and the pure state machine — the
offseason/undefeated/champions logic — isn't exported. It's the module most
likely to break silently in September and the only significant one the suites
can't reach.

**Where shared code lives.** Monorepo, a shared repo consumed by both, or two
repos with a byte-identical directory and CI failing on drift. Downstream of the
data question above; easier to answer once the code repo is small.
