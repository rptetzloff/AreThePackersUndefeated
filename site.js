// What this site calls things.
//
// Everything here is a value rather than a rule. The compute functions in
// records-core.js and h2h-core.js work out what happened; this decides how it
// is said. Splitting them is what lets the same computation serve a baseball
// site and a football one — the Brewers repo has a file of this shape and a
// different set of answers, and the diff between the two is the whole list of
// what a shared core has to be told rather than assume.
//
// Pure data, no imports. It has to be readable from the browser, from the
// server and from a test without dragging anything with it.
//
// Three kinds of thing live here, and they are different:
//
//   nouns    what to call the team, the sport's units, its championship
//   rules    where two sports genuinely disagree about what counts
//   copy     lines a template gets wrong, kept as words rather than derived
//
// The third exists because substitution is not translation. "The Packers have
// never thrown a no-hitter" is a sentence a template would happily generate
// and no football fan would ever write.

export const SITE = {
	// --- identity ---

	/** Short name, used mid-sentence and in titles. */
	team: 'Packers',
	/** Full name, used the first time in a description so a search result
	 *  reads as a whole thought rather than a fragment. */
	fullName: 'Green Bay Packers',

	// --- the sport's vocabulary ---

	/** What a score is made of. Used in prose.
	 *
	 *  The chart labels below are NOT derived from it, which was the first
	 *  attempt. Football says "Points For" and baseball says "Runs Scored" —
	 *  different verbs, not just different nouns — so `${scoreNoun} For` gives
	 *  "Runs For", which nobody writes. Substitution is not translation here
	 *  either, so both labels are spelled out. */
	scoreNoun: 'points',
	scoreForLabel: 'Points For',
	scoreAgainstLabel: 'Points Against',
	/** The trophy. Used wherever a season's ending is described. */
	championship: 'Super Bowl',
	/** What the person in charge is called. This is why one site has
	 *  coaches.html and the other managers.html, and it is the smallest change
	 *  that lets those be one page. */
	leaderNoun: 'coach',
	leaderPlural: 'coaches',
	/** What a season finished without a loss is called.
	 *
	 *  Not "perfect". In football that means no losses AND no ties — 1972
	 *  Miami is the perfect season, and it is the only one. 1929 Green Bay
	 *  went 12–0–1 with a scoreless tie against Frankford, which is
	 *  undefeated. This site is named for the distinction, so it may as well
	 *  observe it.
	 *
	 *  Baseball has no word for this because it has never happened. */
	losslessSeasonNoun: 'Undefeated',

	/** What a single game against an opponent is called, and its plural.
	 *
	 *  The plural is spelled out rather than derived. English does not add 's'
	 *  reliably — a sport calling these "clashes" or "matches" gets "clashs"
	 *  and "matchs" from the obvious implementation, and the leaderNoun below
	 *  already carries its plural for exactly this reason. Two words are
	 *  cheaper than a pluralisation rule that will be wrong eventually. */
	meetingNoun: 'meeting',
	meetingPlural: 'meetings',

	/** Which team this deployment is about.
	 *
	 *  Declared for the shape the Brewers repo already uses, and NOT yet doing
	 *  anything here — that repo selects rows by team id out of league-wide
	 *  data, and this one's CSV carries no team ids at all. It is already
	 *  flattened to one club's point of view, with an Opponent column and no
	 *  indication of who the other side of it was.
	 *
	 *  So this is the field that says what still has to change: moving to a
	 *  league-wide feed with team ids is what makes this code servable for
	 *  another franchise, and until then the value is documentation.
	 *
	 *  GB is the nflverse code; GNB appears in some other sources. */
	teamIds: ['GB'],

	// --- rules, not words ---

	/** Whether a win streak may continue across a season boundary.
	 *
	 *  True here and false for baseball, and both are right. Seventeen games
	 *  make the cross-season run the record worth quoting — the longest in
	 *  this franchise's history ran from December 2010 into December 2011.
	 *  Across 162 games the within-season streak is what anyone means.
	 *
	 *  This is the one place the two sites' compute functions genuinely
	 *  disagree today. Naming it here is what turns "do not merge these two
	 *  implementations" into one implementation that is told which sport it
	 *  is serving. */
	streaksSpanSeasons: true,

	/** Whether a season with no losses is a plausible thing to celebrate.
	 *  Both sports compute it; only one of them has ever had a fan look for
	 *  it, which changes whether an empty list needs an apology. */
	perfectSeasonIsPlausible: true,

	// --- which records this sport has ---

	/** The record cards this site publishes, in display order.
	 *
	 *  Not a formatting detail: the Brewers list has twenty entries including
	 *  no-hitters, perfect games, cycles and triple plays, which have no
	 *  football counterpart at all. A shared core computes what it is asked
	 *  for, and this is the asking. */
	records: [
		'best-starts',
		'perfect-seasons',
		'win-streaks',
		'worst-starts',
		'lopsided-wins',
		'worst-losses',
		'ties',
	],

	// --- copy a template would get wrong ---

	/** Lines that carry voice or a sport-specific fact, kept as sentences.
	 *
	 *  Each one is here because deriving it produced something false or
	 *  charmless. They are the exception and should stay few; anything that is
	 *  really just a noun belongs above. */
	copy: {
		/** Shown only when the undefeated-seasons list comes back empty — which
		 *  for this site it never does, because 1929 finished 12–0–1.
		 *
		 *  Unreachable on both sites, in fact. An earlier version of this
		 *  comment said it was "genuinely needed by the Brewers"; it is not.
		 *  That site computes perfectSeasons and publishes no card for it —
		 *  perfect-seasons is absent from its twenty slugs, and the similarly
		 *  named perfect-games is a different record entirely. So the line has
		 *  no reader today on either deployment.
		 *
		 *  It stays because it has a reader tomorrow. A third team hosting this
		 *  code with no undefeated season in its history — most of the league —
		 *  renders exactly this, and a card whose empty state is blank is worse
		 *  than one that says why it is empty.
		 *
		 *  An earlier version also called a missing undefeated season "a joke
		 *  here", which read as a claim that the Packers had none. They have
		 *  one, the site renders it, and a test pins that. */
		noLosslessSeason: 'No Packers season has finished without a loss. Yet.',
		/** Tone. A blowout loss gets a shrug rather than a statistic. */
		worstLossAside: "We don't talk about it.",
		/** Same. */
		worstStartAside: 'It happens to the best of us.',
		/** Ties are ordinary here and nearly extinct in baseball. */
		noTies: 'The Packers have never tied a game.',
	},
}

/** The default export every module reaches for. Kept as a named constant too
 *  so a test can build a different one and pass it in. */
export default SITE
