# Design notes

## The one idea

Every verse of a handful of founding texts, embedded with one multilingual model, laid out in two dimensions, and drawn as a terrain whose height is density. The regions where every tradition piles up are the common ground; a region of one colour is a tradition's own. On top: search by meaning (a sentence embedded and placed), the nearest verse in every other text, region names, and hand-curated walks.

The texts, to start: the Hebrew Bible, the Gospels, the Quran, the Bhagavad Gita, the Dhammapada, the Tao Te Ching, the Analects. Originals where an open edition exists, with a public-domain translation beside each.

## Placement

`src/space.js` is the one placement function: unit-square coordinates from the layout, plus a height, to world space. Every layer draws through it so the scene can be reshaped together later (a tilt into 3D relief, time as depth).

## The camera

`src/camera.js` has two freedoms: the point on the ground it looks at and its distance from it. Tilt and heading are fixed, so the ground never turns and a drag always slides it; a zoom keeps the ground under the pointer where it is (the target moves toward that point by the same factor as the distance), which is what makes diving into a ridge feel aimed. Home is the distance at which the whole ground fits the width of the screen, so a phone starts further back; a resize refits only until the viewer has moved.

## Shared ground

A verse's shared ground (called kinship in the code, and on the card until the word proved to suggest a pair) is its mixing score against chance: the share of its fifteen nearest neighbours that come from other texts, divided by the share a shuffle would give its text, capped at one. Without the division a small text is shared just for being small. In reading order every verse shines by its kinship, so a band reads as a strip chart of where its book speaks to the others: Psalms, Job and the prophets glow, Leviticus and Numbers go dark, the Gospels glow almost throughout. A kinship slider that dimmed verses below a threshold was built and removed once the reading playhead arrived: two dimming controls at the bottom were one too many, and the reading-order brightness already tells the story. The threshold uniform remains in the shader at zero.

## Kin, search and regions

`scripts/kin.py` derives three things from the cached embeddings. **Kin**: for every verse, its nearest verse in each text (itself excluded), as a `uint16` index and a `uint8` cosine per text in `public/data/kin.bin`; the page draws six arcs from the verse under the pointer to its kin and lists them on the card. The cosines are all crowded between 0.84 and 0.92, so the number is not shown; instead each kin carries a short bar filled in fifths (dots were tried first and read as a rating), each level a fifth of the surviving nearest-kin pairs (boundaries at cosine 0.875, 0.882, 0.890 and 0.906; a linear scale over the band was tried and gave nearly everything three dots), with the raw cosine in the tooltip, listed closest first, so six weak matches do not read like six strong ones; a kin below cosine 0.867, the weakest 30% of all pairs, is not shown at all, on the card or as a thread (that leaves 70% of kin, a median of five per verse, and 2.6% of verses with none); the bar's fifths are quintiles of the pairs that survive, and one-fifth kin are dimmed. **Search**: the full 384-dimensional embeddings as `int8` rows with a scale each in `public/data/embed.bin` (13 MB, fetched only when someone searches). Reducing them with PCA was tried and rejected: at 128 dimensions the compact search agreed with the full one on the nearest verse only 42% of the time, at 256 only 52%, at the full width 97%. In the browser, `src/search.js` runs as you type (a 220 ms beat after the last key) and answers by words at once (every word present) and by meaning once `transformers.js` has fetched the same e5 model (118 MB, cached by the browser); the query is embedded with the same `query:` prefix the verses were, and every verse is scored by dot product in a few milliseconds. Hits stay lit and everything else dims; the results list is the nearest verse in each text. **Regions**: k-means on the map coordinates into 24 clusters, each summarised by its top TF-IDF words and book shares, printed with `--print` and named by hand in `scripts/region-names.json`; a label sits on each region's densest spot and yields to a bigger neighbour it would touch. The names are editorial and say what the region mostly holds, not what it must.

## Labels by level

Four levels of label share one crowding rule, each yielding to the ones above it: the 24 named regions; 40 landmark passages; 140 finer clusters, each named by its three most telling words (or a book when one fills most of it), fading in once the cluster is more than forty pixels across on screen; and, when the camera is within about a ground-width and a half, verse references beside the points nearest the centre of the view, up to 36 at a time. Zooming in therefore keeps adding names rather than emptying the view.

## Widths

One breakpoint, 640 px, decides the phone layout (key hints and legend hidden, the search box under the title, the card at the bottom with its kin folded); a tablet band up to 1000 px keeps the desktop layout but drops the search box under the title so it cannot collide with the tools. The breakpoint is read live: crossing it re-renders the card, and a view left at home refits home as the window changes, while a view the reader has moved is left alone. The card stack scrolls inside the room above the reading bar.

## Landmarks

`public/data/landmarks.json` names forty-odd passages people already know (Psalm 23, the Beatitudes, the Throne Verse, the opening of the Tao Te Ching, the Golden Rule in each text). Each is labelled where its verse sits, in either order, flying with it during the morph, and yields to region labels and to each other when crowded. They are a way in for a newcomer, not a canon.

## The guide

The three dimensions are explained on the scene rather than in a paragraph, under a scrim that dims the map and its labels: an intro card at the top left, a rule up the highest peak in the nearer half of the ground for height (how many verses stand here) with a leader to its label, a dashed span dotted at both ends between the two largest regions furthest apart for distance (how alike in meaning), and a note by the legend for colour. In reading order the rule runs along the first band for reading order and a note sits by the kinship slider for brightness. It opens on the first visit and any move of the hand dismisses it; the "how to read it" pill brings it back.

## Hover

Every verse's place on screen is projected once per view (the cache is keyed on the camera matrix, the morph value and the canvas size), so a pointer move is a plain loop over 34,000 screen points rather than 34,000 projections. A verse shows once the pointer has rested on it for 40 ms and is let go only after the pointer has been off every verse for 120 ms, so the card does not blink between neighbouring points, though the threads start receding into the verse the instant the pointer leaves it, over 100 ms, each kin mark going out as its thread lets go; the card stays while the pointer is on it, so the kin it lists can be followed, and a verse reached that way is held until the pointer finds another. Escape lets go of the verse in hand and keeps it down until the pointer finds another, since the pointer is usually still on it. The hash always names the verse in hand. On a phone the kin cards wait folded behind a tap, since the stack would fill the screen.

## Click and walk

A click on a verse holds it: the card stays while the pointer wanders, until the pointer rests on another verse or empty ground is clicked. A click on one of its six kin, on the ground or in the card, steps to it: the camera slides over at its current height and the steps make a trail drawn as a dim gold line, the last four steps only, older ones fading toward the void so it reads as a wake rather than leftovers; a click on a verse that is not a kin of the last step starts a new walk. The walk rides in the hash (`w=<ref>|<ref>…`, the last 24 steps; references hold dots and commas but never a bar) so it can be shared, and a shared link opens with its last verse held. A dive on click, the camera coming down to the verse, was built and taken out again: the card should stay put without the view moving.

## Along the thread

Resting on a kin card brightens its thread and mark and steps the other five back to a third, so the pair under the pointer is the one on the ground. Clicking a kin card does not jump: a spark of light runs the thread from the verse in hand to the kin over 700 ms, the thread lit beneath it and the view riding along with the spark (blended in from wherever the view was, so there is no jump at the start), and only then does the step land and the new verse beam out. The thread's path is one function, used for drawing, for the spark and for the walk trail.

## Presence from afar

The marks, the ring, the spark and the thread widths have floors in pixels, and the floors grow with the camera's distance, from their close-up size to about 1.8 times it at home, so a hovered verse and its threads are as easy to see from the whole ground as from up close without becoming loud up close.

## Permalinks

The URL hash carries the moment and nothing else: `reading` for the order, `v=<reference>` for the verse in hand (the page opens with it held and its threads drawn, the view left alone, so a refresh changes nothing), `q=<query>` for a search, `t=<percent>` for where the reading stands (a link opens paused there; while playing the hash follows once a second).

## Afloat

At the start of the reading, where every verse is lit, the verses drift on the terrain as if afloat: two slow waves crossing, each verse on its own phase, up to about two hundredths of the ground's width. The drift is computed the same way on the CPU so threads and the hit test stay attached, and the screen cache refreshes every hundredth of a second while it runs. It stays through the reading, but the verse in hand freezes where it was taken (its drift is computed at that instant rather than the current one) so it holds still for a click without moving first. Both effects grow with the camera's distance (a verse at home is a pixel, so a change that reads up close vanishes from afar). Every verse also breathes a little in brightness and size, two rates mixed so it never reads as a beat. The twinkle stays through the reading. `sway=<n>` and `twinkle=<n>` in the hash set the two strengths (0 still; the defaults are 1 and 2) while the right levels are found.

## The reading playhead

One position runs through every text at once, by fraction, a full reading in three minutes, paused at the start until the play button, space, or a drag on the scrubber moves it. At the start every verse is lit and twinkles a little on its own phase; the rolling window fades in over the first few percent of the reading, so dragging the scrubber back to the left lights everything again, and the × beside the scrubber returns there. Escape pauses a playing reading. It sits at the bottom centre. Verses just behind the playhead, the last 4.5% of each text, glow larger and whiter; verses already read stay at 60%; verses ahead sit at 35%. In the meaning view the seven fronts wander the terrain together, each book tracing its own path; in reading order it is a wavefront sweeping left to right. The line under the scrubber names the book each text is in at that moment, in its colour. Darkening the unread verses further was tried and made the map look dead; the levels are set so the map still reads as a whole. A search takes the playhead's light off so the hits are clear.

## Fat lines and the instance count

The threads and the walk trail are `LineSegments2` fat lines. The renderer remembers, the first time it binds a geometry, how many instances its buffers held and never raises that number; a thread set that grew from two arcs on its first frame to six was therefore drawn at two for the rest of its life, which looked like a single ray. After every change of segments the layer forgets that memory (`geometry._maxInstanceCount = undefined`).

## Keys

The keys follow the conventions of maps, players and readers wherever one exists: `/` search, `?` help, Escape dismisses, arrows pan, `+` and `−` zoom, `0` resets the view (every browser's Cmd+0; `z` is kept as a silent alias), space plays and pauses (with `p` as a silent alias), `,` and `.` step frames in players and here step verses, `[` and `]` scrub, `i` opens about, `c` copies a link. `o` flips the order, which has no convention; it is the first letter. A focused control keeps its own keys. The help panel groups them as Move, Read and Panels.

## Nothing zooms but the map

A pinch or ctrl+wheel anywhere on the page zooms the map, never the page: a document-level wheel handler takes every wheel that is not over the canvas or a scrolling panel, and Safari's own gesture events are cancelled. A slider or button lets go of focus as soon as it is used, and the page's keys ignore a focused control, so arrow keys and space go back to the map after a drag on the scrubber.

## The void

The ground where no verse stands is painted the background colour, so the terrain has no visible edge and appears to rise out of the void rather than sit on a plate. The colour is set once in the terrain shader to match the page's ink.

## Two orders

Every verse has two places: where it sits in its book, and where its meaning puts it. The page opens on the second, the terrain. Reading order lays each text out as a band with its verses left to right and a seam between its books (names appear once a book is wide enough on screen to carry one). The toggle runs the flight: the terrain sinks and every verse flies to its band, each one leaving a little after the one before it in its book, and back again the books unravel into the landscape. The toggle at the bottom right (or `o`) runs the same flight either way; `#reading` in the URL opens on the bands and stays there.

The flight is a single uniform. The points carry both positions as attributes and the vertex shader blends them (with a per-verse delay, an easing, and a low arc so the motion reads as flight), so 34,000 verses move without touching a buffer; the hit test recomputes the same blend for the one verse it needs. The terrain is flattened by scaling the mesh and its colour fades with the same value, but on a shorter clock: the ground is flat and dark once the flight is a third done and rises only in the last third of the way back, so the verses leave a bare plain and land on rising ground rather than dragging the mountain with them.

## The corpus

`scripts/build-corpus.py` parses six public-domain translations from `raw/` into `public/data/corpus.json`, one record per verse (or the nearest thing a text has to one): the King James Version for the Hebrew Bible (23,145 verses) and the Gospels (3,779), Pickthall's Quran (6,236), Arnold's Song Celestial for the Gita in stanzas (270), Müller's Dhammapada (405 of 423 verses), Legge's Tao Te Ching in its numbered paragraphs (220) and Legge's Analects by chapter (496, with the Chinese kept beside the English). Each text also lists its books in reading order (the 39 books, the four Gospels, the 114 suras with their names, the Gita's and the Tao's chapters, Müller's chapter titles for the Dhammapada, the Analects' twenty books) so the reading-order view can draw their seams. Arnold's footnotes (`[FN#n]`) are not stanzas. Quirks the parser had to learn: the Gutenberg KJV runs several verses onto one line, so verses are split on their `c:v` markers and books counted by their `1:1`; Legge's Analects put each English chapter in the same paragraph as its Chinese, headed `CHAP.` after the first `CHAPTER`; Legge's Tao Te Ching opens its chapters in four shapes (`Ch. 1. 1.`, `7. 1.`, a bare `6.` before an unnumbered verse, `11.` before a one-paragraph chapter), and a paragraph number can equal the next chapter's number, so the parser trusts the paragraph count first and the chapter count second.

## The layout

`scripts/embed.py` embeds every verse with `intfloat/multilingual-e5-small` (19 seconds on an M3), lays the corpus out with UMAP (30 neighbours, cosine, 30 seconds), scales by the middle 99% so a few outlying islands do not squash the mass into a corner, and writes `public/data/layout.json`: unit-square coordinates, the local density each verse sits in (the terrain height), and a per-verse mixing score. The embeddings are cached in `raw/` so the layout can be re-run in half a minute.

## First milestone: is the terrain real?

Yes. The first layout shows one great mass, the Hebrew Bible, with the Gospels woven through its middle rather than beside it; the Quran as lobes on one flank that overlap the Bible where they meet; the Dhammapada and the Gita as their own lobes on the far edge; the Tao Te Ching and the Analects as separate islands. Mixing, measured as the share of a verse's fifteen nearest neighbours that come from another text, against what a shuffle would give:

| text | foreign share | chance | ratio |
|---|---|---|---|
| Hebrew Bible | 0.08 | 0.33 | 0.24 |
| Gospels | 0.49 | 0.89 | 0.55 |
| Quran | 0.21 | 0.82 | 0.26 |
| Bhagavad Gita | 0.32 | 0.99 | 0.32 |
| Dhammapada | 0.59 | 0.99 | 0.60 |
| Tao Te Ching | 0.60 | 0.99 | 0.60 |
| Analects | 0.08 | 0.99 | 0.08 |

The Gospels, the Dhammapada and the Tao Te Ching keep company with other texts; the Analects almost never do, partly because their unit is a whole chapter rather than a verse. Caveats that stay caveats: these are English translations, so part of the geometry is the translators; the unit of text differs by tradition; and the model is small. Originals for the languages the model knows (Hebrew, Greek, Arabic, Chinese) are the next experiment.

