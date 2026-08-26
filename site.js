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

	/** What a score is made of. Baseball scores runs, football scores points,
	 *  and every "runs for / runs against" label depends on this. */
	scoreNoun: 'points',
	/** The trophy. Used wherever a season's ending is described. */
	championship: 'Super Bowl',
	/** What the person in charge is called. This is why one site has
	 *  coaches.html and the other managers.html, and it is the smallest change
	 *  that lets those be one page. */
	leaderNoun: 'coach',
	leaderPlural: 'coaches',
	/** What a single game against an opponent is called, and its plural.
	 *
	 *  The plural is spelled out rather than derived. English does not add 's'
	 *  reliably — a sport calling these "clashes" or "matches" gets "clashs"
	 *  and "matchs" from the obvious implementation, and the leaderNoun below
	 *  already carries its plural for exactly this reason. Two words are
	 *  cheaper than a pluralisation rule that will be wrong eventually. */
	meetingNoun: 'meeting',
	meetingPlural: 'meetings',

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
		/** A missing perfect season is a joke here and a statistical
		 *  certainty in baseball, so the two sites cannot share the line. */
		noPerfectSeason: 'No Packers season has finished without a loss. Yet.',
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
