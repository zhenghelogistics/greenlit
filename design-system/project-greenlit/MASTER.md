# Design System Master File

**Project:** Project Greenlit
**Version:** 5.0 — colour with a job
**Supersedes:** v4.0 (legible), retained as `MASTER.v4-superseded.md`
**Reference point:** none. v1 through v4 each borrowed one, and the borrowing
is what kept producing a tool that looked like software for someone else.

---

## 0. Why v4 was replaced

v4 fixed legibility and stopped there. Everything was readable and nothing was
distinguishable: white panels on an off-white ground, grey headers, a single
blue accent doing every job at once. The operator's words were that it felt
"too high tech" and that staff "will use until their eye pain" — the second
part v4 had already addressed, the first it had not touched at all.

The mistake was treating colour as risk. v1 through v3 each overused it and
each was corrected by removing more, until v4 had almost none left and the
screen had nothing to orient by. Removing colour is not the same as using it
well.

### 0.1 One hue per kind of information

v5 gives colour a job. Five hues, each naming a kind of information, and none
appearing anywhere that is not the thing it names:

| Hue | | Names |
|---|---|---|
| Burnt orange | `#9a3412` | Money and deadlines — free time, last free day, anything that becomes a charge |
| Deep teal | `#0f5c6b` | Containers — numbers, seals, sizes, weights |
| Indigo | `#3730a3` | Movements — trips, trucks, collection and delivery |
| Emerald | `#065f46` | Documents — what arrived, what was read from it, permits |
| Plum | `#6b21a8` | History — what already happened, and who did it |

Colour that decorates has to be learned twice: once as a pattern, once as an
exception. Colour that encodes is learned once. A controller learns these five
grounds and then knows what they are looking at before reading a word, which is
the only thing colour is faster at than text.

### 0.2 Saturated, because white text is the ceiling

Each solid carries **white text at 7:1 or better**, and that requirement is
what caps the brightness. A lighter, more vivid colour cannot hold white type
at this contrast, so "saturated" here means rich rather than bright — 71% to
94% saturation, all of it dark enough to read white on.

The alternative was brighter grounds with dark text. It was rejected: a solid
block with white type reads as a heading, and a pale block with dark type reads
as a row. The blocks are headings.

A pale `-soft` wash of the same hue carries rows *inside* a block, with an
`-ink` that stays legible on it. So a section is a solid header over a white
body, with its own rows tinted to belong to it — colour marks where you are,
and the reading surface never moves.

### 0.3 What did not change from v4

The type scale, the 7:1 floor, the 44px targets and the 3px focus ring all
stand. v4's reader is still the reader: a controller in their fifties or
sixties, on this screen from seven in the morning. v5 does not spend any of
that back for the colour — every pairing was measured, and the five hues, the
five washes, the four state solids and both domain edges all clear 7:1.

## 0.4 Why v3 was replaced

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

## 0.5 Why v2 was replaced

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

### 2.0 Who reads this

Operations and controller staff, roughly fifty to seventy years old. Several
have poor eyesight. None would call themselves technical. They read this screen
for a whole shift and are tired by the end of it.

That is the only fact this section is derived from, and it is worth stating
first because every size below was once set by something else — the taste of
whoever wrote the component, or a stylesheet ported from a demo — and every one
of those was too small. Operations said so three times about the same table
before it was fixed.

**When a size is arguable, it goes up.** A screen that is slightly larger than
it needed to be costs a little scrolling. A screen that is slightly smaller
than it needed to be costs somebody their afternoon.

### 2.1 The scale

| Token | Size / line | Weight | Used for |
|---|---|---|---|
| `display` | 28 / 34 | 600 | Page title, one per screen |
| `section` | 24 / 30 | 600 | Section heading |
| `title` | 20 / 26 | 600 | Heading inside a card |
| `table` | 19 / 26 | 400 | Cells in the boards read all day |
| `body` | 17 / 24 | 400 | Everything ordinary |
| `caption` | 15 / 21 | 400 | Labels, helper text, the line under a value |
| `metric` | 34 / 38 | 600 | Counts on attention cards |

### 2.2 The floor

**Nothing is below 15px.** Not a caption, not a table footnote, not a badge.

This is enforced in `scripts/check-design-system.mjs`, and the enforcement has
been wrong twice in ways worth remembering:

- it read only `.jsx` and `.tsx`, so the ported stylesheet carried 122 sizes
  under the floor, nine of them at 8px;
- it matched `font-size:\d+px`, so `10.5px` did not match and eighty more
  survived — including the line under every job number on the dashboard.

Decimals are sizes. `em` and `rem` are refused outright, because whether
`0.8em` clears the floor depends on what it inherits and that cannot be judged
from the stylesheet.

**A rule scoped to an `id` is not enforcement.** The dashboard table's readable
sizes were written under `#dashboard`, which his demo rendered and ours does
not, so fifteen rules applied to nothing and the smaller base rule won.

### 2.3 Hierarchy

From weight and ink depth first, size second. The scale has six steps and they
are far enough apart to be told apart — the previous scale was 12, 13, 14, 15,
which is four steps nobody can distinguish and all of them too small.

Labels are sentence case. Uppercase tracking adds visual noise for no
information, and it is harder to read at length.

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
