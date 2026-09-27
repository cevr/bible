#!/usr/bin/env python3
"""Verify quote records against the local corpus (~/.bible/egw-paragraphs.db).

Input: one or more JSONL files. Each line: {"ref": "<refcode_short>", "text": "<verbatim, … for omissions>", ...}
A record may also carry "refs": [..] when a quote spans consecutive paragraphs.

For each record every fragment (split on … or ...) must occur in the paragraph text.
Status: EXACT (after whitespace/quote normalisation), PAGENUM (exact once embedded print-page
numbers are dropped from the corpus text), RELAXED (matches only with punctuation stripped:
fix it), FAIL, NOREF.

Usage: verify_quotes.py file.jsonl [...]  (prints a report; exit 1 if any FAIL/NOREF)
"""
import json, os, re, sqlite3, sys, unicodedata

DB = os.path.expanduser('~/.bible/egw-paragraphs.db')
con = sqlite3.connect(f'file:{DB}?mode=ro', uri=True)


def norm(s: str, lower: bool = True) -> str:
    s = unicodedata.normalize('NFC', s)
    s = s.replace('’', "'").replace('‘', "'").replace('“', '"').replace('”', '"')
    s = s.replace('—', '-').replace('–', '-').replace(' ', ' ')
    s = re.sub(r'\s+', ' ', s)
    return s.strip().lower() if lower else s.strip()


def relax(s: str) -> str:
    # drop isolated page numbers / footnote digits the corpus embeds mid-text
    s = re.sub(r'(?<=\s)\d{1,4}(?=\s)', ' ', ' ' + s + ' ')
    s = re.sub(r'\s+', ' ', s)
    s = re.sub(r'[^\w\s]', '', s)
    s = re.sub(r'\s+', ' ', s)
    return s.strip()


_IDX = None


def _idx():
    """Local refcode -> rowid index (refidx.db, built from the corpus); None if absent."""
    global _IDX
    if _IDX is None:
        import os
        p = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'refidx.db')
        _IDX = sqlite3.connect(p) if os.path.exists(p) else False
    return _IDX or None


def fetch(ref: str):
    ref_n = re.sub(r'\s+', ' ', ref.strip())
    idx = _idx()
    if idx is not None:
        rids = [r[0] for r in idx.execute('select rid from r where ref = ?', (ref_n,))]
        if rids:
            rows = con.execute(
                f"select content_text, refcode_short, book_id from paragraphs where rowid in ({','.join('?' * len(rids))}) order by rowid",
                rids,
            ).fetchall()
            # Guard against a stale index: every row must still carry the requested refcode.
            if rows and len(rows) == len(rids) and all(re.sub(' {2,}', ' ', r[1] or '') == ref_n for r in rows):
                return rows
    rows = con.execute(
        "select content_text, refcode_short, book_id from paragraphs where replace(replace(refcode_short,'  ',' '),'  ',' ') = ?",
        (ref_n,),
    ).fetchall()
    return rows


def split_fragments(text: str):
    parts = re.split(r'\s*(?:…|\.\.\.)\s*', text)
    return [p.strip(' "“”') for p in parts if len(p.strip(' "“”')) >= 4]


def check(rec):
    refs = rec.get('refs') or [rec['ref']]
    texts = []
    for r in refs:
        rows = fetch(r)
        if not rows:
            return 'NOREF', f'no paragraph with refcode {r!r}'
        texts.extend(row[0] for row in rows)
    body = ' '.join(texts)
    frags = split_fragments(rec['text'])
    if not frags:
        return 'FAIL', 'empty text'
    nb = norm(body)
    rb = relax(nb)
    rank = {'EXACT': 0, 'PAGENUM': 1, 'RELAXED': 2}
    status = 'EXACT'
    for f in frags:
        nf = norm(f)
        if nf in nb:
            continue
        # a print-page number the corpus embeds at a word boundary may be dropped
        pat = re.escape(nf).replace('\\ ', '(?: \\d{1,4})? ')
        if re.search(pat, nb):
            if rank[status] < 1:
                status = 'PAGENUM'
            continue
        if relax(nf) in rb:
            status = 'RELAXED'
            continue
        return 'FAIL', f'fragment not found: {f[:90]!r}'
    if status == 'EXACT':
        cb = norm(body, lower=False)
        for f in frags:
            if norm(f, lower=False) not in cb:
                return 'CASE', f'capitalisation differs: {f[:60]!r}'
    return status, ''


def main(paths):
    bad = 0
    total = 0
    for p in paths:
        with open(p, encoding='utf-8') as fh:
            for i, line in enumerate(fh, 1):
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                except Exception as e:  # noqa: BLE001
                    print(f'{os.path.basename(p)}:{i}\tBADJSON\t{e}')
                    bad += 1
                    continue
                total += 1
                st, why = check(rec)
                if st in ('FAIL', 'NOREF'):
                    bad += 1
                label = rec.get('ref') or ','.join(rec.get('refs', []))
                print(f'{os.path.basename(p)}:{i}\t{st}\t{label}\t{why}')
    print(f'--- {total} records, {bad} failing')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
