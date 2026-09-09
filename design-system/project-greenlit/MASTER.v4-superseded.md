# Design System Master File

**Project:** Project Greenlit
**Version:** 4.0 — quiet, fast, and legible to the people who use it
**Supersedes:** v3.0 (quiet, keyboard-first), retained as `MASTER.v3-superseded.md`
**Reference point:** Linear, corrected for its audience

---

## 0. Why v3 was replaced

v3 was designed against the wrong reader. Its reference point was Linear — a
tool made for software teams, whose conventions assume a young, screen-native
audience: 14px body text, 12px captions, grey-on-white supporting copy at the
4.5:1 AA floor, and 36px controls.

The people who actually run this book are controllers in their fifties and
sixties, reading it all day. Every one of those conventions works against
them. Presbyopia is effectively universal past about 45, and contrast
sensitivity declines alongside it, so the AA floor — a minimum written for
the general population — is not a target for this audience. A 12px caption at
4.57:1 is legible in a design review and tiring on a Tuesday afternoon.

v4 changes the reader, not the character. Quiet, fast and keyboard-first all
survive; nothing became louder or more decorated. What changed is that the
quiet is now legible:

- **The whole type scale moved up** — body 14px to 17px, captions 12px to
  15px — with the spread between steps preserved, so the hierarchy v2
  restored still reads. This is not the v1 collapse in reverse: v1 put 76% of
  its text in a 2px band, and v4's steps are 13/15/17/19/22/26.
- **Every text colour now meets AAA (7:1), not AA.** `ink-faint` was 4.57:1
  and is 7.17:1. Contrast is measured in the build, not asserted here — v2
  claimed a token was "4.6:1" when it measured 2.9, which is exactly what an
  unmeasured claim is worth.
- **Targets are 44px**, not 36px. The gap between 36 and 44 widens with age.
- **Focus rings are 3px**, not 2px. Findable is not the same as unmissable.
- **Line height rose with the type.** Tight leading costs more as near vision
  declines, so 17px body sits on 26px rather than 20px.

## 0.1 Why v2 was replaced

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

One accent, **`#2563eb`**, and it is blue. 5.17:1 on white as text, and white
on it also passes, so the same value serves a link and a filled button without
a second token.

It means **"you can act on this"**, and appears only where that is true:

| Surface | Why |
|---|---|
| Job and customer references | They are links |
| Primary action buttons | The one thing to do on that screen |
| Current navigation destination | Where you are |
| Focused table row | A 2px rail, plus `bg-selected` |
| Focus ring | Keyboard position |
| Leading section rule | A 2px rule under the register's header, because it is the screen's centre of gravity |

`bg-selected #eff6ff` and `accent-soft #dbeafe` are its quiet grounds.

Used anywhere else it stops meaning anything, which is the whole reason the
rest of the palette is near-monochrome.

State is `blocked #d4351c`, `warn #b45309`, `ready #15803d`, `idle #9ca0a8` —
applied to a 6px dot beside the word, never as a background.

## 4. Density

```
Table row        48px, no zebra, no vertical rules
Cell padding     0 14px
Control height   44px, 48px for a primary action
Section gap      24px
```

44px is the smallest target most adults hit reliably on the first attempt, and
the margin between 36px and 44px widens with age. Density here comes from
whitespace and the absence of chrome, not from shrinking what a person has to
hit or read.

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
- [ ] The accent appears only where the user can act: links, primary
      actions, current destination, focus.
- [ ] Register is fully keyboard-operable.
- [ ] Focus is visible at 2px on every interactive element.
- [ ] No page-level horizontal overflow at 375, 768, 1024, 1440px.
- [ ] `prefers-reduced-motion` honoured.
- [ ] Every ink token measures at least 4.5:1 on white; no white text on a
      light ground.
