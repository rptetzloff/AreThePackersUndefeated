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

### ~~Site manifest~~ — in review
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

### Neutral row keys, with a team selector
The blocker for a shared core: the row keys embed the team name.

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
