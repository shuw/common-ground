# Design notes

## The one idea

Every verse of a handful of founding texts, embedded with one multilingual model, laid out in two dimensions, and drawn as a terrain whose height is density. The regions where every tradition piles up are the common ground; a region of one colour is a tradition's own. On top: search by meaning (a sentence embedded and placed), the nearest verse in every other text, region names, and hand-curated walks.

The texts, to start: the Hebrew Bible, the Gospels, the Quran, the Bhagavad Gita, the Dhammapada, the Tao Te Ching, the Analects. Originals where an open edition exists, with a public-domain translation beside each.

## Placement

`src/space.js` is the one placement function: unit-square coordinates from the layout, plus a height, to world space. Every layer draws through it so the scene can be reshaped together later (a tilt into 3D relief, time as depth).

## The camera

`src/camera.js` has two freedoms: the point on the ground it looks at and its distance from it. Tilt and heading are fixed, so the ground never turns and a drag always slides it; a zoom keeps the ground under the pointer where it is (the target moves toward that point by the same factor as the distance), which is what makes diving into a ridge feel aimed. Home is the distance at which the whole ground fits the width of the screen, so a phone starts further back; a resize refits only until the viewer has moved.

## Two orders

Every verse has two places: where it sits in its book, and where its meaning puts it. The page opens on the first, each text a band with its verses left to right in reading order, and then lets go: the terrain rises and every verse flies to its place on it, each one leaving a little after the one before it in its book, so a book unravels from its start. The toggle at the bottom right (or `o`) runs the same flight either way; `#reading` in the URL opens on the bands and stays there.

The flight is a single uniform. The points carry both positions as attributes and the vertex shader blends them (with a per-verse delay, an easing, and a low arc so the motion reads as flight), so 34,000 verses move without touching a buffer; the hit test recomputes the same blend for the one verse it needs. The terrain is flattened by scaling the mesh and its colour fades with the same value, so the ground and the verses arrive together.

## The corpus

`scripts/build-corpus.py` parses six public-domain translations from `raw/` into `public/data/corpus.json`, one record per verse (or the nearest thing a text has to one): the King James Version for the Hebrew Bible (23,145 verses) and the Gospels (3,779), Pickthall's Quran (6,236), Arnold's Song Celestial for the Gita in stanzas (270), Müller's Dhammapada (405 of 423 verses), Legge's Tao Te Ching in its numbered paragraphs (155) and Legge's Analects by chapter (496, with the Chinese kept beside the English). Quirks the parser had to learn: the Gutenberg KJV runs several verses onto one line, so verses are split on their `c:v` markers and books counted by their `1:1`; Legge's Analects put each English chapter in the same paragraph as its Chinese, headed `CHAP.` after the first `CHAPTER`; Legge's Tao Te Ching drops the `Ch.` prefix on some chapters.

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
| Tao Te Ching | 0.67 | 1.00 | 0.67 |
| Analects | 0.08 | 0.99 | 0.08 |

The Gospels, the Dhammapada and the Tao Te Ching keep company with other texts; the Analects almost never do, partly because their unit is a whole chapter rather than a verse. Caveats that stay caveats: these are English translations, so part of the geometry is the translators; the unit of text differs by tradition; and the model is small. Originals for the languages the model knows (Hebrew, Greek, Arabic, Chinese) are the next experiment.

