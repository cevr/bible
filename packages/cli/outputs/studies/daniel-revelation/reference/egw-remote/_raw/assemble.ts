#!/usr/bin/env bun
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const refDir = join(__dirname, '..');

type Hit = {
  index?: number;
  lang: string;
  para_id?: string | null;
  pub_code: string;
  pub_name: string;
  refcode_long?: string | null;
  refcode_short?: string | null;
  pub_year?: string | null;
  snippet?: string | null;
  weight?: number;
  group?: string;
  action_required?: string;
};

type Response = {
  next: string | null;
  previous: string | null;
  total: number;
  count: number;
  results: Hit[];
};

const stripHtml = (s: string) =>
  s
    .replace(/<\/?[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

const studyTitles: Record<string, string> = {
  '01': 'The God Who Reveals Secrets — Daniel 1-2',
  '02': 'The Judgment Scene — Daniel 7',
  '03': 'The 2300 Days and the Sanctuary — Daniel 8-9',
  '04': 'The Sanctuary Key',
  '05': 'Kings of the North and South — Daniel 10-11',
  '06': 'Sealed Till the Time of the End — Daniel 12',
  '07': 'The Revelation of Jesus Christ — Rev 1-3',
  '08': 'The Throne Room and the Sealed Book — Rev 4-5',
  '09': 'The Seven Seals — Rev 6-7',
  '10': 'The Seven Trumpets — Rev 8-9',
  '11': 'The Little Book Opened — Rev 10-11',
  '12': 'The Woman, the Dragon, and the War — Rev 12',
  '13': 'The Two Beasts — Rev 13',
  '14': 'The Three Angels Messages — Rev 14',
  '15': 'Mark and Seal — Allegiance in the Final Crisis',
  '16': 'Babylon Exposed and Fallen — Rev 17-18',
  '17': 'Probation’s Close and the Plagues — Rev 15-16',
  '18': 'The Second Coming — Rev 19',
  '19': 'The Millennium and Final Judgment — Rev 20',
  '20': 'All Things New — Rev 21-22',
  '21': '"Blessed Is He That Readeth" — The Call',
};

const files = readdirSync(__dirname)
  .filter((f) => f.endsWith('.json'))
  .sort();

const byStudy = new Map<string, { topic: string; resp: Response }[]>();
for (const f of files) {
  const m = f.match(/^s(\d{2})-(.+)\.json$/);
  if (!m) continue;
  const [, study, topicSlug] = m;
  const resp: Response = JSON.parse(readFileSync(join(__dirname, f), 'utf8'));
  if (!byStudy.has(study)) byStudy.set(study, []);
  byStudy.get(study)!.push({ topic: topicSlug, resp });
}

for (const [study, sections] of byStudy) {
  const title = studyTitles[study] ?? `Study ${study}`;
  const lines: string[] = [];
  lines.push(`# EGW Remote Corpus — References for Study ${study}`);
  lines.push('');
  lines.push(`**Study:** ${title}`);
  lines.push('');
  lines.push(
    "> Mined from the full EGW writings corpus via the remote API (`bible egw search --remote`). Unlike the local DAR/GC/PK bundles, these hits span hundreds of books — pioneer commentary (PFF = Froom's *Prophetic Faith of Our Fathers*), SDA Bible Commentary (7SDABC), letters and manuscripts (Lt, Ms), and lesser-known EGW works.",
  );
  lines.push('');
  lines.push(
    '> **Filtering:** hits marked `[purchased]` are paywalled in the EGW API — only the refcode is shown, not the snippet. Hits with `[free]` carry a usable excerpt. Both are kept here for reference; for direct material, focus on the `[free]` rows.',
  );
  lines.push('');

  // Dedup hits across topics within a study (keep first occurrence by refcode)
  const seen = new Set<string>();
  for (const { topic, resp } of sections) {
    const fresh = resp.results.filter((h) => {
      const ref = h.refcode_short ?? '';
      if (!ref || seen.has(ref)) return false;
      seen.add(ref);
      return true;
    });
    if (fresh.length === 0) continue;
    lines.push(`## ${topic.replace(/-/g, ' ')} (total hits: ${resp.total})`);
    lines.push('');
    // Prioritize free (with snippet) first
    const free = fresh.filter((h) => h.action_required !== 'purchased' && h.snippet);
    const paid = fresh.filter((h) => h.action_required === 'purchased' || !h.snippet);
    for (const h of free.slice(0, 12)) {
      const text = stripHtml(h.snippet ?? '');
      const truncated = text.length > 600 ? text.slice(0, 600).replace(/\s\S*$/, '') + '…' : text;
      lines.push(`### ${h.refcode_short} — ${h.pub_name} [free]`);
      lines.push('');
      lines.push(`> ${truncated}`);
      lines.push('');
    }
    if (paid.length > 0) {
      lines.push(`<details><summary>Paywalled refs (${paid.length})</summary>`);
      lines.push('');
      for (const h of paid.slice(0, 20)) {
        lines.push(`- \`${h.refcode_short}\` — ${h.pub_name} [purchased]`);
      }
      lines.push('');
      lines.push('</details>');
      lines.push('');
    }
  }

  const out = join(refDir, `study-${study}.md`);
  writeFileSync(out, lines.join('\n'));
  console.log(`wrote ${out} — ${sections.length} topic(s), ${seen.size} unique refcode(s)`);
}
