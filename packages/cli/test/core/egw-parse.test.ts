import { formatEGWRef, isSearchQuery, parseEGWRef } from '@bible/core/egw';
import { describe, expect, it } from 'bun:test';

describe('EGW reference parser', () => {
  describe('parseEGWRef', () => {
    it('should parse single paragraph reference', () => {
      const result = parseEGWRef('PP 351.1');
      expect(result).toEqual({
        _tag: 'paragraph',
        bookCode: 'PP',
        page: 351,
        paragraph: 1,
      });
    });

    it('should parse paragraph reference with numbered book code', () => {
      const result = parseEGWRef('1BC 1111.2');
      expect(result).toEqual({
        _tag: 'paragraph',
        bookCode: '1BC',
        page: 1111,
        paragraph: 2,
      });
    });

    it('should parse paragraph range reference', () => {
      const result = parseEGWRef('PP 351.1-5');
      expect(result).toEqual({
        _tag: 'paragraph-range',
        bookCode: 'PP',
        page: 351,
        paragraphStart: 1,
        paragraphEnd: 5,
      });
    });

    it('should parse single page reference', () => {
      const result = parseEGWRef('PP 351');
      expect(result).toEqual({
        _tag: 'page',
        bookCode: 'PP',
        page: 351,
      });
    });

    it('should parse page range reference', () => {
      const result = parseEGWRef('PP 351-355');
      expect(result).toEqual({
        _tag: 'page-range',
        bookCode: 'PP',
        pageStart: 351,
        pageEnd: 355,
      });
    });

    it('should parse book only reference', () => {
      const result = parseEGWRef('PP');
      expect(result).toEqual({
        _tag: 'book',
        bookCode: 'PP',
      });
    });

    it('should parse book only with numbered prefix', () => {
      const result = parseEGWRef('2BC');
      expect(result).toEqual({
        _tag: 'book',
        bookCode: '2BC',
      });
    });

    it('should normalize book code to uppercase', () => {
      const result = parseEGWRef('pp 351.1');
      expect(result).toEqual({
        _tag: 'paragraph',
        bookCode: 'PP',
        page: 351,
        paragraph: 1,
      });
    });

    it('should handle extra whitespace', () => {
      const result = parseEGWRef('  PP  351.1  ');
      expect(result).toEqual({
        _tag: 'paragraph',
        bookCode: 'PP',
        page: 351,
        paragraph: 1,
      });
    });

    it('should fall back to search for plain text', () => {
      const result = parseEGWRef('faith and works');
      expect(result).toEqual({
        _tag: 'search',
        query: 'faith and works',
      });
    });

    it('should fall back to search for invalid format', () => {
      const result = parseEGWRef('PP-351');
      expect(result).toEqual({
        _tag: 'search',
        query: 'PP-351',
      });
    });
  });

  describe('formatEGWRef', () => {
    it('should format paragraph reference', () => {
      expect(
        formatEGWRef({
          _tag: 'paragraph',
          bookCode: 'PP',
          page: 351,
          paragraph: 1,
        }),
      ).toBe('PP 351.1');
    });

    it('should format paragraph range reference', () => {
      expect(
        formatEGWRef({
          _tag: 'paragraph-range',
          bookCode: 'PP',
          page: 351,
          paragraphStart: 1,
          paragraphEnd: 5,
        }),
      ).toBe('PP 351.1-5');
    });

    it('should format page reference', () => {
      expect(formatEGWRef({ _tag: 'page', bookCode: 'PP', page: 351 })).toBe('PP 351');
    });

    it('should format page range reference', () => {
      expect(
        formatEGWRef({
          _tag: 'page-range',
          bookCode: 'PP',
          pageStart: 351,
          pageEnd: 355,
        }),
      ).toBe('PP 351-355');
    });

    it('should format book reference', () => {
      expect(formatEGWRef({ _tag: 'book', bookCode: 'PP' })).toBe('PP');
    });

    it('should format search query', () => {
      expect(formatEGWRef({ _tag: 'search', query: 'faith and works' })).toBe('faith and works');
    });
  });

  describe('isSearchQuery', () => {
    it('should return true for search query', () => {
      expect(isSearchQuery(parseEGWRef('faith and works'))).toBe(true);
    });

    it('should return false for reference', () => {
      expect(isSearchQuery(parseEGWRef('PP 351.1'))).toBe(false);
    });
  });
});
