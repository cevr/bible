// A film's credits from its sources: each beat's `cite`, by author, each work
// once with every place the film cites in it merged into one locator ("Steps
// to Christ, 17, 18, 47, 70"; "Letter 57, 1895 (TM 91–92)"; one periodical's
// issues on one entry), set in lines of at most `CREDIT_MEASURE` characters that
// never leave a locator on a line of its own. A cite that names none of the
// film's authors is scripture.

/**
 * An author the credits group sources under: a cite starting `<name>, ` is
 * theirs, or one starting `citedAs` when the script cites them by another
 * name (the 1889 statement as "Fundamental Principles (1889), XVIII").
 */
export interface Author {
  readonly name: string;
  readonly citedAs?: string;
}

/** The widest line on the strip, in characters of the body type. */
export const CREDIT_MEASURE = 38;

/** One line of the roll: its text, its type, and the space above it. */
export interface Credit {
  readonly text: string;
  readonly kind: 'name' | 'head' | 'item';
  readonly gap: number;
}

/** A cite's author (none for scripture) and the work it names. */
interface Source {
  readonly author: string | undefined;
  readonly work: string;
}

/** An author's name, and how the script cites the author's works when not by that name. */
const citedAsOf = (author: Author) => author.citedAs ?? author.name;

const authorOf = (cite: string, authors: ReadonlyArray<Author>): Source => {
  for (const author of authors) {
    const as = citedAsOf(author);
    if (author.citedAs !== undefined && cite.startsWith(as))
      return { author: author.name, work: cite.slice(as.length + 1) };
    if (cite.startsWith(`${as}, `)) return { author: author.name, work: cite.slice(as.length + 2) };
  }
  return { author: undefined, work: cite };
};

/**
 * A work as cited: its title, and where in it, in one of three shapes. A page
 * list (`47, 70`, `468–472`) merges with the work's other pages; an entry
 * (`vol. 5, 468–472`, a periodical's `May 9, 1895, 290`) stands whole; a
 * letter's or manuscript's reprint (`Letter 57, 1895 (TM 92)`) merges its pages
 * inside the brackets.
 */
interface Cited {
  readonly title: string;
  readonly pages: ReadonlyArray<string>;
  readonly entry: string | undefined;
  readonly reprint: { readonly in: string; readonly pages: ReadonlyArray<string> } | undefined;
}

/** A letter or manuscript, whose year is part of its name. */
const DATED = /^(Letter|Ms) \d+, \d{4}/;
/** A page list: numbers and ranges, comma separated. */
const PAGES = /^\d+(–\d+)?(, \d+(–\d+)?)*$/;
/** A reprint in brackets after the name: `(TM 91–92)`. */
const REPRINT = /^(.*) \((\S+) ([^)]+)\)$/;

const citedOf = (work: string): Cited => {
  const reprint = REPRINT.exec(work);
  if (reprint !== null) {
    const [, title = '', book = '', pages = ''] = reprint;
    return { title, pages: [], entry: undefined, reprint: { in: book, pages: pages.split(', ') } };
  }
  const dated = DATED.exec(work);
  const cut = dated === null ? work.indexOf(', ') : dated[0].length;
  if (cut < 0 || cut >= work.length)
    return { title: work, pages: [], entry: undefined, reprint: undefined };
  const title = work.slice(0, cut);
  const rest = work.slice(cut + 2);
  return PAGES.test(rest)
    ? { title, pages: rest.split(', '), entry: undefined, reprint: undefined }
    : { title, pages: [], entry: rest, reprint: undefined };
};

/** Page tokens (`17`, `91–92`) as one sorted list, a page or range inside another dropped. */
const mergePages = (tokens: ReadonlyArray<string>): string[] => {
  const spans = tokens
    .map((t) => {
      const [a = 0, b = a] = t.split('–').map(Number);
      return [a, b] as const;
    })
    .toSorted((x, y) => x[0] - y[0] || y[1] - x[1]);
  const out: Array<readonly [number, number]> = [];
  for (const span of spans) {
    const last = out.at(-1);
    if (last !== undefined && span[0] <= last[1])
      out[out.length - 1] = [last[0], Math.max(last[1], span[1])];
    else out.push(span);
  }
  return out.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`));
};

/** An entry's date, for ordering a periodical's issues (the page after it left off). */
const dateOf = (entry: string) => Date.parse(entry.replace(/, \d+$/, ''));

/**
 * A work's lines. A periodical's issues (dated entries) each stay whole, after
 * its whole title, or on its line when the first fits there. Any other locator
 * is glued to the title's last word, so no page number stands alone.
 */
const workLines = (title: string, cited: ReadonlyArray<Cited>): string[] => {
  const pages = mergePages(cited.flatMap((c) => c.pages));
  const entries = [...new Set(cited.flatMap((c) => c.entry ?? []))].toSorted(
    (a, b) => dateOf(a) - dateOf(b),
  );
  const reprints = cited.flatMap((c) => (c.reprint === undefined ? [] : [c.reprint]));
  const words = title.split(' ');
  if (entries.length > 0 && entries.every((e) => !Number.isNaN(dateOf(e)))) {
    const issues = entries.map((e, i) => (i < entries.length - 1 ? `${e};` : e));
    const [first = '', ...more] = issues;
    const head = `${title}, ${first}`;
    return head.length <= CREDIT_MEASURE
      ? wrap([head, ...more], ' ')
      : [
          ...wrap(words, ' ').map((l, i, all) => (i === all.length - 1 ? `${l},` : l)),
          ...wrap(issues, ' '),
        ];
  }
  const last = words.pop() ?? '';
  const locator =
    reprints.length > 0
      ? `${last} (${reprints[0]?.in ?? ''} ${mergePages(reprints.flatMap((r) => r.pages)).join(', ')})`
      : pages.length > 0
        ? `${last}, ${pages.join(', ')}`
        : entries.length > 0
          ? `${last}, ${entries.join('; ')}`
          : last;
  return wrap([...words, locator], ' ');
};

/** `parts` joined by `sep` into lines no longer than `CREDIT_MEASURE` characters, never breaking a part. */
const wrap = (parts: ReadonlyArray<string>, sep: string): string[] => {
  const lines: string[] = [];
  let line = '';
  for (const part of parts) {
    const next = line === '' ? part : `${line}${sep}${part}`;
    if (next.length > CREDIT_MEASURE && line !== '') {
      lines.push(line);
      line = part;
    } else line = next;
  }
  if (line !== '') lines.push(line);
  return lines;
};

/**
 * The roll from `cites` (each beat's, in the order the film gives them): the
 * film's name, then scripture, then each of `authors`' works, in the order
 * given, each work in the order the film first cites it, one entry a work.
 */
export const creditRoll = (
  title: string,
  cites: ReadonlyArray<string>,
  authors: ReadonlyArray<Author>,
): ReadonlyArray<Credit> => {
  const unique = [...new Set(cites)];
  const out: Credit[] = [{ text: title, kind: 'name', gap: 0 }];
  const sources = unique.map((cite) => authorOf(cite, authors));
  out.push({ text: 'Scripture (King James Version)', kind: 'head', gap: 70 });
  for (const line of wrap(
    sources.filter((s) => s.author === undefined).map((s) => s.work),
    ' · ',
  ))
    out.push({ text: line, kind: 'item', gap: 0 });
  for (const { name: author } of authors) {
    const works = new Map<string, Cited[]>();
    for (const s of sources) {
      if (s.author !== author) continue;
      const cited = citedOf(s.work);
      works.set(cited.title, [...(works.get(cited.title) ?? []), cited]);
    }
    if (works.size === 0) continue;
    for (const [j, line] of wrap(author.split(' '), ' ').entries())
      out.push({ text: line, kind: 'head', gap: j === 0 ? 46 : 0 });
    for (const [title, cited] of works)
      for (const line of workLines(title, cited)) out.push({ text: line, kind: 'item', gap: 0 });
  }
  return out;
};
