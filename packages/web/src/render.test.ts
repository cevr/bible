import { describe, expect, test } from 'bun:test';
import { Schema } from 'effect';

import {
  annotateRegisters,
  estimateReadingMinutes,
  parseStudyArticle,
  sectionPage,
  studyLandingPage,
} from './render.js';
import { Study } from './study.js';

const meta = Schema.decodeUnknownSync(Study.Meta)({
  slug: 'fixture',
  title: 'Fixture Study',
  subtitle: 'A fixture subtitle.',
  description: 'A fixture description.',
  eyebrow: 'Fixture',
  date: '2026-07-14',
});

const fixture = `
<p>Introduction copy.</p>
<h1>Part I — Beginnings</h1>
<h2>1. First Light</h2>
<blockquote><p>The first summary.</p></blockquote>
<p>First body.</p>
<h2>2. Second Witness</h2>
<p>Second body.</p>
<h1>Part II — Fulness</h1>
<h2>3. Final Call</h2>
<p>Third body.</p>
<h2>Appendix — Symbol Dictionary</h2>
<ul><li><strong>Light</strong> = truth. — defined in &quot;First Light&quot;.</li></ul>`;

describe('parseStudyArticle', () => {
  test('parses introduction, author Parts, sections, summaries, and an optional Appendix', () => {
    const document = parseStudyArticle({ slug: 'fixture', html: fixture });

    expect(document.introductionHtml).toContain('Introduction copy.');
    expect(document.parts).toHaveLength(2);
    expect(document.parts[0]?.label).toBe('Part I — Beginnings');
    expect(document.parts[0]?.title).toBe('Beginnings');
    expect(document.sections).toHaveLength(3);
    expect(document.sections[0]?.summaryHtml).toBe('<p>The first summary.</p>');
    expect(document.appendix?.title).toBe('Appendix — Symbol Dictionary');
    expect(document.appendix?.entries).toHaveLength(1);
  });

  test('creates one implicit Part for every section when author Parts are absent', () => {
    const document = parseStudyArticle({
      slug: 'implicit',
      html: '<p>Intro.</p><h2>Study 1</h2><p>One.</p><h2>Study 2</h2><p>Two.</p>',
    });

    expect(document.parts).toHaveLength(1);
    expect(document.parts[0]).toMatchObject({
      ordinal: 1,
      label: 'Study',
      title: 'Study',
      href: '/implicit/1/',
    });
    expect(document.parts[0]?.sections).toHaveLength(2);
  });

  test('excludes the Appendix from numbered sections and drops empty author Parts', () => {
    const document = parseStudyArticle({
      slug: 'structure',
      html: '<h1>Part I — Empty</h1><p>Preface.</p><h1>Part II — Kept</h1><h2>1. Section</h2><p>Body.</p><h2>Appendix</h2><p>Reference.</p>',
    });

    expect(document.parts).toHaveLength(1);
    expect(document.parts[0]?.ordinal).toBe(1);
    expect(document.sections).toHaveLength(1);
    expect(document.appendix).toBeDefined();
  });

  test('uses stable numbered section routes and points Part groups at their first section', () => {
    const document = parseStudyArticle({ slug: 'fixture', html: fixture });

    expect(document.parts.map((part) => part.href)).toEqual(['/fixture/1/', '/fixture/3/']);
    expect(document.sections.map((section) => section.href)).toEqual([
      '/fixture/1/',
      '/fixture/2/',
      '/fixture/3/',
    ]);
  });

  test('deduplicates repeated h2 and h3 heading IDs', () => {
    const document = parseStudyArticle({
      slug: 'duplicates',
      html: '<h2>Same</h2><h3>Detail</h3><p>A.</p><h2>Same</h2><h3>Detail</h3><p>B.</p>',
    });

    expect(document.sections.map((section) => section.id)).toEqual(['same', 'same-2']);
    expect(document.sections[0]?.html).toContain('<h3 id="detail">');
    expect(document.sections[1]?.html).toContain('<h3 id="detail-2">');
  });

  test('preserves unmatched content when optional apparatus and Appendix are absent', () => {
    const html = '<h2>Only Section</h2><p class="untouched">No markers here.</p>';
    const document = parseStudyArticle({ slug: 'plain', html });

    expect(document.appendix).toBeUndefined();
    expect(document.sections[0]?.summaryHtml).toBeUndefined();
    expect(document.sections[0]?.html).toBe('<p class="untouched">No markers here.</p>');
  });

  test('transforms registers, learning apparatus, symbol links, and Appendix owner links', () => {
    const document = parseStudyArticle({
      slug: 'registers',
      html: `<h2>1. Owner</h2>
<blockquote><p>Summary.</p></blockquote>
<ul><li><em><a href="https://www.biblegateway.com/passage/?search=Gen+1">Gen. 1:1.</a></em> &quot;In the beginning&quot; — the source gloss.</li>
<li><em><a href="https://egwwritings.org/read">GC 1.1.</a></em> White: &quot;Witness text&quot; — gloss.</li>
<li><strong>Light</strong> = truth. Defined in full at the close.</li></ul>
<p><strong>DEFINITION — OWNER =</strong> synthesis.</p>
<p><strong>Symbols defined here:</strong></p><ul><li><strong>Light</strong> = truth.</li></ul>
<p><strong>Symbols carried:</strong> none.</p>
<p><strong>For discussion:</strong></p><ol><li>What is light?</li></ol>
<h2>Appendix — Symbol Dictionary</h2>
<ul><li><strong>Light</strong> = truth. — defined in &quot;Owner&quot;.</li></ul>`,
    });
    const section = document.sections[0]?.html ?? '';
    const appendix = document.appendix?.html ?? '';

    expect(section).toContain('data-register="scripture"');
    expect(section).toContain('data-register="witness"');
    expect(section).toContain('class="source-ref"');
    expect(section).toContain('class="register-label">Witness');
    expect(section).toContain('class="source-quotation"');
    expect(section).toContain('class="source-gloss"');
    expect(section).toContain('class="section-abstract"');
    expect(section).toContain('class="section-synthesis"');
    expect(section).toContain('concept-ledger-defined');
    expect(section).toContain('concept-ledger-carried');
    expect(section).toContain('class="section-review"');
    expect(section).toContain('class="symbol-link" href="/registers/appendix/#symbol-light"');
    expect(section).toContain('class="appendix-link"');
    expect(appendix).toContain('id="symbol-light"');
    expect(appendix).toContain('class="defined-in-link" href="/registers/1/#1-owner"');
  });
});

describe('study pages', () => {
  const document = parseStudyArticle({ slug: 'fixture', html: fixture });

  test('overview groups sections by Part while linking every action to a section route', () => {
    const html = studyLandingPage({ meta, document });

    expect(html).toContain('href="/fixture/1/">Start With Section 1</a>');
    expect(html).toContain('<h2>Beginnings</h2>');
    expect(html).toContain('href="/fixture/2/"');
    expect(html).not.toContain('/part-');
  });

  test('renders one section with whole-study navigation, grouped TOC, and reading controls', () => {
    const section = document.sections[1];
    expect(section).toBeDefined();
    if (section === undefined) return;

    const html = sectionPage({ meta, document, section });

    expect(html).toContain('Section 2 of 3');
    expect(html).toContain('data-section-id="2-second-witness"');
    expect(html).not.toContain('data-section-id="1-first-light"');
    expect(html).not.toContain('data-section-id="3-final-call"');
    expect(html).toContain('rel="prev" href="/fixture/1/"');
    expect(html).toContain('rel="next" href="/fixture/3/"');
    expect(html).toContain('href="/fixture/1/"');
    expect(html).toContain('href="/fixture/3/"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('data-completion-toggle="2-second-witness"');
    expect(html).not.toContain('/part-');
  });

  test('walks from the overview through every section and on to the Appendix', () => {
    const first = document.sections[0];
    const last = document.sections.at(-1);
    expect(first).toBeDefined();
    expect(last).toBeDefined();
    if (first === undefined || last === undefined) return;

    const firstHtml = sectionPage({ meta, document, section: first });
    const lastHtml = sectionPage({ meta, document, section: last });

    expect(firstHtml).toContain('rel="prev" href="/fixture/"');
    expect(firstHtml).toContain('rel="next" href="/fixture/2/"');
    expect(lastHtml).toContain('rel="prev" href="/fixture/2/"');
    expect(lastHtml).toContain('rel="next" href="/fixture/appendix/"');
  });
});

test('annotateRegisters leaves non-reference and nested definition items unchanged', () => {
  const html =
    '<ul><li><strong>symbol</strong> = definition.</li><li><em>Book.</em> Plain text.</li></ul>';
  expect(annotateRegisters(html)).toBe(html);
});

test('annotateRegisters preserves nested definition-list boundaries', () => {
  const html =
    '<ul><li><em><a href="https://www.biblegateway.com/passage/">Gen. 1:1.</a></em> &quot;Text&quot; — gloss.<ul><li><strong>light</strong> = truth.</li></ul></li></ul>';
  const annotated = annotateRegisters(html);

  expect(annotated).toContain('<li data-register="scripture">');
  expect(annotated).toContain('<li><strong>light</strong> = truth.</li>');
  expect(annotated.match(/<li/g)).toHaveLength(2);
  expect(annotated.match(/<\/li>/g)).toHaveLength(2);
  expect(annotated).not.toContain('class="source-quotation"');
});

test('reading estimates use exactly 200 words per minute with a one-minute floor', () => {
  expect(estimateReadingMinutes(0)).toBe(1);
  expect(estimateReadingMinutes(200)).toBe(1);
  expect(estimateReadingMinutes(201)).toBe(2);
});
