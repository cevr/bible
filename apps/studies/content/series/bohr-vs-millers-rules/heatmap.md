# Bohr vs. Miller's Rules — Per-Chapter Violation Density Heatmap

_Visual companion to_ `bohr-vs-millers-rules.md` _and_ `bohr-vs-millers-rules-summary.md`. _All counts are aggregated from the 280-verse audit; one rule counted once per verse it is broken._

---

## How to read this

Each row is one chapter of the audit. The bar shows the percentage of verses in that chapter where Bohr breaks at least one Miller rule. The legend:

```
█  violation block       (~10% of chapter width per █)
·  rule-compliant block  (~10% of chapter width per ·)
```

Three intensities flag the violation clusters:

- 🟥 **Heavy** (≥40%) — methodological substitution active
- 🟧 **Moderate** (15-39%) — repeated divergences within pioneer framework
- 🟨 **Light** (1-14%) — soft drift, single-issue
- ⬜ **Clean** (0%) — fully rule-compliant

---

## The full sweep

```
                         0%        25%       50%       75%      100%
                         │─────────│─────────│─────────│─────────│
🟥 Dan 11:36-45 (10/10)  ██████████████████████████████████████████ 100%
🟥 Rev 9       (18/21)   █████████████████████████████████████░░░░░  86%
🟥 Rev 8        (6/13)   ███████████████████████░░░░░░░░░░░░░░░░░░░  46%
🟧 Rev 11       (4/19)   ██████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  21%
🟧 Rev 12       (3/17)   █████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  18%
🟧 Rev 13       (3/18)   ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  17%
🟧 Rev 17       (3/18)   ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  17%
🟨 Rev 19    (2-3/21)    ██████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  14%
🟨 Rev 6        (2/17)   █████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  12%
🟨 Rev 14       (2/20)   ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  10%
🟨 Rev 16       (2/21)   ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  10%
🟨 Rev 4        (1/11)   ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   9%
🟨 Rev 5        (1/14)   ███░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   7%
🟨 Rev 18       (1/24)   ██░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   4%
⬜ Rev 1        (0/20)   ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   0%
⬜ Rev 2        (0/29)   ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   0%
⬜ Rev 3        (0/22)   ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   0%
⬜ Rev 7        (0/17)   ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   0%
⬜ Rev 10       (0/11)   ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   0%
⬜ Rev 15        (0/8)   ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   0%
⬜ Rev 20       (0/15)   ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   0%
⬜ Rev 21       (0/27)   ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   0%
⬜ Rev 22       (0/21)   ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   0%
                         │─────────│─────────│─────────│─────────│
                         0%        25%       50%       75%      100%
```

---

## Canonical-order sparkline

The same data, ordered as the chapters appear in Scripture, so the clusters and the bookend-cleanliness pattern become visually obvious:

```
            Dan11   Rev1  Rev2  Rev3  Rev4  Rev5  Rev6  Rev7  Rev8  Rev9 Rev10 Rev11
                                                            ┌──┐ ┌──┐
                                                            │██│ │██│
                                                            │██│ │██│
                                                            │██│ │██│
                                                            │██│ │██│
                                                            │██│ │██│
            ┌──┐                                            │██│ │██│
            │██│                                            │██│ │██│      ┌──┐
            │██│                                            │██│ │██│      │██│
            │██│                              ┌──┐          │██│ │██│      │██│
            │██│              ┌──┐ ┌──┐  ┌──┐ │██│          │██│ │██│      │██│
            └──┘ ░░░░ ░░░░ ░░░│██│ │██│ ░│██│ │██│ ░░░░ ░░░░│██│ │██│ ░░░░ │██│
            100%   0%   0%   0%  9%   7% 12%  46%   0%   0% 46%  86%   0%  21%

           Rev12 Rev13 Rev14 Rev15 Rev16 Rev17 Rev18 Rev19 Rev20 Rev21 Rev22
            ┌──┐ ┌──┐
            │██│ │██│            ┌──┐ ┌──┐
            │██│ │██│ ┌──┐ ┌──┐  │██│ │██│      ┌──┐
            │██│ │██│ │██│  ░░░  │██│ │██│ ░░░░ │██│  ░░░  ░░░  ░░░
            18%  17%  10%   0%   10%  17%   4%  14%   0%   0%   0%
```

The Dan 11 column shows only the active-fulfillment span (vv. 36-45) — Bohr is silent or convergent across the first 35 verses.

---

## The three clusters at a glance

```
┌─────────────────────────────────────────────────────────────────┐
│  CLUSTER A — Eastern Question / Were principle                  │
│  ─────────────────────────────────────────────                  │
│  Dan 11:36-45      ████████████████████████████████████  100%   │
│  Rev 9             █████████████████████████████████░░░   86%   │
│  Rev 16:12,16          (only 2 verses out of 21)        ~10%    │
│                                                                  │
│  Driver: Louis Were's "automatic transition from literal to     │
│  spiritual" — spiritualizes GEOGRAPHIC specifiers.              │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  CLUSTER B — Keith-Gibbon trumpet framework abandoned           │
│  ────────────────────────────────────────────────────           │
│  Rev 8:7-12        ███████████████████████░░░░░░░░░░░░   46%   │
│                                                                  │
│  Driver: Substitution of spiritual / Christological /           │
│  Jerusalem-Rome-Constantine-Papacy grid for barbarian-          │
│  invasion historicism. Spiritualizes SEQUENCE-AND-ACTOR.        │
│  Trumpet 1 = AD 34-70 also breaks Rev 1:19 forward vantage.     │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  CLUSTER C — France-as-template, soft Rule-XIII drift           │
│  ────────────────────────────────────────────────────           │
│  Rev 11:7,11,12,13     (~21%)                                   │
│  Rev 12:4,7,16         (~18%)                                   │
│  Rev 13:3,13,14        (~17%)                                   │
│  Rev 17:10,11,12,13    (~17%)                                   │
│                                                                  │
│  Driver: Re-typing dateable specifics as recurring patterns     │
│  ("template" / "principle" / "globalization") rather than       │
│  named-and-dated fulfillments. Lighter than Cluster A but       │
│  same hermeneutical move.                                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## The clean bookends

```
   ┌─────────────────────┐                          ┌─────────────────────┐
   │  OPENING BLOCK      │                          │  CLOSING BLOCK      │
   │  ──────────────     │                          │  ──────────────     │
   │  Rev 1     ⬜  0%   │                          │  Rev 15    ⬜  0%   │
   │  Rev 2     ⬜  0%   │   (middle: contested)    │  Rev 20    ⬜  0%   │
   │  Rev 3     ⬜  0%   │   ─────────────────      │  Rev 21    ⬜  0%   │
   │  Rev 7     ⬜  0%   │                          │  Rev 22    ⬜  0%   │
   │  Rev 10    ⬜  0%   │                          │                     │
   └─────────────────────┘                          └─────────────────────┘
     SDA-foundational                                  SDA-foundational
     pioneer framework                                 pioneer framework
     uncontested                                       uncontested
     ↓                                                 ↓
     Bohr stays on it.                                 Bohr stays on it.
```

**Eight chapters at zero violations cluster at the canonical bookends, exactly where the SDA pioneer framework is most foundational and most uncontested.** The violations cluster precisely where pioneer historicism is _contested_ within modern Adventism (Eastern Question, four trumpets, France-template, seven-heads enumeration).

---

## Rule-violation distribution (where Bohr breaks the rules)

```
Rule         Count   ──────────────────────────────────────────
XIII (49)    ████████████████████████████████████████████████  every word fulfilled
XII  (32)    ████████████████████████████████                  trace the figure
XI   (30)    ██████████████████████████████                    literal first
V    (24)    ████████████████████████                          Scripture self-expositor
IV   (22)    ██████████████████████                            no contradiction
I    (14)    ██████████████                                    every word bears
VII   (5)    █████                                             Bible-fixed symbols
III   (2)    ██                                                nothing hidden from faith
IX/X  (2)    ██                                                multiple significations
II    (1)    █                                                 all scripture necessary
XIV   (1)    █                                                 willingness to lose all
VI    (0)    ░                                                 recapitulation
VIII  (0)    ░                                                 parables as figures
```

**The historicist core (XIII + XII + XI) accounts for 111 of ~182 total rule-breaks (~61%).** Add Rule V — the rule whose violation enables the substitution of Were's extra-biblical principle — and the four rules together account for **~74% of all violations**. These four rules are precisely what distinguishes pioneer historicism from futurism, preterism, and idealism.

---

_For the analytic narrative behind these numbers see `bohr-vs-millers-rules.md` §_ Rule-violation frequency table _and §_ Observations. _For the headline summary see `bohr-vs-millers-rules-summary.md`._
