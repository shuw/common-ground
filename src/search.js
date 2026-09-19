// Search: by words at once, and by meaning once the embedding model has arrived. The meaning search runs in
// the browser: the same model that placed the verses embeds the query, and the verses' embeddings, kept as
// int8 rows with a scale each, are scored by dot product. Nothing leaves the page.
const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js';
const MODEL = 'Xenova/multilingual-e5-small';

export class Search {
  constructor(base, corpus) { this.base = base; this.corpus = corpus; this.index = null; this.embed = null; this.loading = null; }

  /** Verses containing every word of the query, best first: more of the verse matched wins, then shorter. */
  byWords(q) {
    const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
    if (!words.length) return [];
    const hits = [];
    this.corpus.verses.forEach(([, , text], i) => {
      const t = text.toLowerCase();
      for (const w of words) if (!t.includes(w)) return;
      hits.push([i, words.join(' ').length / t.length]);
    });
    return hits.sort((a, b) => b[1] - a[1]).map(([i]) => i);
  }

  async loadIndex(onProgress) {
    if (this.index) return this.index;
    const res = await fetch(`${this.base}data/embed.bin`);
    const total = +res.headers.get('content-length') || 0, reader = res.body.getReader(), chunks = []; let got = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); got += value.length; onProgress?.('index', total ? got / total : 0); }
    const buf = new Uint8Array(got); let o = 0; for (const c of chunks) { buf.set(c, o); o += c.length; }
    const head = new Uint32Array(buf.buffer, 0, 4), [N, K, D, projected] = head; let off = 16;
    let mean = null, comps = null;
    if (projected) { mean = new Float32Array(buf.buffer, off, D); off += D * 4; comps = new Float32Array(buf.buffer, off, K * D); off += K * D * 4; }
    const scale = new Float32Array(buf.buffer, off, N); off += N * 4;
    const rows = new Int8Array(buf.buffer, off, N * K);
    this.index = { N, K, D, mean, comps, scale, rows };
    return this.index;
  }

  async loadModel(onProgress) {
    if (this.embed) return this.embed;
    if (!this.loading) this.loading = (async () => {
      const { pipeline, env } = await import(/* @vite-ignore */ LIB);
      env.allowLocalModels = false;
      const files = {};
      const extractor = await pipeline('feature-extraction', MODEL, { dtype: 'q8', progress_callback: (p) => {
        if (p.status === 'progress' && p.total) { files[p.file] = [p.loaded, p.total]; const v = Object.values(files); onProgress?.('model', v.reduce((s, [a]) => s + a, 0) / v.reduce((s, [, b]) => s + b, 0)); }
      } });
      this.embed = async (text) => { const out = await extractor('query: ' + text, { pooling: 'mean', normalize: true }); return Float32Array.from(out.data); };
      return this.embed;
    })();
    return this.loading;
  }

  /** Every verse scored against the query, best first. */
  async byMeaning(q, onProgress) {
    const [index, embed] = await Promise.all([this.loadIndex(onProgress), this.loadModel(onProgress)]);
    let v = await embed(q);
    const { N, K, D, mean, comps, scale, rows } = index;
    if (mean) { const p = new Float32Array(K); for (let k = 0; k < K; k++) { let s = 0; for (let d = 0; d < D; d++) s += (v[d] - mean[d]) * comps[k * D + d]; p[k] = s; } v = p; }
    if (!this.lengthPrior) this.lengthPrior = Float32Array.from(this.corpus.verses, ([, , t]) => Math.min(1, 0.97 + 0.006 * t.split(' ').length)); // a two-word fragment should not win on a whim
    const scores = new Float32Array(N), prior = this.lengthPrior;
    for (let i = 0, o = 0; i < N; i++, o += K) { let s = 0; for (let k = 0; k < K; k++) s += rows[o + k] * v[k]; scores[i] = s * scale[i] * prior[i]; }
    const order = Array.from(scores.keys()).sort((a, b) => scores[b] - scores[a]);
    return { order, scores };
  }
}
