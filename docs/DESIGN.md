# Design notes

## The one idea

Every verse of a handful of founding texts, embedded with one multilingual model, laid out in two dimensions, and drawn as a terrain whose height is density. The regions where every tradition piles up are the common ground; a region of one colour is a tradition's own. On top: search by meaning (a sentence embedded and placed), the nearest verse in every other text, region names, and hand-curated walks.

The texts, to start: the Hebrew Bible, the Gospels, the Quran, the Bhagavad Gita, the Dhammapada, the Tao Te Ching, the Analects. Originals where an open edition exists, with a public-domain translation beside each.

## Placement

`src/space.js` is the one placement function: unit-square coordinates from the layout, plus a height, to world space. Every layer draws through it so the scene can be reshaped together later (a tilt into 3D relief, time as depth).

## First milestone

A corpus inventory and an embedding run, to see whether the terrain has real structure before anything is designed.
