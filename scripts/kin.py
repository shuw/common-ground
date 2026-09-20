# From the cached embeddings: (1) every verse's nearest verse in each text, with the cosine, as a compact
# binary the page can load; (2) the embeddings reduced to 128 dimensions and quantised to int8 so the page
# can search by meaning without a server; (3) regions: clusters of the layout, each with its top words and a
# few sample verses, printed so they can be named by hand in scripts/region-names.json.
import json, os, sys, time
import numpy as np

MODEL = os.environ.get('MODEL', 'intfloat/multilingual-e5-small')
corpus = json.load(open('public/data/corpus.json'))
layout = json.load(open('public/data/layout.json'))
verses = corpus['verses']; texts = list(corpus['texts'].keys())
E = np.load(f'raw/embeddings-{MODEL.split("/")[-1]}.npy').astype(np.float32)
assert E.shape[0] == len(verses) == len(layout['uv'])
N, D = E.shape
tid = np.array([texts.index(v[0]) for v in verses])
print(N, 'verses', D, 'dims', len(texts), 'texts')

# --- kin: for every verse, its nearest verse in each text (itself excluded), as uint16 index and uint8 cosine
t0 = time.time()
kin_idx = np.zeros((N, len(texts)), dtype=np.uint16); kin_sim = np.zeros((N, len(texts)), dtype=np.uint8)
for t, name in enumerate(texts):
    members = np.where(tid == t)[0]; M = E[members]
    for s in range(0, N, 2048):
        S = E[s:s + 2048] @ M.T
        own = np.where(tid[s:s + 2048] == t)[0]
        S[own, members.searchsorted(np.arange(s, s + 2048)[own])] = -2  # a verse is not its own kin
        j = S.argmax(axis=1)
        kin_idx[s:s + 2048, t] = members[j]; kin_sim[s:s + 2048, t] = np.clip(S[np.arange(len(j)), j] * 255, 0, 255).astype(np.uint8)
print(f'kin in {time.time() - t0:.0f}s')
with open('public/data/kin.bin', 'wb') as f: f.write(kin_idx.tobytes()); f.write(kin_sim.tobytes())
print('public/data/kin.bin', os.path.getsize('public/data/kin.bin') // 1024, 'KB')

# --- compact embeddings for the browser: PCA to 128 dims, int8 with a per-verse scale
from sklearn.decomposition import PCA
rng = np.random.default_rng(3); sample = rng.choice(N, 500, replace=False)
full = (E[sample] @ E.T); full[np.arange(500), sample] = -2; full_top = full.argmax(axis=1); full_top5 = np.argsort(-full, axis=1)[:, :5]
def compact(K):
    pca = PCA(n_components=K, random_state=0).fit(E) if K < D else None
    P = (pca.transform(E) if pca else E).astype(np.float32)
    scale = np.abs(P).max(axis=1) / 127.0
    Q = np.round(P / scale[:, None]).astype(np.int8)
    Pq = Q.astype(np.float32) * scale[:, None]; comp = (P[sample] @ Pq.T); comp[np.arange(500), sample] = -2
    top = comp.argmax(axis=1); top5 = np.argsort(-comp, axis=1)[:, :5]
    in5 = np.mean([full_top[i] in top5[i] for i in range(500)])
    print(f'  K={K}: top-1 agreement {np.mean(full_top == top) * 100:.0f}%, full top-1 within compact top-5 {in5 * 100:.0f}%')
    return pca, P, scale, Q
print('compact search against the full one, on 500 sample verses:')
for K in (128, 192, 256, 384): pca, P, scale, Q = compact(K)
K = int(os.environ.get('DIMS', 384)); pca, P, scale, Q = compact(K)
mean = pca.mean_ if pca else np.zeros(D, np.float32); comps = pca.components_ if pca else np.eye(D, dtype=np.float32)
with open('public/data/embed.bin', 'wb') as f:  # header, then (if projected) mean D and components K x D, then per-verse scale, then int8 rows
    f.write(np.array([N, K, D, 1 if K < D else 0], dtype=np.uint32).tobytes())
    if K < D: f.write(mean.astype(np.float32).tobytes()); f.write(comps.astype(np.float32).tobytes())
    f.write(scale.astype(np.float32).tobytes()); f.write(Q.tobytes())
print('public/data/embed.bin', os.path.getsize('public/data/embed.bin') // 1024, 'KB')

# --- regions: clusters on the map, named by hand
from sklearn.cluster import KMeans
from sklearn.feature_extraction.text import TfidfVectorizer
UV = np.array(layout['uv'], dtype=np.float32)
R = int(os.environ.get('REGIONS', 28))
km = KMeans(n_clusters=R, n_init=4, random_state=7).fit(UV)
lab = km.labels_
names = json.load(open('scripts/region-names.json')) if os.path.exists('scripts/region-names.json') else {}
tf = TfidfVectorizer(stop_words='english', min_df=3, max_df=0.5, sublinear_tf=True)
docs = [' '.join(v[2] for v in np.array(verses, dtype=object)[lab == r]) for r in range(R)]
X = tf.fit_transform(docs); vocab = np.array(tf.get_feature_names_out())
dens = np.array(layout['density']['values'], dtype=np.float32).reshape(layout['density']['size'], -1)
G = dens.shape[0]
regions = []
for r in range(R):
    m = np.where(lab == r)[0]
    top = vocab[np.argsort(-X[r].toarray()[0])[:8]]
    share = {t: int((tid[m] == i).sum()) for i, t in enumerate(texts)}
    # the label sits on the densest spot of the region rather than its centroid, which may be off the mass
    gi = np.clip((UV[m, 1] * G).astype(int), 0, G - 1); gj = np.clip((UV[m, 0] * G).astype(int), 0, G - 1)
    peak = m[np.argmax(dens[gi, gj])]
    entry = {'id': r, 'name': names.get(str(r), ''), 'words': list(top), 'n': int(len(m)), 'u': round(float(UV[peak, 0]), 4), 'v': round(float(UV[peak, 1]), 4), 'share': share}
    regions.append(entry)
    if '--print' in sys.argv:
        books = {}
        for i in m: b = verses[i][1].rsplit(' ', 1)[0] if verses[i][0] in ('torah', 'gospels') else corpus['texts'][verses[i][0]]['name']; books[b] = books.get(b, 0) + 1
        print(f"\n[{r}] n={len(m)} {' · '.join(top)}  share={ {k: v for k, v in share.items() if v} }  books={dict(sorted(books.items(), key=lambda kv: -kv[1])[:5])}")
        for i in rng.choice(m, min(4, len(m)), replace=False): print(f'   {verses[i][1]}: {verses[i][2][:110]}')
# finer clusters, each named by the book that dominates it, for labels that appear as the camera comes closer
F = int(os.environ.get('FINE', 140))
fk = KMeans(n_clusters=F, n_init=2, random_state=11).fit(UV)
sura_names = [name for name, _ in corpus['texts']['quran']['books']]
book_of_verse = []
for v in verses:
    t, ref = v[0], v[1]
    if t in ('torah', 'gospels'): book_of_verse.append(ref.rsplit(' ', 1)[0])
    elif t == 'quran': book_of_verse.append(sura_names[int(ref.split()[1].split(':')[0]) - 1])
    else: book_of_verse.append(corpus['texts'][t]['name'])
# each fine cluster is named by its three most telling words (a book name when one book fills most of it)
ftf = TfidfVectorizer(stop_words='english', min_df=3, max_df=0.4, sublinear_tf=True)
fdocs = [' '.join(verses[i][2] for i in np.where(fk.labels_ == r)[0]) for r in range(F)]
FX = ftf.fit_transform(fdocs); fvocab = np.array(ftf.get_feature_names_out())
fine = []
for r in range(F):
    m = np.where(fk.labels_ == r)[0]
    books = {}
    for i in m: books[(verses[i][0], book_of_verse[i])] = books.get((verses[i][0], book_of_verse[i]), 0) + 1
    (t, b), n = max(books.items(), key=lambda kv: kv[1])
    words = [w for w in fvocab[np.argsort(-FX[r].toarray()[0])[:6]] if not w.isdigit() and "'" not in w][:3]
    c = UV[m].mean(axis=0); radius = float(np.sqrt(((UV[m] - c) ** 2).sum(axis=1).mean()))
    fine.append({'u': round(float(c[0]), 4), 'v': round(float(c[1]), 4), 'r': round(radius, 4), 'n': int(len(m)), 'text': t, 'name': b if n / len(m) >= 0.6 else ' · '.join(words)})
json.dump({'k': R, 'regions': regions, 'label': [int(x) for x in lab], 'fine': fine}, open('public/data/regions.json', 'w'), separators=(',', ':'))
print('public/data/regions.json', os.path.getsize('public/data/regions.json') // 1024, 'KB', 'named', sum(1 for r in regions if r['name']))
