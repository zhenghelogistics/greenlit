# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules override this Master file.

---

**Project:** Project Greenlit
**Version:** 2.0 — full redesign
**Supersedes:** v1.0 (19 Aug 2026), retained as `MASTER.v1-superseded.md`
**Category:** Maritime operations control tower
**Direction:** Operational instrument

---

## 0. Why v1 was replaced

v1 was a coherent, deliberately austere console. It failed for one measurable
reason: **its own rules made typographic hierarchy impossible.**

Audit of the v1 implementation, 2,600 lines:

| Finding | Measurement |
|---|---|
| Text in a single 2px band (16–18px) | **132 of 173 uses — 76%** |
| `font-semibold` share of all weights | **171 of 220 — 78%** |
| Distinct elevation levels available | **1** |
| Horizontal paddings for similar containers | **4** (`px-3/4/5/6`) |

Three quarters of the interface was the same size and the same weight. Nothing
could be emphasised because everything already was. v1 mandated this directly:
*"Operational body: 18px"*, *"Compact minimum: 16px"*, *"hierarchy ceiling
600"*, *"no resting shadow on ordinary surfaces"*.

v1 also specified touch sizing — 18px body, 44px targets — for a product whose
own responsive contract names desktop at 1440px+ as primary and whose core
screen is a dense operational table. Density lost that fight every time.

**What v2 keeps:** the ink-navy command shell, the brand blue, semantic colour
discipline, no gradients, no decorative ornament, and the principle that colour
never carries meaning alone.

**What v2 changes:** the type system, the weight system, elevation, density,
and spacing rhythm.

---

## 1. Creative Direction

Greenlit is an **operational instrument**, not a dashboard product. The
reference points are a trading terminal and an air-traffic display: dense,
precise, quiet until something needs attention, and unmistakably technical.

Three principles govern every decision:

1. **Density is a feature.** A controller scanning forty containers should see
   forty, not twelve. Space is spent on data, not on padding.
2. **Hierarchy is earned by contrast, not by shouting.** Size, weight and ink
   depth do the work. If everything is emphasised, nothing is.
3. **Data is typeset as data.** Identifiers, weights, dates and counts are set
   in a tabular monospaced face so digits align in a column and a transposed
   character is visible.

---

## 2. Typography

### 2.1 Faces

- **Interface:** `"Fira Sans", ui-sans-serif, system-ui, sans-serif`
- **Data:** `"Fira Code", ui-monospace, "SF Mono", Menlo, monospace`
- **Fallback stack must be complete.** Never ship a face without one.

Fira Code is used **only** for machine-generated values: container numbers,
seal numbers, job numbers, weights, VGM, dates, times, counts, chassis numbers.
It is never used for prose.

### 2.2 Scale

Six steps. This is the fix for v1's collapse — each step is at least 2px and
one weight or ink level from its neighbour.

| Token | Size / line | Weight | Face | Used for |
|---|---|---|---|---|
| `display` | 28 / 34 | 600 | Sans | Page title, one per screen |
| `title` | 18 / 24 | 600 | Sans | Panel headers, job number in detail |
| `body` | 15 / 22 | 400 | Sans | Operational prose, descriptions, reasons |
| `label` | 12 / 16 | 500 | Sans | Column heads, field labels. `letter-spacing: .04em`, uppercase |
| `data` | 14 / 20 | 400 | **Mono** | Identifiers, weights, dates, counts. `font-variant-numeric: tabular-nums` |
| `caption` | 12 / 16 | 400 | Sans | Supporting notes, timestamps, hints |

**Metrics** (KPI counts, fleet totals) use `data` at 26/30, weight 500.

### 2.3 Weight discipline

Only three weights. 700+ is never used.

```
400   body, data, captions          the default
500   labels, metrics, emphasis     the working weight
600   display, title                structural only
```

**A weight above 500 inside a table cell is a bug.** Emphasis in dense content
comes from ink depth, not weight — see §3.2.

---

## 3. Colour

### 3.1 Palette

| Role | Hex | Usage |
|---|---:|---|
| Shell | `#0f2333` | Command bar |
| Shell active | `#18364c` | Current destination, command hover |
| Work header | `#172a3a` | Table headers |
| Brand | `#1e40af` | Primary actions, links, selected filters |
| Brand hover | `#1a3897` | Primary hover |
| Accent | `#b45309` | Attention without alarm: counts needing action |
| Focus | `#0284c7` | 3px keyboard focus ring |
| Canvas | `#f1f5f9` | Page ground |
| Surface | `#ffffff` | Panels, rows, controls |
| Surface quiet | `#f8fafc` | Alternating rows, disabled fields |
| Rule | `#e2e8f0` | Standard 1px separation |
| Rule strong | `#cbd5e1` | Panel edges, table outer border |

### 3.2 The ink ramp

This carries hierarchy inside dense content, replacing weight.

| Token | Hex | Usage |
|---|---:|---|
| `ink-strong` | `#020617` | The decisive fact: next action, counts, identifiers |
| `ink` | `#1e293b` | Ordinary operational text |
| `ink-muted` | `#64748b` | Supporting copy: blocking reasons, timestamps |
| `ink-faint` | `#94a3b8` | Labels, placeholders, disabled |

**Rule:** in any row, exactly one value may use `ink-strong`. It is the thing
the controller must act on.

### 3.3 Semantic states

| State | Ground | Ink | Meaning |
|---|---:|---:|---|
| Exception | `#fff1f2` | `#9f1239` | Failed checkpoint, exception, our cost |
| Warning | `#fffbeb` | `#92400e` | Time risk, waiting on customer |
| Ready | `#ecfdf5` | `#065f46` | Ready, released, delivered, available |
| Neutral | `#f1f5f9` | `#475569` | Informational, no judgement |

Semantic colour **always** accompanies a written state or number. Never alone.

---

## 4. Density

Two tiers. This is the second structural change from v1.

### 4.1 Comfortable — controls and primary surfaces

Buttons, filters, form fields, navigation, drawers.

```
Minimum target      40px
Button height       40px   (44px for the primary action on a form)
Control padding     8px 14px
Field text          15px
```

### 4.2 Compact — operational tables and registers

Action Required, trackers, container lists, transport schedule.

```
Row height          36px minimum, 44px where a row wraps to two lines
Cell padding        8px 12px
Row text            14px data / 15px prose
Header              12px label, uppercase
Row target          the whole row is clickable; no separate chevron column
```

**A dense table must not carry a trailing chevron column.** The row is the
target. That column is 60px of every row spent on no information.

Compact tier applies below 1280px only by dropping to the stacked register —
never by shrinking below these values.

---

## 5. Spacing

Strict six-step scale. No intermediate values.

| Token | Value | Usage |
|---|---:|---|
| `space-1` | `4px` | Icon/label gaps |
| `space-2` | `8px` | Cell padding, tight stacks |
| `space-3` | `12px` | Control gaps, cell horizontal padding |
| `space-4` | `16px` | Panel padding, default gutter |
| `space-5` | `24px` | Panel separation, desktop gutter |
| `space-6` | `32px` | Major section separation |

**Horizontal padding inside a panel is `space-4`. One value.** v1 used four
different paddings for equivalent containers; that inconsistency is what made
the layout feel unresolved.

---

## 6. Elevation

Three levels. v1 had one, which left no way to express layering.

| Level | Shadow | Usage |
|---|---|---|
| `flat` | none | Panels, cards, table rows, filters |
| `raised` | `0 1px 2px rgba(2,6,23,.06), 0 2px 8px rgba(2,6,23,.04)` | Sticky command bar, sticky table header |
| `overlay` | `0 8px 24px rgba(2,6,23,.12)` | Drawers, popovers, toasts, modals |

Ordinary surfaces stay flat. Elevation means "this floats above the page",
never "this is important".

---

## 7. Shape

```
Panels, cards       6px
Controls, inputs    4px
Pills               999px  (status, responsibility, counts only)
Table               6px outer, square rows
```

Borders are 1px `rule`; panel outer edges use `rule-strong`. The active
command destination keeps a 2px inset bottom signal.

---

## 8. Component Specs

### 8.1 Primary button

```css
.btn-primary {
  height: 40px; padding: 0 14px;
  border: 0; border-radius: 4px;
  background: #1e40af; color: #fff;
  font: 500 15px/1 "Fira Sans", ui-sans-serif, system-ui, sans-serif;
}
.btn-primary:hover { background: #1a3897; }
.btn-primary:focus-visible { outline: 3px solid #0284c7; outline-offset: 2px; }
```

### 8.2 Panel

```css
.panel {
  border: 1px solid #cbd5e1; border-radius: 6px;
  background: #fff; box-shadow: none; overflow: hidden;
}
.panel__header {
  display: flex; align-items: center; justify-content: space-between;
  min-height: 44px; padding: 0 16px;
  border-bottom: 1px solid #e2e8f0;
}
```

### 8.3 Indicator card

Equal height is structural, not incidental. Every card reserves the same
label and note space so a three-line label cannot bulge its neighbour.

```
Height              88px fixed
Padding             12px
Count               26px mono, weight 500, ink-strong, tabular-nums
Label               12px uppercase label token, ink-muted, reserved 2 lines
Note                12px caption, ink-faint, reserved 1 line
Icon                20px, aligned to the count baseline, semantic tint only
                    where the metric carries semantic meaning
```

### 8.4 Operational table

```
Header              work-header ground, 12px uppercase label, white
Row                 36px min, 1px rule divider, quiet surface on even rows
Hover               surface-quiet; whole row is the target
Identifier          data token, brand ink, underlined on hover only
Next action         body, ink-strong          <- the one strong value
Blocking reason     body, ink-muted           <- deliberately quieter
Status              pill, semantic ground, written state
```

### 8.5 Pills

```
Height              22px
Padding             0 8px
Text                12px label token, weight 500
Radius              999px
Ground              semantic pale; ink semantic dark; 1px matching border
```

Pills are for status, responsibility, job type and counts. Never for actions.

---

## 9. Motion

Restrained and purposeful. Authored motion is reserved for operational
consequence — a checkpoint releasing a gate and creating a trip.

```
Micro-interaction   140ms   ease-out        hover, focus, pill change
State change        220ms   cubic-bezier(.16,1,.3,1)
Consequence chain   700ms steps, as v1 specified
```

Never animate decoration. Never lift a card on hover. Never loop ambient
motion. `prefers-reduced-motion` collapses all authored motion to 0.01ms while
preserving the final state and any announced message.

---

## 10. Accessibility

- Contrast: 4.5:1 minimum for text. `ink-faint` on white is **4.6:1** at 12px —
  it is the floor and must not be used for anything a controller must read.
- Minimum interactive target 40px in comfortable tier; in compact tables the
  **row itself** is the target and meets 36px with the full row width.
- 3px `focus` outline, offset 2px, visible on light and dark surfaces.
- Colour never carries meaning alone; every semantic ground has written text.
- No hover-only information. No icon-only primary actions.
- Respect `prefers-reduced-motion`.

---

## 11. Anti-patterns

- No gradients, glassmorphism, blur, decorative illustration or faux texture.
- No dark page canvas; dark belongs to the command shell and table headers.
- No weight above 500 inside a table cell.
- No text at 16–18px doing the job of both body and label — that collapse is
  what v2 exists to fix.
- No resting shadow on ordinary panels.
- No trailing chevron column on a dense table.
- No horizontal page overflow at 375, 768, 1024 or 1440px.
- No emoji as icons. Lucide only, 20px in dense contexts.

---

## 12. Pre-delivery checklist

- [ ] Six type steps present and visually distinct; no 16–18px collapse.
- [ ] No `font-bold` / weight 700+ anywhere.
- [ ] All identifiers, weights, dates and counts set in the mono data token.
- [ ] Exactly one `ink-strong` value per table row.
- [ ] Indicator cards are equal height with reserved label and note slots.
- [ ] Table rows 36px+, whole row clickable, no chevron column.
- [ ] Panel horizontal padding is 16px everywhere.
- [ ] Three elevation levels used correctly; panels flat.
- [ ] Focus visible at 3px on every interactive element.
- [ ] Semantic colour always paired with written text.
- [ ] No page-level horizontal overflow at the four tested widths.
- [ ] `prefers-reduced-motion` honoured.
