# Common Ground

Every verse of seven founding texts, placed by what it means. Where the colours pile up, the traditions say the same thing.

Not yet running anywhere. See [docs/DESIGN.md](docs/DESIGN.md) for the plan.

## Running it

```sh
npm install
npm run dev
```

`npm test` runs the checks.

## Using it

The page opens with each text laid out in reading order and unravels into the terrain. Hover a verse to read it, click to pin it. Drag to slide the ground, scroll or pinch to zoom toward the pointer; arrow keys and `+`/`-` do the same, `h` (or the reset button) goes home to the whole ground. The toggle at the bottom right flies between reading order and meaning: `r`, `m`, or space to switch. The kinship slider dims the verses whose neighbourhood is less shared than the threshold, so what stays lit is the common ground. `?` lists every key; `Esc` lets go of a pinned verse. `#reading` in the URL opens on the bands.
