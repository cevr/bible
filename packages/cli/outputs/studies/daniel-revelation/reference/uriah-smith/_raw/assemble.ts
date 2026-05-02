#!/usr/bin/env bun
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const refDir = join(__dirname, '..');
const corpusName = process.argv[2] ?? 'DAR';
const corpusLabel = process.argv[3] ?? 'Uriah Smith, *Daniel and the Revelation* (DAR)';

type Hit = {
  paraId: string;
  refcodeShort: string;
  content: string;
  puborder: number;
  bookCode: string;
  bookTitle: string;
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

const byStudy = new Map<string, { topic: string; hits: Hit[] }[]>();
for (const f of files) {
  const m = f.match(/^s(\d{2})-(.+)\.json$/);
  if (!m) continue;
  const [, study, topicSlug] = m;
  const hits: Hit[] = JSON.parse(readFileSync(join(__dirname, f), 'utf8'));
  if (!byStudy.has(study)) byStudy.set(study, []);
  byStudy.get(study)!.push({ topic: topicSlug, hits });
}

for (const [study, sections] of byStudy) {
  const title = studyTitles[study] ?? `Study ${study}`;
  const lines: string[] = [];
  lines.push(`# Uriah Smith — DAR References for Study ${study}`);
  lines.push('');
  lines.push(`**Study:** ${title}`);
  lines.push('');
  lines.push(
    '> Mined from Uriah Smith, *Daniel and the Revelation* (DAR) via local FTS index. Refcodes link to the printed page.numbered-paragraph in the standard edition. Use these as **observations from the text**, not "Smith says" citations.',
  );
  lines.push('');

  // Dedup hits across topics within a study (keep first occurrence)
  const seen = new Set<string>();
  for (const { topic, hits } of sections) {
    const fresh = hits.filter((h) => {
      if (seen.has(h.refcodeShort)) return false;
      seen.add(h.refcodeShort);
      return true;
    });
    if (fresh.length === 0) continue;
    lines.push(`## ${topic.replace(/-/g, ' ')}`);
    lines.push('');
    for (const h of fresh) {
      const text = stripHtml(h.content);
      const truncated = text.length > 700 ? text.slice(0, 700).replace(/\s\S*$/, '') + '…' : text;
      lines.push(`### ${h.refcodeShort}`);
      lines.push('');
      lines.push(`> ${truncated}`);
      lines.push('');
    }
  }

  const out = join(refDir, `study-${study}.md`);
  writeFileSync(out, lines.join('\n'));
  console.log(`wrote ${out} — ${sections.length} topic(s), ${seen.size} unique refcode(s)`);
}
