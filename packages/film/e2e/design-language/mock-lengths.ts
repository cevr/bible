// How a design-language mock's lengths are read: in the browser, as the page
// it is. Each space, type size, leading and radius the mock's sheets (its
// `<style>` elements, and the sheets it shares with the other mocks, kit.css
// and lab.css) and its elements' `style` attributes set is read against its
// scale, the steps of the player's sheet (`player/tokens.css`):
//
// - a length written in the declaration (`padding: 6px`) is read as written:
//   a px on a step, never a rem or an em; a function whose every length is
//   in px (`calc(2px * 2)`) is read as the one length it computes;
// - a function that computes with a variable, a percentage or another unit
//   (`calc(var(--dot) / -2)`, a dot's margin of half its size;
//   `calc(100% - 7px)`) writes no length of its own: only the px written in
//   it are read, never the variable's value (a dot's size, a dock's
//   height, a composition's part, is no length of the scale);
// - a variable a value names whole (`padding: var(--pad)`) is read on each
//   element and pseudo-element the declaration applies to, at each viewport
//   width the page's queries name, as the browser resolves it there: which
//   rule gives the variable, a nesting, an `:is()`, a compound, a query, a
//   container query, an alias, a pseudo-element's own value and a
//   declaration that always loses are the browser's cascade, never this
//   file's. Each local the mock gives has a shadow (`--film-shadow--pad`),
//   given in the same declaration block with the tokens it names written as
//   their names (`token--s-2`), so the shadow resolves through the same
//   cascade to the token whole, lengths the mock gives (read as written), or
//   a sum that computes with tokens (its written px read); the page's own
//   properties are untouched, so its layout, and the container queries that
//   read it, are the page's. A token whole is read as its px on the page: a
//   step of the property's scale, or a token the scale takes whole
//   (`--hairline`, a gap's or a margin's; `--dock-h`, a padding's). A token
//   that is no length (a weight), and the geometry the mocks name once
//   (`GEOMETRY`), set nothing on a scale. A keyframe's locals are not read.
//
// A block that gives or reads a local is read where it applies, each
// selector of its list on its own (a nested query's declarations by the list
// of the rule they sit in, under the same query), so a selector for a state
// the mock never shows (a hover, a class no element carries) is named as
// reaching no element, never passed unread. The page is read on a phone's
// pointer and a desk's: a red found on either is a red, and a selector is
// unreached only when the same selector of the same block reaches no element
// on both. A selector of a shared sheet (kit.css, lab.css) is unreached only
// when no mock that wears the sheet reaches it (`raw`'s `shared` and `wears`,
// which the test joins across the mocks). The widths read are 390, 1440, and
// each width from 200 to 4000 px a media query names (px, em or rem; `min-`,
// `max-` or a range), with one px either side; a `media` attribute is not
// read. Other media features (reduced motion, colour scheme) are not varied:
// a selector only they reach is named as unreached.
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
 * The transport docked on the shell's floor, its height a sum the sheet computes
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
 * A selector that reaches no element: which one (its block's place in its
 * sheet, and its place in the block's list, the same on every page that
 * wears the sheet), the sheet, and the lines that name it.
 */
export interface Unreached {
  readonly id: string;
  readonly sheet: string;
  readonly lines: ReadonlyArray<string>;
}

/**
 * What one pointer's read of a page found: its reds, its own selectors
 * unreached, its shared sheets' selectors unreached, and the shared sheets it
 * wears.
 */
export interface Raw {
  readonly reds: ReadonlyArray<string>;
  readonly unreached: ReadonlyArray<Unreached>;
  readonly shared: ReadonlyArray<Unreached>;
  readonly wears: ReadonlyArray<string>;
}

/**
 * The scripts that read the page `file` is. `pass`, run once a viewport, reads
 * it there (keeping what it finds on the page) and answers the widths the
 * page's queries name. `raw` answers what this pointer found (`Raw`).
 * `found(other)`, given the other pointer's `raw`, answers every finding,
 * one line each: a sheet it does not wear, a token it writes, a length off
 * its scale (on either pointer), and a selector of the page's own that
 * reaches no element on either (the same selector of the same block).
 */
export const mockLengths = (file: string) => {
  const input = json({ file, scales: SCALES, geometry: GEOMETRY });
  return {
    pass: `(${PAGE})(${input}, 'pass')`,
    raw: `(${PAGE})(${input}, 'raw')`,
    found: (other: Raw) => `(${PAGE})(${input}, 'found', ${json(other)})`,
  };
};

/** The page's side. */
const PAGE = `(input, step, other) => {
  const KEY = Symbol.for('film.mockLengths');
  const state = window[KEY] ?? (window[KEY] = setup());
  if (step === 'raw') return raw();
  if (step === 'found') {
    const mine = raw();
    const theirs = new Set(other.unreached.map((u) => u.id));
    const unreached = mine.unreached.filter((u) => theirs.has(u.id)).flatMap((u) => u.lines);
    return [...new Set([...mine.reds, ...other.reds, ...unreached])];
  }
  pass();
  return state.widths;

  function raw() {
    const unreached = [];
    const shared = [];
    for (const r of state.probed)
      for (const reach of r.reaches) {
        if (reach.reached) continue;
        const where = r.shared ? r.sheet : input.file;
        const none = r.shared ? 'any mock that wears it shows' : 'the mock shows';
        const lines = [
          ...r.gives.map((name) => where + ': ' + name + ' is given on no element ' + none + ' (' + reach.label + ')'),
          ...r.probes.map((p) => where + ': ' + p.property + ' ' + p.word + ' is read on no element ' + none + ' (' + reach.label + ')'),
        ];
        (r.shared ? shared : unreached).push({ id: reach.id, sheet: r.sheet, lines });
      }
    return { reds: [...new Set(state.found)], unreached, shared, wears: state.wears };
  }

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
      for (const rule of Array.from(rules)) { each(rule); if (rule.cssRules) walk(rule.cssRules, each); }
    };
    const tokens = new Set();
    const widths = new Set([390, 1440]);
    for (const sheet of sheets)
      walk(sheet.cssRules, (rule) => {
        if (sheet === tokenSheet && rule.style)
          for (const name of Array.from(rule.style)) if (name.startsWith('--')) tokens.add(name);
        // Each width a media query names, in px or (at the initial 16 px) em or rem, and one px either side.
        if (rule.media && /width/.test(rule.media.mediaText))
          for (const m of rule.media.mediaText.matchAll(/([\\d.]+)(px|r?em)\\b/g)) {
            const at = Math.round(Number(m[1]) * (m[2] === 'px' ? 1 : 16));
            for (const w of [at - 1, at, at + 1]) if (w >= 200 && w <= 4000) widths.add(w);
          }
      });
    // Each declaration block of the mock's sheets (a nested one's labelled by
    // the nearest rule with a selector, its anchor; a keyframe's by its
    // animation), and each element's style attribute, each with its place: a
    // shared sheet's (a linked one other than the tokens) by the sheet's name
    // and the block's place in it, the same on every mock that wears it.
    const own = [];
    let styles = 0;
    for (const sheet of sheets.filter((s) => s !== tokenSheet)) {
      const shared = sheet.ownerNode?.localName === 'link';
      const name = shared ? nameOf(sheet.href ?? '') : 'style ' + styles++;
      let i = 0;
      walk(sheet.cssRules, (rule) => {
        if (!rule.style) return;
        const id = name + '#' + i++;
        if (rule.keyText !== undefined) {
          own.push({ id, rule, anchor: null, style: rule.style, label: '@keyframes ' + rule.parentRule.name + ' ' + rule.keyText, keyframe: true, shared, sheet: name });
          return;
        }
        let at = rule;
        while (at && at.selectorText === undefined) at = at.parentRule;
        own.push({ id, rule, anchor: at ?? null, style: rule.style, label: at ? at.selectorText : '', keyframe: false, shared, sheet: name });
      });
    }
    const wears = sheets.filter((s) => s !== tokenSheet && s.ownerNode?.localName === 'link').map((s) => nameOf(s.href ?? ''));
    let attributes = 0;
    for (const el of document.querySelectorAll('[style]'))
      if (el !== probe) own.push({ id: 'style attribute #' + attributes++, rule: null, anchor: null, style: el.style, label: el.localName + '[style]', keyframe: false, shared: false, sheet: '' });
    for (const { style } of own)
      for (const name of Array.from(style)) if (tokens.has(name)) found.push(input.file + ': writes ' + name);
    const isLocal = (name) => name.startsWith('--') && !tokens.has(name) && !input.geometry.includes(name) && !name.startsWith('--film-');
    // Each local's shadow, in the block that gives the local, its value with
    // each token written as its name: the shadow resolves as the local does.
    for (const block of own) {
      if (block.keyframe) continue;
      for (const name of Array.from(block.style).filter(isLocal))
        block.style.setProperty(shadowOf(name), shadowed(block.style.getPropertyValue(name), tokens), block.style.getPropertyPriority(name));
    }
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
    // is read through a probe of its own, set beside it in its block to the
    // local's shadow: a property no element inherits, so it is on just the
    // elements the block applies to, resolved there. Another word is read as
    // written.
    const probed = [];
    const literals = [];
    const named = [];
    let n = 0;
    const register = (name) => { CSS.registerProperty({ name, syntax: '*', inherits: false }); return name; };
    for (const block of own) {
      const probes = [];
      for (const [property, value] of declarationsOf(block.style)) {
        const scale = input.scales.find((s) => new RegExp(s.property).test(property));
        if (!scale) continue;
        for (const word of wordsOf(value).filter((w) => w !== '/')) {
          const name = wholeVar(word) ? /--[\\w-]+/.exec(word)[0] : '';
          if (tokens.has(name)) named.push({ property, word, scale, label: block.label, value: 'token' + name });
          else if (input.geometry.includes(name)) continue;
          else if (name !== '' && !block.keyframe) probes.push({ property, word, scale, name: '--film-probe-' + n++ });
          else if (name === '') literals.push({ property, word, scale, label: block.label });
        }
      }
      // A block that gives a local or reads one is read where it applies, and
      // each selector of its list is reached on its own: one that applies to
      // no element is named, never passed unread.
      const gives = block.keyframe ? [] : Array.from(block.style).filter((name) => isLocal(name) && !name.startsWith('--film-'));
      if (probes.length === 0 && gives.length === 0) continue;
      const on = register('--film-probe-' + n++);
      block.style.setProperty(on, '1');
      for (const p of probes) {
        register(p.name);
        block.style.setProperty(p.name, shadowed(p.word, tokens));
      }
      // Each member of the anchor's list is reached through a rule of its own,
      // set beside the anchor under the same conditions as the block (a
      // nested \`@media\`'s declarations under that \`@media\`): \`member {
      // @media (…) { --film-reach-N: 1 } }\`. A member the browser takes in a
      // list but not alone is named, and read with its block.
      const members = block.anchor ? listOf(block.anchor.selectorText) : [];
      const whole = { id: block.id, label: block.label, name: on, reached: false };
      const reaches = members.length < 2
        ? [whole]
        : members.map((member, k) => {
            const id = block.id + '.' + k;
            const name = register('--film-reach-' + n++);
            const parent = block.anchor.parentRule ?? block.anchor.parentStyleSheet;
            const index = Array.from(parent.cssRules).indexOf(block.anchor);
            let text = name + ': 1';
            for (let at = block.rule; at !== block.anchor; at = at.parentRule)
              if (at.cssRules) text = at.cssText.slice(0, at.cssText.indexOf('{')).trim() + ' { ' + text + ' }';
            try {
              parent.insertRule(member + ' { ' + text + ' }', index + 1);
              return { id, label: member, name, reached: false };
            } catch {
              found.push((block.shared ? block.sheet : input.file) + ': ' + member + ' is no selector the browser reads alone (' + block.label + ')');
              return { ...whole, id, label: member };
            }
          });
      probed.push({ label: block.label, on, probes, gives, reaches, shared: block.shared, sheet: block.sheet });
    }
    const pseudos = ['', ...new Set(own.flatMap((b) => Array.from(b.label.matchAll(/::[\\w-]+/g), (m) => m[0])))];
    return { probe, found, tokens, wears, widths: [...widths].sort((a, b) => a - b), probed, literals, named, pseudos, steps: new Map(), px: new Map() };
  }

  function nameOf(href) { return href.split(/[?#]/)[0].split('/').pop(); }

  function shadowOf(name) { return '--film-shadow' + name; }

  /** A value with each token it names written as its name (\`token--s-2\`), the geometry as \`named--x\`, and each local as its shadow. */
  function shadowed(value, tokens) {
    let out = '';
    let i = 0;
    for (;;) {
      const at = value.indexOf('var(', i);
      if (at < 0) return out + value.slice(i);
      out += value.slice(i, at);
      let depth = 0;
      let end = at + 3;
      let comma = -1;
      for (; end < value.length; end += 1) {
        if (value[end] === '(') depth += 1;
        else if (value[end] === ')') { depth -= 1; if (depth === 0) break; }
        else if (value[end] === ',' && depth === 1 && comma < 0) comma = end;
      }
      const name = value.slice(at + 4, comma < 0 ? end : comma).trim();
      if (tokens.has(name)) out += 'token' + name;
      else if (input.geometry.includes(name)) out += 'named' + name;
      else out += 'var(' + shadowOf(name) + (comma < 0 ? '' : ',' + shadowed(value.slice(comma + 1, end), tokens)) + ')';
      i = end + 1;
    }
  }

  /** A selector list's members: split at the commas outside parentheses, brackets and quotes. */
  function listOf(selector) {
    const members = [];
    let member = '';
    let depth = 0;
    let quote = '';
    for (const c of selector) {
      if (quote !== '') { if (c === quote) quote = ''; member += c; continue; }
      if (c === '"' || c === "'") quote = c;
      if (c === '(' || c === '[') depth += 1;
      if (c === ')' || c === ']') depth -= 1;
      if (c === ',' && depth === 0) { members.push(member.trim()); member = ''; continue; }
      member += c;
    }
    members.push(member.trim());
    return members.filter((m) => m !== '');
  }

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
   * each px off a step; a function whose every length is in px as the one
   * length it computes, but in one that computes with a variable, a token, a
   * percentage or another unit, only the px written in it.
   */
  function off(value, scale) {
    const ems = Array.from(value.matchAll(/-?\\d*\\.?\\d+r?em\\b/g), (m) => m[0]);
    if (ems.length > 0) return ems;
    const others = value.replace(/-?\\d*\\.?\\d+px/g, '');
    const computed = value.includes('(') && /\\dpx/.test(value) && !/var\\(|token--|named--/.test(value) && !/\\d(?:%|[a-z])/i.test(others);
    // In a function a sign is the sum's (the page writes \`calc(50vw - 8px)\` as
    // \`calc(-8px + 50vw)\`): a length written in one is read as its size.
    const lengths = computed
      ? [pxOf(value)]
      : Array.from(value.matchAll(/(-?\\d*\\.?\\d+)px/g), (m) => (value.includes('(') ? Math.abs(Number(m[1])) : Number(m[1])));
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
    const root = getComputedStyle(document.documentElement);
    state.px = new Map(Array.from(state.tokens, (t) => [t, pxOf(root.getPropertyValue(t).trim())]));
    state.steps = new Map();
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
          for (const reach of r.reaches) if (style.getPropertyValue(reach.name) !== '') reach.reached = true;
          if (style.getPropertyValue(r.on) === '') continue;
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
