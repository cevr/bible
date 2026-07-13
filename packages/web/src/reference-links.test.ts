import { describe, expect, test } from 'bun:test';

import { linkReferences } from './reference-links.js';

const PANELS = new Map([
  ['PP 81.2', '84.296'],
  ['GC 598.3', '132.2727'],
]);

describe('linkReferences', () => {
  test('links Bible passages to Bible Gateway in the KJV', () => {
    const html = linkReferences(
      '<p>Read John 3:16, 18, 20-21; 4:1-3 and 1 Corinthians 13:1–3; compare Gen. 1:26, Exo. 25:8, Eze. 4:6, and 1 Th. 5:23.</p>',
      PANELS,
    );

    expect(html).toContain(
      '<a href="https://www.biblegateway.com/passage/?search=John%203%3A16%2C%2018%2C%2020-21%3B%204%3A1-3&version=KJV" target="_blank" rel="noopener noreferrer">John 3:16, 18, 20-21; 4:1-3</a>',
    );
    expect(html).toContain(
      '<a href="https://www.biblegateway.com/passage/?search=1%20Corinthians%2013%3A1%E2%80%933&version=KJV" target="_blank" rel="noopener noreferrer">1 Corinthians 13:1–3</a>',
    );
    expect(html).toContain(
      '<a href="https://www.biblegateway.com/passage/?search=Gen.%201%3A26&version=KJV" target="_blank" rel="noopener noreferrer">Gen. 1:26</a>',
    );
    expect(html).toContain('search=Exo.%2025%3A8&version=KJV');
    expect(html).toContain('search=Eze.%204%3A6&version=KJV');
    expect(html).toContain('search=1%20Th.%205%3A23&version=KJV');
  });

  test('links resolved EGW citations to their exact paragraph panel', () => {
    const panels = new Map([...PANELS, ['CTr 301.5', '9.2359'], ['14MR 23.3', '58.126']]);
    const html = linkReferences(
      '<p>The two classes remained separate (PP 81.2). See CTr 301.5 and 14MR 23.3.</p>',
      panels,
    );

    expect(html).toContain(
      '<a href="https://egwwritings.org/read?panels=p84.296&index=0" target="_blank" rel="noopener noreferrer">PP 81.2</a>',
    );
    expect(html).toContain('href="https://egwwritings.org/read?panels=p9.2359&index=0"');
    expect(html).toContain('href="https://egwwritings.org/read?panels=p58.126&index=0"');
  });

  test('keeps unresolved publication-like references as text', () => {
    expect(linkReferences('<p>UNKNOWN 12.3</p>', PANELS)).toBe('<p>UNKNOWN 12.3</p>');
  });

  test('does not create nested links or touch code and tag attributes', () => {
    const html =
      '<p><a href="https://example.com/John 3:16">John 3:16</a> <code>PP 81.2</code></p>';

    expect(linkReferences(html, PANELS)).toBe(html);
  });
});
