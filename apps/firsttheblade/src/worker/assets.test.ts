import { describe, expect, test } from 'bun:test';

import { candidates } from './assets.ts';

describe('the files a path names', () => {
  test('a page path names its html file, then its directory index', () => {
    expect(candidates('/about')).toEqual(['/about.html', '/about/index.html']);
    expect(candidates('/series/from-milk-to-meat')).toEqual([
      '/series/from-milk-to-meat.html',
      '/series/from-milk-to-meat/index.html',
    ]);
  });

  test('the root and a trailing slash name an index', () => {
    expect(candidates('/')).toEqual(['/index.html']);
  });

  test('a file path names itself', () => {
    expect(candidates('/assets/client-abc12345.css')).toEqual(['/assets/client-abc12345.css']);
  });

  test('a file whose type the Mime table does not know still names itself', () => {
    expect(candidates('/favicon.ico')).toEqual(['/favicon.ico']);
  });
});
