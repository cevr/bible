---
id: 007
title: Select-to-lookup fallback design
labels: [wayfinder:grilling]
status: open
assignee:
blocked-by: []
---

## Question

Charter: curated phrases render as visible links, but any text selection can be looked up
on demand. Define that fallback: what does selecting "the daily" in Daniel 8 offer?

- Which resolvers run on a selection: FTS search (Bible + EGW), Strong's (via
  `verse_words` mapping when the selection is inside a verse), topic-dictionary fuzzy
  match, catalog topical index?
- One combined lookup panel vs a menu of actions ("Search EGW", "Strong's", "Topics")?
- Where results render (the study pane from
  [Study-pane seam spec](009-study-pane-seam.md)? the peek card surface from
  [the navigation prototype](006-navigation-prototype.md)?).
- Does a successful lookup leave a trail (recently looked up, promote-to-topic-candidate
  signal for future authoring)?
