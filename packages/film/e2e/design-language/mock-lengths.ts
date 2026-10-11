// How a design-language mock's lengths are read: in the browser, as the page
// it is. Each space, type size, leading and radius the mock's own sheets
// (kit.css, lab.css, its `<style>` elements) and its elements' `style`
// attributes set is read against its scale, the steps of the player's sheet
// (`player/tokens.css`):
//
// - a length written in the declaration (`padding: 6px`) is read as written:
//   a px on a step, never a rem or an em; a function of lengths alone
//   (`calc(2px * 2)`) is read as the one length it computes;
// - a function that computes with a variable (`calc(var(--dot) / -2)`, a
//   dot's margin of half its size) writes no length of its own: only the
//   lengths written in it are read;
// - a variable a value names whole (`padding: var(--pad)`) is read on each
//   element and pseudo-element the declaration applies to, at each viewport
//   the page's queries name and on both pointers, as the browser resolves it
//   there: which rule gives the variable, a nesting, an `:is()`, a compound,
//   a query, an alias, a pseudo-element's own value and a declaration that
//   always loses are the browser's cascade, never this file's. A token keeps
//   its name through that resolution (every token is set to a stand-in on
//   every element while the variables are read), so the value resolved is
//   the token whole, lengths the mock gives (read as written), or a sum that
//   computes with tokens (its written lengths read). A token whole is read as
//   its px on the page: a step of the property's scale, or a token the scale
//   takes whole (`--hairline`, a gap's or a margin's; `--dock-h`, a
//   padding's). A token that is no length (a weight), and the geometry the
//   mocks name once (`GEOMETRY`), set nothing on a scale.
//
// A declaration is read where it applies, so a rule for a state the mock
// never shows (a hover, a class no element carries) has no element to read
// its variable on: it is reported as reaching none, never passed unread.
// The page's scripts run before the read, so a length a script sets is read
// in the `style` it set; one set only on an event is not.

import { Schema } from 'effect';

/** A scale of the player's sheet: the properties it sets, the tokens its steps are, and the tokens it takes whole. */
interface Scale {
  readonly what: string;
  /** A property's name it sets, as a pattern's source. */
  readonly property: string;
  /** Its steps: each token whose name starts with this, at its px. */
  readonly steps: string;
  /** The tokens its properties take whole, off its steps. */
  readonly named: ReadonlyArray<string>;
}

/** The token a gap or a margin takes whole to draw a line between two things (§3): no step, and no padding's. */
const HAIRLINE = '--hairline';

/**
 * The transport docked over the tab bar, its height a sum the sheet computes
 * (`calc(var(--hit) + 2 * var(--s-2) + 1px)`): a page's padding clears it
 * (player.css's `padding-bottom`), and nothing else takes it as a length.
 */
const DOCK = '--dock-h';

const SIDES = '(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?';

/**
 * The space, type and radius scales, each over every property that sets it:
 * a side's or a logical side's padding and margin (a padding's the dock too;
 * a margin's and a gap's the hairline), a gap, a corner's radius.
 */
const SCALES: ReadonlyArray<Scale> = [
  { what: 'space', property: `^padding${SIDES}$`, steps: '--s-', named: [DOCK] },
  {
    what: 'space',
    property: `^margin${SIDES}$|^(?:row-|column-)?gap$`,
    steps: '--s-',
    named: [HAIRLINE],
  },
  { what: 'type size', property: '^font-size$', steps: '--fs-', named: [] },
  { what: 'line height', property: '^line-height$', steps: '--lh-', named: [] },
  {
    what: 'radius',
    property: '^border(?:-(?:top|bottom|start|end)-(?:left|right|start|end))?-radius$',
    steps: '--r-',
    named: [],
  },
];

/**
 * A mock's geometry that is not spacing, named once where it lives (lab.css):
 * the cue lanes' label column, which the strip's padding clears.
 */
const GEOMETRY: ReadonlyArray<string> = ['--cue-names'];

const json = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

/**
 * The scripts that read the page `file` is. `pass`, run once a viewport, reads
 * it there (keeping what it finds on the page) and answers the widths the
 * page's queries name; `found` answers every finding, one line each, in the
 * order found: a sheet it does not wear, a token it writes, a length off its
 * scale, a variable read on no element.
 */
export const mockLengths = (file: string) => {
  const input = json({ file, scales: SCALES, geometry: GEOMETRY });
  return { pass: `(${PAGE})(${input}, 'pass')`, found: `(${PAGE})(${input}, 'found')` };
};

/** The page's side. */
const PAGE = `(input, step) => {
  const KEY = Symbol.for('film.mockLengths');
  const state = window[KEY] ?? (window[KEY] = setup());
  if (step === 'found') {
    const unreached = state.probed.filter((r) => !r.reached).flatMap((r) => [
      ...r.gives.map((name) => input.file + ': ' + name + ' is given on no element the mock shows (' + r.label + ')'),
      ...r.probes.map((p) => input.file + ': ' + p.property + ' ' + p.word + ' is read on no element the mock shows (' + r.label + ')'),
    ]);
    return [...new Set([...state.found, ...unreached])];
  }
  pass();
  return state.widths;

  function setup() {
    const probe = document.createElement('i');
    probe.style.cssText = 'position: absolute; visibility: hidden';
    document.body.append(probe);
    const found = [];
    const sheets = Array.from(document.styleSheets).filter((sheet) => {
      try { return sheet.cssRules !== null; } catch { return false; }
    });
    const tokenSheet = sheets.find((sheet) => nameOf(sheet.href ?? '') === 'tokens.css');
    const linked = Array.from(document.querySelectorAll('link[rel=stylesheet]'), (link) => nameOf(link.href));
    for (const wear of ['tokens.css', 'kit.css', ...(/^lab[-.]/.test(input.file) ? ['lab.css'] : [])])
      if (!linked.includes(wear)) found.push(input.file + ': links no ' + wear);
    const walk = (rules, each) => {
      for (const rule of rules) { each(rule); if (rule.cssRules) walk(rule.cssRules, each); }
    };
    const tokens = new Set();
    const widths = new Set([390, 1440]);
    for (const sheet of sheets)
      walk(sheet.cssRules, (rule) => {
        if (sheet === tokenSheet && rule.style)
          for (const name of Array.from(rule.style)) if (name.startsWith('--')) tokens.add(name);
        if (rule.media)
          for (const m of rule.media.mediaText.matchAll(/(min|max)-width:\\s*([\\d.]+)px/g)) {
            widths.add(Number(m[2]));
            widths.add(Number(m[2]) + (m[1] === 'min' ? -1 : 1));
          }
      });
    // Each declaration block of the mock's own sheets (a nested one's
    // labelled by its rule), and each element's style attribute.
    const own = [];
    for (const sheet of sheets.filter((s) => s !== tokenSheet))
      walk(sheet.cssRules, (rule) => {
        if (!rule.style) return;
        let at = rule;
        while (at && at.selectorText === undefined) at = at.parentRule;
        own.push({ style: rule.style, label: at ? at.selectorText : '' });
      });
    for (const el of document.querySelectorAll('[style]'))
      if (el !== probe) own.push({ style: el.style, label: el.localName + '[style]' });
    for (const { style } of own)
      for (const name of Array.from(style)) if (tokens.has(name)) found.push(input.file + ': writes ' + name);
    const longhands = new Map();
    const longhandsOf = (name) => {
      if (!longhands.has(name)) {
        probe.style.setProperty(name, 'inherit');
        longhands.set(name, Array.from(probe.style).filter((l) => l !== 'position' && l !== 'visibility'));
        probe.style.removeProperty(name);
      }
      return longhands.get(name);
    };
    const SHORTHANDS = ['font', 'padding', 'padding-block', 'padding-inline', 'margin', 'margin-block', 'margin-inline', 'gap', 'border-radius'];
    // A block's declarations as written: a shorthand whole, else each
    // longhand, a font as its size and its leading.
    const declarationsOf = (style) => {
      const out = [];
      const covered = new Set();
      for (const shorthand of SHORTHANDS) {
        const value = style.getPropertyValue(shorthand);
        if (value === '') continue;
        out.push([shorthand, value]);
        for (const longhand of longhandsOf(shorthand)) covered.add(longhand);
      }
      for (const name of Array.from(style)) {
        const value = style.getPropertyValue(name);
        if (!covered.has(name) && !name.startsWith('--') && value !== '') out.push([name, value]);
      }
      return out.flatMap(([property, value]) => {
        if (property !== 'font') return [[property, value]];
        const words = wordsOf(value);
        const slash = words.indexOf('/');
        if (slash < 0) return [['font-size', value]];
        return [['font-size', words.slice(0, slash).join(' ')], ['line-height', words[slash + 1] ?? '']];
      });
    };
    // A word that names a token whole is the token on every element (the
    // root gives it, and no mock writes one). A word that names a local whole
    // is read through a probe of its own, set beside it in its block: a
    // property no element inherits, so it is on just the elements the block
    // applies to, resolved there. Another word is read as written.
    const probed = [];
    const literals = [];
    const named = [];
    let n = 0;
    for (const block of own) {
      const probes = [];
      for (const [property, value] of declarationsOf(block.style)) {
        const scale = input.scales.find((s) => new RegExp(s.property).test(property));
        if (!scale) continue;
        for (const word of wordsOf(value).filter((w) => w !== '/')) {
          const name = wholeVar(word) ? /--[\\w-]+/.exec(word)[0] : '';
          if (tokens.has(name)) named.push({ property, word, scale, label: block.label, value: 'token' + name });
          else if (input.geometry.includes(name)) continue;
          else if (name !== '') probes.push({ property, word, scale, name: '--film-probe-' + n++ });
          else literals.push({ property, word, scale, label: block.label });
        }
      }
      // A block that gives a local or reads one is read where it applies: one
      // that applies to no element is named, never passed unread.
      const gives = Array.from(block.style).filter((name) =>
        name.startsWith('--') && !tokens.has(name) && !input.geometry.includes(name));
      if (probes.length === 0 && gives.length === 0) continue;
      const on = '--film-probe-' + n++;
      for (const name of [on, ...probes.map((p) => p.name)])
        CSS.registerProperty({ name, syntax: '*', inherits: false });
      block.style.setProperty(on, '1');
      for (const p of probes) block.style.setProperty(p.name, p.word);
      probed.push({ label: block.label, on, probes, gives, reached: false });
    }
    const standIns = document.createElement('style');
    standIns.textContent = ':root, *, ::before, ::after { ' + [
      ...Array.from(tokens, (t) => t + ': token' + t + ' !important;'),
      ...input.geometry.map((g) => g + ': named' + g + ' !important;'),
    ].join(' ') + ' }';
    document.head.append(standIns);
    const pseudos = ['', ...new Set(own.flatMap((b) => Array.from(b.label.matchAll(/::[\\w-]+/g), (m) => m[0])))];
    return { probe, found, tokens, widths: [...widths].sort((a, b) => a - b), probed, literals, named, standIns, pseudos, steps: new Map(), px: new Map() };
  }

  function nameOf(href) { return href.split(/[?#]/)[0].split('/').pop(); }

  /** A value's words: split at the spaces outside any parentheses; a slash outside them a word of its own. */
  function wordsOf(value) {
    const words = [];
    let word = '';
    let depth = 0;
    const end = () => { if (word !== '') words.push(word); word = ''; };
    for (const c of value) {
      if (depth === 0 && /\\s/.test(c)) end();
      else if (depth === 0 && c === '/') { end(); words.push('/'); }
      else { if (c === '(') depth += 1; if (c === ')' && depth > 0) depth -= 1; word += c; }
    }
    end();
    return words;
  }

  /** Whether a word is one variable, whole: \`var(--pad)\`, \`var(--pad, 8px)\`. */
  function wholeVar(word) {
    if (!word.startsWith('var(')) return false;
    let depth = 0;
    for (let i = 3; i < word.length; i += 1) {
      if (word[i] === '(') depth += 1;
      if (word[i] === ')') depth -= 1;
      if (depth === 0) return i === word.length - 1;
    }
    return false;
  }

  /** The px a length computes to on the page; none for a value that is no length. */
  function pxOf(value) {
    state.probe.style.removeProperty('outline-offset');
    state.probe.style.setProperty('outline-offset', value);
    if (state.probe.style.getPropertyValue('outline-offset') === '') return null;
    return Number.parseFloat(getComputedStyle(state.probe).outlineOffset);
  }

  /**
   * The lengths a value the mock writes sets off \`scale\`: each rem or em, and
   * each px off a step; a function of lengths alone as the one length it
   * computes, but in one that computes with a variable or a token, only the
   * lengths written in it.
   */
  function off(value, scale) {
    const ems = Array.from(value.matchAll(/-?\\d*\\.?\\d+r?em\\b/g), (m) => m[0]);
    if (ems.length > 0) return ems;
    const computed = value.includes('(') && !/var\\(|token--|named--/.test(value) && /\\dpx/.test(value);
    const lengths = computed ? [pxOf(value)] : Array.from(value.matchAll(/(-?\\d*\\.?\\d+)px/g), (m) => Number(m[1]));
    const steps = stepsOf(scale);
    return [...new Set(lengths.filter((px) => px !== null && px !== 0 && !steps.has(px)).map((px) => px + 'px'))];
  }

  function stepsOf(scale) {
    if (!state.steps.has(scale.steps))
      state.steps.set(scale.steps, new Set(Array.from(state.tokens)
        .filter((t) => t.startsWith(scale.steps)).map((t) => state.px.get(t)).filter((px) => px !== null)));
    return state.steps.get(scale.steps);
  }

  /** What a variable's value, as the page resolved it on an element, sets off \`scale\`. */
  function resolvedOff(value, scale) {
    const whole = /^(token|named)(--[\\w-]+)$/.exec(value);
    if (!whole) return off(value, scale);
    if (whole[1] === 'named' || scale.named.includes(whole[2])) return [];
    const px = state.px.get(whole[2]);
    if (px === null || stepsOf(scale).has(px)) return [];
    return [px + 'px'];
  }

  /** One viewport: the tokens' px as the page has them there, each written length, then every probe on every element it applies to. */
  function pass() {
    state.standIns.disabled = true;
    const root = getComputedStyle(document.documentElement);
    state.px = new Map(Array.from(state.tokens, (t) => [t, pxOf(root.getPropertyValue(t).trim())]));
    state.steps = new Map();
    state.standIns.disabled = false;
    for (const l of state.literals)
      for (const length of off(l.word, l.scale))
        state.found.push(input.file + ': ' + l.property + ' ' + length + ' is no ' + l.scale.what + ' step (' + l.label + ')');
    for (const t of state.named)
      for (const length of resolvedOff(t.value, t.scale))
        state.found.push(input.file + ': ' + t.property + ' ' + t.word + ' is ' + length + ', no ' + t.scale.what + ' step (' + t.label + ')');
    for (const el of document.querySelectorAll('*'))
      for (const pseudo of state.pseudos) {
        const style = getComputedStyle(el, pseudo || null);
        for (const r of state.probed) {
          if (style.getPropertyValue(r.on) === '') continue;
          r.reached = true;
          for (const p of r.probes) {
            const value = style.getPropertyValue(p.name).trim();
            const at = ' (' + r.label + ')';
            if (value === '') state.found.push(input.file + ': ' + p.property + ' ' + p.word + ' is no token, and no length the mock gives' + at);
            else for (const length of resolvedOff(value, p.scale))
              state.found.push(input.file + ': ' + p.property + ' ' + p.word + ' is ' + length + ', no ' + p.scale.what + ' step' + at);
          }
        }
      }
  }
}`;
