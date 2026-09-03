# Design System Master File

**Project:** Project Greenlit
**Version:** 3.0 — quiet, fast, keyboard-first
**Supersedes:** v2.0 (operational instrument), retained as `MASTER.v2-superseded.md`
**Reference point:** Linear

---

## 0. Why v2 was replaced

v2 fixed a real problem — v1 had collapsed 76% of its text into a 2px band, so
nothing could be emphasised. v2 restored typographic hierarchy.

Then it introduced a different one. v2 raised **density** without raising
**calm**: a dark navy shell, dark table headers, filled semantic pills on every
row, and a 1px rule around every panel. More information per screen, and more
chrome around all of it. The operator's report was that it felt like too much
at once, and they were right.

The mistake was treating density and hierarchy as the whole problem. An
operations tool also has to be **quiet**, so that the one thing that matters
can be loud by contrast. v2 had nothing quiet left to contrast against.

## 1. Direction

Quiet, fast, keyboard-first.

1. **Density comes from whitespace, not from borders.** A line is only drawn
   where two things would otherwise be confused. Panels are regions, not boxes.
2. **Near-monochrome.** Four steps of ink carry almost all hierarchy. One
   accent exists and is used rarely.
3. **Colour means state, and never appears without a word.** A state is a 6px
   mark plus its name — never a filled block, which reads as decoration and
   competes with the value that matters.
4. **No dark chrome.** The shell is white. Dark surfaces drew the eye to
   navigation, which is the least important thing on the screen.

## 2. Typography

- **Interface:** `"Inter", ui-sans-serif, system-ui, sans-serif`
- **Data:** `"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace`

| Token | Size / line | Weight | Used for |
|---|---|---|---|
| `display` | 21 / 28 | 600 | Page title, one per screen |
| `title` | 15 / 20 | 500 | Section headings |
| `body` | 14 / 20 | 400 | Everything ordinary |
| `label` | 12 / 16 | 500 | Column heads, field labels. Sentence case, not uppercase |
| `data` | 13 / 18 | 450 mono | Identifiers, weights, dates, counts. Tabular figures |
| `caption` | 12 / 16 | 400 | Supporting notes |
| `metric` | 24 / 28 | 600 | Counts on attention cards |

Hierarchy comes from **weight and ink depth**, not from size jumps. The scale
is deliberately tight: 12, 13, 14, 15, 21.

Labels are sentence case. v2's uppercase tracking added visual noise for no
information.

## 3. Colour

### Ink — four steps, carrying most of the hierarchy

| Token | Hex | Usage |
|---|---:|---|
| `ink-strong` | `#0d0e10` | The decisive value in a row |
| `ink` | `#26282d` | Ordinary text |
| `ink-muted` | `#6b6f76` | Supporting copy |
| `ink-faint` | `#71767f` | Labels, counts in navigation. 4.57:1 on white — the floor |

### Ground

| Token | Hex | Usage |
|---|---:|---|
| `bg` | `#ffffff` | Everything, including the shell |
| `bg-subtle` | `#fafafa` | Rare, for a genuinely inset area |
| `bg-hover` | `#f4f4f5` | Row hover |
| `bg-selected` | `#eef1fb` | Keyboard focus, active navigation |

### Lines

`line #eceef1` between rows and under headers. `line-strong #dfe2e6` only where
a region genuinely needs an edge. **Not around panels.**

### Accent and state

One accent, `#5b5bd6`, for links and the primary action. Used rarely enough
that it still means something.

State is `blocked #d4351c`, `warn #b45309`, `ready #15803d`, `idle #9ca0a8` —
applied to a 6px dot beside the word, never as a background.

## 4. Density

```
Table row        40px, no zebra, no vertical rules
Cell padding     0 12px
Control height   36px, 40px for a primary action
Section gap      24px
```

Rows are separated by a hairline and nothing else. Hover and keyboard focus are
the only row treatments.

## 5. Keyboard

Unchanged from v2 §4.3 and still central: `J`/`K` or arrows move, `Enter`
opens, `Home`/`End` jump, `Escape` clears. Focus is roving, so `Tab` leaves the
table rather than walking it.

## 6. Elevation

`raised` is a 1px hairline shadow for a sticky header. `overlay` is for drawers
and popovers only. **Nothing else has a shadow, and nothing else has a border
box.**

## 7. Anti-patterns

- No dark shell, dark table headers, or dark chrome of any kind.
- No filled state pills. A dot and a word.
- No box around a panel; use whitespace and one hairline.
- No uppercase labels.
- No zebra striping, no vertical rules in tables.
- No shadow on anything that does not float.
- No colour without a word beside it.
- Never more than three counters competing for attention on one screen.

## 8. Pre-delivery checklist

- [ ] The shell is white; no dark surfaces anywhere.
- [ ] State reads as a dot plus a word.
- [ ] Panels have no border box.
- [ ] Table rows are 40px, hairline-separated, no zebra.
- [ ] At most three attention counters per screen.
- [ ] The accent appears only on links and the primary action.
- [ ] Register is fully keyboard-operable.
- [ ] Focus is visible at 2px on every interactive element.
- [ ] No page-level horizontal overflow at 375, 768, 1024, 1440px.
- [ ] `prefers-reduced-motion` honoured.
- [ ] Every ink token measures at least 4.5:1 on white; no white text on a
      light ground.
