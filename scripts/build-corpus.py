# Parses the raw public-domain translations in raw/ into public/data/corpus.json: one record per verse
# (or the nearest thing a text has to a verse), with the text it belongs to and a reference a reader
# would recognise. Sources and licences are recorded in the file itself.
import json, re, os

RAW = 'raw'
texts = {
  'torah':    {'name': 'Hebrew Bible', 'lang': 'English', 'translation': 'King James Version, 1611', 'source': 'Project Gutenberg #10', 'licence': 'public domain', 'colour': '#6f7fd0', 'url': 'https://www.gutenberg.org/ebooks/10'},
  'gospels':  {'name': 'Gospels', 'lang': 'English', 'translation': 'King James Version, 1611', 'source': 'Project Gutenberg #10', 'licence': 'public domain', 'colour': '#b85c7a', 'url': 'https://www.gutenberg.org/ebooks/10'},
  'quran':    {'name': 'Quran', 'lang': 'English', 'translation': 'Pickthall, 1930', 'source': 'Tanzil.net', 'licence': 'free with attribution', 'colour': '#3fa7a0', 'url': 'https://tanzil.net/trans/en.pickthall'},
  'gita':     {'name': 'Bhagavad Gita', 'lang': 'English', 'translation': 'Arnold, The Song Celestial, 1885', 'source': 'Project Gutenberg #2388', 'licence': 'public domain', 'colour': '#e0993a', 'url': 'https://www.gutenberg.org/ebooks/2388'},
  'dhamma':   {'name': 'Dhammapada', 'lang': 'English', 'translation': 'Müller, 1881', 'source': 'Project Gutenberg #2017', 'licence': 'public domain', 'colour': '#c9a227', 'url': 'https://www.gutenberg.org/ebooks/2017'},
  'tao':      {'name': 'Tao Te Ching', 'lang': 'English', 'translation': 'Legge, 1891', 'source': 'Project Gutenberg #216', 'licence': 'public domain', 'colour': '#7fc4a4', 'url': 'https://www.gutenberg.org/ebooks/216'},
  'analects': {'name': 'Analects', 'lang': 'English', 'translation': 'Legge, 1861', 'source': 'Project Gutenberg #4094', 'licence': 'public domain', 'colour': '#5faa8f', 'url': 'https://www.gutenberg.org/ebooks/4094'},
}
verses = []  # [text id, reference, words, original language text where the edition has it]
book_of = {}  # verse index -> the book, sura or chapter it belongs to, where the reference alone does not say

SURAS = ['Al-Fatihah', 'Al-Baqarah', 'Al-Imran', 'An-Nisa', "Al-Ma'idah", "Al-An'am", "Al-A'raf", 'Al-Anfal', 'At-Tawbah', 'Yunus', 'Hud', 'Yusuf', "Ar-Ra'd", 'Ibrahim', 'Al-Hijr', 'An-Nahl', 'Al-Isra', 'Al-Kahf', 'Maryam', 'Ta-Ha', 'Al-Anbiya', 'Al-Hajj', "Al-Mu'minun", 'An-Nur', 'Al-Furqan', "Ash-Shu'ara", 'An-Naml', 'Al-Qasas', 'Al-Ankabut', 'Ar-Rum', 'Luqman', 'As-Sajdah', 'Al-Ahzab', 'Saba', 'Fatir', 'Ya-Sin', 'As-Saffat', 'Sad', 'Az-Zumar', 'Ghafir', 'Fussilat', 'Ash-Shura', 'Az-Zukhruf', 'Ad-Dukhan', 'Al-Jathiyah', 'Al-Ahqaf', 'Muhammad', 'Al-Fath', 'Al-Hujurat', 'Qaf', 'Adh-Dhariyat', 'At-Tur', 'An-Najm', 'Al-Qamar', 'Ar-Rahman', "Al-Waqi'ah", 'Al-Hadid', 'Al-Mujadilah', 'Al-Hashr', 'Al-Mumtahanah', 'As-Saff', "Al-Jumu'ah", 'Al-Munafiqun', 'At-Taghabun', 'At-Talaq', 'At-Tahrim', 'Al-Mulk', 'Al-Qalam', 'Al-Haqqah', "Al-Ma'arij", 'Nuh', 'Al-Jinn', 'Al-Muzzammil', 'Al-Muddaththir', 'Al-Qiyamah', 'Al-Insan', 'Al-Mursalat', 'An-Naba', "An-Nazi'at", 'Abasa', 'At-Takwir', 'Al-Infitar', 'Al-Mutaffifin', 'Al-Inshiqaq', 'Al-Buruj', 'At-Tariq', "Al-A'la", 'Al-Ghashiyah', 'Al-Fajr', 'Al-Balad', 'Ash-Shams', 'Al-Layl', 'Ad-Duha', 'Ash-Sharh', 'At-Tin', 'Al-Alaq', 'Al-Qadr', 'Al-Bayyinah', 'Az-Zalzalah', 'Al-Adiyat', "Al-Qari'ah", 'At-Takathur', 'Al-Asr', 'Al-Humazah', 'Al-Fil', 'Quraysh', "Al-Ma'un", 'Al-Kawthar', 'Al-Kafirun', 'An-Nasr', 'Al-Masad', 'Al-Ikhlas', 'Al-Falaq', 'An-Nas']
assert len(SURAS) == 114

def read(name):
    return open(os.path.join(RAW, name), encoding='utf-8-sig').read().replace('\r\n', '\n')

def clean(s):
    return re.sub(r'\s+', ' ', s).strip()

def gutenberg_body(s):
    a = s.find('*** START OF'); b = s.find('*** END OF')
    a = s.find('\n', a) + 1 if a >= 0 else 0
    return s[a:b if b > 0 else None]

# --- the King James Bible: every book opens at "1:1", so the k-th "1:1" line begins the k-th book in canon order
BOOKS = ['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua', 'Judges', 'Ruth', '1 Samuel', '2 Samuel', '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles', 'Ezra', 'Nehemiah', 'Esther', 'Job', 'Psalms', 'Proverbs', 'Ecclesiastes', 'Song of Solomon', 'Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi',
         'Matthew', 'Mark', 'Luke', 'John', 'Acts', 'Romans', '1 Corinthians', '2 Corinthians', 'Galatians', 'Ephesians', 'Philippians', 'Colossians', '1 Thessalonians', '2 Thessalonians', '1 Timothy', '2 Timothy', 'Titus', 'Philemon', 'Hebrews', 'James', '1 Peter', '2 Peter', '1 John', '2 John', '3 John', 'Jude', 'Revelation']
def kjv():
    body = gutenberg_body(read('kjv.txt'))
    # verses run on within a paragraph ("23:1 The LORD is my shepherd... 23:2 He maketh me..."), so split on the markers
    text = re.sub(r'[ \t]*\n[ \t]*', ' ', body)
    book = -1; out = []
    for m in re.finditer(r'(\d+):(\d+)\s+(.*?)(?=\s\d+:\d+\s|$)', text, re.S):
        c, v, words = int(m.group(1)), int(m.group(2)), clean(m.group(3))
        if c == 1 and v == 1: book += 1
        if book < 0 or not words: continue
        out.append((BOOKS[book], f'{BOOKS[book]} {c}:{v}', words))
    hebrew = set(BOOKS[:39]); gospel = set(BOOKS[39:43])
    for b, ref, words in out:
        if b in hebrew: verses.append(['torah', ref, words])
        elif b in gospel: verses.append(['gospels', ref, words])

# --- the Quran: Tanzil's "sura|aya|text" lines
def quran():
    for l in read('quran-pickthall.txt').split('\n'):
        if not l or l.startswith('#'): continue
        s, a, t = l.split('|', 2)
        verses.append(['quran', f'Quran {s}:{a}', clean(t)])

# --- the Dhammapada: numbered verses under chapter headings
def dhammapada():
    body = gutenberg_body(read('dhammapada-muller.txt'))
    chapter = ''
    for para in re.split(r'\n\s*\n', body):
        h = re.match(r'^\s*Chapter [IVXL]+\.\s+(.*)$', para.strip())
        if h: chapter = re.sub(r'\s*\(.*\)\.?$', '', clean(h.group(1))).rstrip('.'); continue
        m = re.match(r'^\s*(\d+)\.\s+(.*)$', para, re.S)
        if m and int(m.group(1)) <= 423: verses.append(['dhamma', f'Dhammapada {m.group(1)}', clean(m.group(2))]); book_of[len(verses) - 1] = chapter

# --- the Tao Te Ching: 81 chapters in numbered paragraphs, in four shapes: "Ch. 1. 1. text", "7. 1. text",
# a bare "6." (or "12." then "1.") before an unnumbered verse, and "11. text" for a one-paragraph chapter
def tao():
    body = gutenberg_body(read('tao-legge.txt'))
    ch = 0; para = 0; pending = False
    def add(n, words):
        nonlocal para; para = n
        if len(words) > 20: verses.append(['tao', f'Tao Te Ching {ch}.{n}', words])
    for raw in re.split(r'\n\s*\n', body):
        p = clean(raw)
        if not p or ch >= 81 and p.startswith('THE END'): continue
        m = re.match(r'^(?:Ch\. )?(\d+)\. (\d+)\. (.*)$', p)
        if m and int(m.group(2)) == 1 and ch < int(m.group(1)) <= 81:
            ch = int(m.group(1)); pending = False; add(1, m.group(3)); continue
        m = re.match(r'^(\d+)\.$', p)
        if m and int(m.group(1)) == ch + 1: ch += 1; para = 0; pending = True; continue
        if m and pending and int(m.group(1)) == para + 1: continue  # a bare paragraph number before an unnumbered verse
        m = re.match(r'^(\d+)\. (.*)$', p)
        if m and ch:
            n = int(m.group(1))
            if n == para + 1 and n < 12: add(n, m.group(2)); pending = False; continue
            if n == ch + 1 and n <= 81: ch = n; pending = False; add(1, m.group(2)); continue
        elif pending and ch: add(para + 1, p); pending = False if para > 0 else pending
# --- the Analects: twenty books, each a run of "CHAPTER n. ..." paragraphs (the Chinese lines are skipped for now)
ROMAN = {'I': 1, 'V': 5, 'X': 10, 'L': 50}
def roman(s):
    n = 0
    for i, c in enumerate(s):
        v = ROMAN[c]
        n += -v if i + 1 < len(s) and ROMAN[s[i + 1]] > v else v
    return n
def analects():
    body = gutenberg_body(read('analects-legge.txt'))
    book = 0
    for para in re.split(r'\n\s*\n', body):
        p = clean(para)
        m = re.search(r'\bBOOK ([IVXL]+)\.', p)  # the book's Chinese title comes first in the paragraph
        if m: book = roman(m.group(1)); continue
        heads = list(re.finditer(r'CHAP(?:TER|\.) ([IVXL]+)\.\s*', p))  # the English follows the Chinese in the same paragraph, sometimes several chapters at once
        if not heads or not book: continue
        original = clean(re.sub(r'【[^】]*】', ' ', p[:heads[0].start()]))
        for i, m in enumerate(heads):
            words = re.sub(r'^\d+\.\s*', '', p[m.end():heads[i + 1].start() if i + 1 < len(heads) else len(p)]).strip()
            if len(words) > 15: verses.append(['analects', f'Analects {book}.{roman(m.group(1))}', words, original if i == 0 else ''])

# --- the Gita: Arnold's verse, chunked by stanza inside each chapter
def gita():
    body = gutenberg_body(read('gita-arnold.txt'))
    ch = 0; k = 0
    for para in re.split(r'\n\s*\n', body):
        p = clean(para)
        m = re.match(r'^CHAPTER ([IVXL]+)$', p)
        if m: ch = roman(m.group(1)); k = 0; continue
        if not ch or p.startswith('HERE ENDETH') or p.startswith('Entitled') or p.isupper() or p.startswith('[FN#'): continue  # Arnold's footnotes are not stanzas
        if p in ('ARJUNA.', 'KRISHNA.', 'SANJAYA.', 'DHRITARASHTRA.'): continue
        if len(p) < 30: continue
        k += 1; verses.append(['gita', f'Gita {ch}, stanza {k}', p])

for fn in (kjv, quran, dhammapada, tao, analects, gita): fn()

# the books of each text in reading order, as [name, verse count], so the reading-order view can draw their seams
def book_name(i, v):
    t, ref = v[0], v[1]
    if i in book_of: return book_of[i]
    if t in ('torah', 'gospels'): return ref.rsplit(' ', 1)[0]
    if t == 'quran': return f"{ref.split()[1].split(':')[0]} {SURAS[int(ref.split()[1].split(':')[0]) - 1]}"
    if t == 'gita': return f"Chapter {ref.split()[1].rstrip(',')}"
    if t == 'tao': return f"Chapter {ref.split()[-1].split('.')[0]}"
    if t == 'analects': return f"Book {ref.split()[-1].split('.')[0]}"
    return ''
for t in texts: texts[t]['books'] = []
for i, v in enumerate(verses):
    b = book_name(i, v); books = texts[v[0]]['books']
    if books and books[-1][0] == b: books[-1][1] += 1
    else: books.append([b, 1])

counts = {}
for v in verses: counts[v[0]] = counts.get(v[0], 0) + 1
words = {}
for v in verses: words[v[0]] = words.get(v[0], 0) + len(v[2].split())
for t in texts: texts[t]['verses'] = counts.get(t, 0); texts[t]['words'] = words.get(t, 0)
os.makedirs('public/data', exist_ok=True)
json.dump({'texts': texts, 'verses': verses}, open('public/data/corpus.json', 'w'), ensure_ascii=False, separators=(',', ':'))
for t in texts: print(f"{texts[t]['name']:14s} {counts.get(t, 0):6d} verses {words.get(t, 0):8d} words {len(texts[t]['books']):4d} books")
print('public/data/corpus.json', os.path.getsize('public/data/corpus.json') // 1024, 'KB')
