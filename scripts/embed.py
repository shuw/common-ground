# Embeds every verse in public/data/corpus.json with one multilingual model, lays the corpus out in two
# dimensions with UMAP, and writes public/data/layout.json: unit-square coordinates per verse, the local
# density each sits in, and a few honest diagnostics (how mixed each text's neighbourhood is). Also drops
# raw/scratch/layout.png so the terrain can be looked at before anything is built on it.
import json, os, sys, time
import numpy as np

MODEL = os.environ.get('MODEL', 'intfloat/multilingual-e5-small')
corpus = json.load(open('public/data/corpus.json'))
verses = corpus['verses']
ids = [v[0] for v in verses]
texts = list(corpus['texts'].keys())
print(len(verses), 'verses from', len(texts), 'texts')

cache = f'raw/embeddings-{MODEL.split("/")[-1]}.npy'
if os.path.exists(cache) and np.load(cache, mmap_mode='r').shape[0] == len(verses):
    E = np.load(cache); print('embeddings from cache', E.shape)
else:
    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer(MODEL)
    t0 = time.time()
    prefix = 'query: ' if 'e5' in MODEL else ''
    E = model.encode([prefix + v[2] for v in verses], batch_size=64, normalize_embeddings=True, show_progress_bar=True)
    np.save(cache, E); print(f'embedded in {time.time() - t0:.0f}s', E.shape)

# how mixed is each verse's neighbourhood? the share of its 15 nearest neighbours that come from other texts
from sklearn.neighbors import NearestNeighbors
nn = NearestNeighbors(n_neighbors=16, metric='cosine').fit(E)
_, idx = nn.kneighbors(E)
ids_a = np.array(ids)
mixing = (ids_a[idx[:, 1:]] != ids_a[:, None]).mean(axis=1)
print('neighbourhood mixing: share of 15 nearest neighbours from another text, and against chance (1 = as mixed as a shuffle)')
for t in texts:
    m = mixing[ids_a == t]
    if not len(m): continue
    chance = 1 - len(m) / len(verses)  # a text's share of foreign neighbours if verses were shuffled
    print(f'  {corpus["texts"][t]["name"]:14s} foreign {m.mean():.2f}  chance {chance:.2f}  ratio {m.mean() / chance:.2f}')

import umap
t0 = time.time()
reducer = umap.UMAP(n_neighbors=30, min_dist=0.08, metric='cosine', random_state=11)
XY = reducer.fit_transform(E)
print(f'umap in {time.time() - t0:.0f}s')
# a few outlying islands would squash the mass into a corner: scale by the middle 99% and clamp the rest to the margin
lo, hi = np.percentile(XY, 0.5, axis=0), np.percentile(XY, 99.5, axis=0)
UV = np.clip((XY - lo) / (hi - lo), -0.03, 1.03) * 0.92 + 0.04

# density on a grid, for the terrain
G = 256
grid = np.zeros((G, G), dtype=np.float32)
gi = np.clip((UV[:, 1] * G).astype(int), 0, G - 1); gj = np.clip((UV[:, 0] * G).astype(int), 0, G - 1)
np.add.at(grid, (gi, gj), 1)
def blur(a, sigma):
    r = int(3 * sigma); k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2); k /= k.sum()
    a = np.apply_along_axis(lambda row: np.convolve(row, k, mode='same'), 1, a)
    return np.apply_along_axis(lambda col: np.convolve(col, k, mode='same'), 0, a)
dens = blur(grid, 3.0); dens /= dens.max()
height = dens[gi, gj]

os.makedirs('raw/scratch', exist_ok=True)
json.dump({
    'model': MODEL, 'n': len(verses), 'umap': {'n_neighbors': 30, 'min_dist': 0.08, 'metric': 'cosine'},
    'uv': [[round(float(u), 4), round(float(v), 4)] for u, v in UV],
    'height': [round(float(h), 3) for h in height],
    'mixing': [round(float(m), 2) for m in mixing],
    'density': {'size': G, 'values': [round(float(x), 3) for x in dens.flatten()]},
}, open('public/data/layout.json', 'w'), separators=(',', ':'))
print('public/data/layout.json', os.path.getsize('public/data/layout.json') // 1024, 'KB')

# a picture to look at
from PIL import Image, ImageDraw
S = 1400; im = Image.new('RGB', (S, S), (15, 19, 22)); d = ImageDraw.Draw(im, 'RGBA')
colours = {t: tuple(int(corpus['texts'][t]['colour'].lstrip('#')[i:i + 2], 16) for i in (0, 2, 4)) for t in texts}
for (u, v), t in zip(UV, ids):
    x, y = u * S, v * S; d.ellipse([x - 1.6, y - 1.6, x + 1.6, y + 1.6], fill=colours[t] + (150,))
im.save('raw/scratch/layout.png'); print('raw/scratch/layout.png')
