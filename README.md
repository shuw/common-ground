# Common Ground

Every verse of seven founding texts, placed by what it means. Where the colours pile up, the traditions say the same thing.

Not yet running anywhere. See [docs/DESIGN.md](docs/DESIGN.md) for how it is made and what to be careful of.

## Running it

```sh
npm install
npm run dev
```

`npm test` runs the checks.

## Using it

The page opens on the terrain, with a short guide to what height, distance and colour mean; the "how to read it" pill brings it back. Search at the top (`/`) finds verses as you type, by words at once and by meaning once the model has loaded in the browser; the results are the nearest verse in each text. Rest on a verse for threads to its nearest kin in every other text and a card that lists them; move onto the card to follow one, or step to the verses around it. Click a verse to dive in among its kin, click a kin to walk on and leave a trail, click empty ground to climb out. The link in the address bar always points at the verse in hand, and at the walk. Named regions appear on the terrain, and landmark passages people know are labelled where they sit; click one to read it. Drag to slide the ground, scroll or pinch to zoom toward the pointer; arrow keys and `+`/`-` do the same, `x` (or the reset button) resets the view. The toggle at the bottom right flies between reading order and meaning: `r`, `m`, or space to switch. The kinship slider dims the verses whose neighbourhood is less shared than the threshold, so what stays lit is the common ground. `?` lists every key; `Esc` lets go of a pinned verse. `#reading` in the URL opens on the bands.
