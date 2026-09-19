# Design notes

## The one idea

Every verse of a handful of founding texts, embedded with one multilingual model, laid out in two dimensions, and drawn as a terrain whose height is density. The regions where every tradition piles up are the common ground; a region of one colour is a tradition's own. On top: search by meaning (a sentence embedded and placed), the nearest verse in every other text, region names, and hand-curated walks.

The texts, to start: the Hebrew Bible, the Gospels, the Quran, the Bhagavad Gita, the Dhammapada, the Tao Te Ching, the Analects. Originals where an open edition exists, with a public-domain translation beside each.

## Placement

`src/space.js` is the one placement function: unit-square coordinates from the layout, plus a height, to world space. Every layer draws through it so the scene can be reshaped together later (a tilt into 3D relief, time as depth).

## The camera

`src/camera.js` has two freedoms: the point on the ground it looks at and its distance from it. Tilt and heading are fixed, so the ground never turns and a drag always slides it; a zoom keeps the ground under the pointer where it is (the target moves toward that point by the same factor as the distance), which is what makes diving into a ridge feel aimed. Home is the distance at which the whole ground fits the width of the screen, so a phone starts further back; a resize refits only until the viewer has moved.

## Kinship

A verse's kinship is its mixing score against chance: the share of its fifteen nearest neighbours that come from other texts, divided by the share a shuffle would give its text, capped at one. Without the division a small text is shared just for being small. In reading order every verse shines by its kinship, so a band reads as a strip chart of where its book speaks to the others: Psalms, Job and the prophets glow, Leviticus and Numbers go dark, the Gospels glow almost throughout. The kinship slider (or `[` and `]`) sets a threshold below which verses all but go out, in either order; the hit test ignores a dimmed verse.

## Kin, search and regions

`scripts/kin.py` derives three things from the cached embeddings. **Kin**: for every verse, its nearest verse in each text (itself excluded), as a `uint16` index and a `uint8` cosine per text in `public/data/kin.bin`; the page draws six arcs from the verse under the pointer to its kin and lists them on the card. The cosines are all crowded between 0.85 and 0.92, so they are not shown. **Search**: the full 384-dimensional embeddings as `int8` rows with a scale each in `public/data/embed.bin` (13 MB, fetched only when someone searches). Reducing them with PCA was tried and rejected: at 128 dimensions the compact search agreed with the full one on the nearest verse only 42% of the time, at 256 only 52%, at the full width 97%. In the browser, `src/search.js` runs as you type (a 220 ms beat after the last key) and answers by words at once (every word present) and by meaning once `transformers.js` has fetched the same e5 model (118 MB, cached by the browser); the query is embedded with the same `query:` prefix the verses were, and every verse is scored by dot product in a few milliseconds. Hits stay lit and everything else dims; the results list is the nearest verse in each text. **Regions**: k-means on the map coordinates into 24 clusters, each summarised by its top TF-IDF words and book shares, printed with `--print` and named by hand in `scripts/region-names.json`; a label sits on each region's densest spot and yields to a bigger neighbour it would touch. The names are editorial and say what the region mostly holds, not what it must.

## Landmarks

`public/data/landmarks.json` names forty-odd passages people already know (Psalm 23, the Beatitudes, the Throne Verse, the opening of the Tao Te Ching, the Golden Rule in each text). Each is labelled where its verse sits, in either order, flying with it during the morph, and yields to region labels and to each other when crowded. They are a way in for a newcomer, not a canon.

## The guide

The three dimensions are explained on the scene rather than in a paragraph: a rule up the highest peak for height (how many verses stand here), a dashed span between the two largest regions furthest apart for distance (how alike in meaning), and a note by the legend for colour. In reading order the rule runs along the first band for reading order and a note sits by the kinship slider for brightness. It opens on the first visit and any move of the hand dismisses it; the "how to read it" pill brings it back.

## Hover

Every verse's place on screen is projected once per view (the cache is keyed on the camera matrix, the morph value and the canvas size), so a pointer move is a plain loop over 34,000 screen points rather than 34,000 projections. A verse shows once the pointer has rested on it for 40 ms and is let go only after the pointer has been off every verse for 120 ms, so the card does not blink between neighbouring points, though the threads go the instant the pointer leaves the verse; the card stays while the pointer is on it, so the kin it lists can be followed, and a verse reached that way is held until the pointer finds another. The hash always names the verse in hand.

## Click and walk

A click on a verse holds it: the card stays while the pointer wanders, until the pointer rests on another verse or empty ground is clicked. A click on one of its six kin, on the ground or in the card, steps to it: the camera slides over at its current height and the steps make a trail drawn as a dim gold line; a click on a verse that is not a kin of the last step starts a new walk. The walk rides in the hash (`w=<ref>|<ref>…`, the last 24 steps; references hold dots and commas but never a bar) so it can be shared, and a shared link opens on its last verse. A dive on click, the camera coming down to the verse, was built and taken out again: the card should stay put without the view moving.

## Permalinks

The URL hash carries the moment and nothing else: `reading` for the order, `v=<reference>` for a pinned verse (the page opens on it, flown to, with no opening flight), `q=<query>` for a search.

## Two orders

Every verse has two places: where it sits in its book, and where its meaning puts it. The page opens on the second, the terrain. Reading order lays each text out as a band with its verses left to right and a seam between its books (names appear once a book is wide enough on screen to carry one). The toggle runs the flight: the terrain sinks and every verse flies to its band, each one leaving a little after the one before it in its book, and back again the books unravel into the landscape. The toggle at the bottom right (`r`, `m`, or space) runs the same flight either way; `#reading` in the URL opens on the bands and stays there.

The flight is a single uniform. The points carry both positions as attributes and the vertex shader blends them (with a per-verse delay, an easing, and a low arc so the motion reads as flight), so 34,000 verses move without touching a buffer; the hit test recomputes the same blend for the one verse it needs. The terrain is flattened by scaling the mesh and its colour fades with the same value, so the ground and the verses arrive together.

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

