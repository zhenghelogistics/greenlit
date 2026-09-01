# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules override this Master file. Otherwise, follow this file and root `DESIGN.md`.

---

**Project:** Project Greenlit  
**Reconciled:** 2026-08-19  
**Category:** Maritime operations console  
**Implementation authority:** `GreenlitControlTower.jsx` and the approved `.impeccable/review/desktop.png` / `mobile.png` captures

---

## Global Rules

### Creative Direction

Project Greenlit is a calm, data-led maritime operations console. A deep ink-navy command shell anchors a cool neutral canvas with white work surfaces, slate rules, and plain operational copy. The interface is shift-ready and restrained: no gradients, glass, decorative illustration, or generic dashboard spectacle.

The first-view order is fixed: sticky command bar, page context, eight operational indicators, then Action Required. State color communicates real meaning only. The original brand accent remains the primary interaction color.

### Color Palette

| Role | Hex | Usage |
|---|---:|---|
| Ink navy shell | `#0f2333` | Persistent command bar |
| Active shell | `#18364c` | Current destination and command hover field |
| Work header | `#172a3a` | Table headers and job-detail next action |
| Brand action | `#17418c` | Primary actions, selected filters, linked job references |
| Brand action hover | `#12366f` | Primary-action hover |
| Focus sky | `#0284c7` | 4px keyboard focus outline |
| Active signal | `#38bdf8` | Thin current-destination underline |
| Canvas ground | `#f4f6f8` | Page background |
| Surface | `#ffffff` | Panels, cards, controls, and table rows |
| Quiet surface | `#f8fafc` | Alternating rows and subdued fields |
| Slate rule | `#e2e8f0` | Panel, row, and control separation |
| Primary ink | `#020617` | Counts and decisive facts |
| Body ink | `#0f172a` | Operational text |
| Muted ink | `#475569` | Supporting copy and labels |
| Exception rose | `#fff1f2` / `#9f1239` | Company-owned work, failed checkpoints, exceptions |
| Warning amber | `#fffbeb` / `#92400e` | Customer waiting, time risk, maintenance |
| Success emerald | `#ecfdf5` / `#065f46` | Ready, delivered, available, released |

Rules:

- Use solid color only; never introduce gradients.
- Keep Brand Action as the normal interaction color.
- Use rose, amber, and emerald only with a written state, number, or explanation.
- Use sky-blue information fields for guidance, never as a substitute for risk color.

### Typography

- **Heading stack:** `"IBM Plex Sans", "Inter", ui-sans-serif, system-ui, sans-serif`
- **Body stack:** `ui-sans-serif, system-ui, sans-serif`
- **Page headings:** 30px on narrow screens, 32px from 640px, weight 600
- **Panel titles:** 20px/28px, weight 600
- **Operational body:** 18px/27px, weight 400–600
- **Compact minimum:** 16px, weight 400–600
- **Metrics:** 24–30px in indicator cards; fleet totals may reach 36–48px
- **Common hierarchy ceiling:** 600; do not create hierarchy with 700–900 weights

### Spacing and Sizing

| Token | Value | Usage |
|---|---:|---|
| `--space-1` | `4px` | Tight label/icon gaps |
| `--space-2` | `8px` | Compact card padding and grid gaps |
| `--space-3` | `12px` | Control gaps and compact horizontal padding |
| `--space-4` | `16px` | Default mobile gutter and content padding |
| `--space-5` | `20px` | Panel headers and rows |
| `--space-6` | `24px` | Desktop panel padding and paired-panel gaps |
| `--space-7` | `28px` | Major section separation |
| `--space-8` | `32px` | Large-screen page gutter |
| Minimum target | `44px` | Every interactive control |

### Radius and Borders

- Containers use an 8px radius.
- Controls stay within a restrained 4–8px range; the common control radius is 6px.
- Pills are reserved for statuses, responsibility, job type, and count badges.
- Borders are normally 1px slate rules.
- The active command destination uses a 3px inset bottom signal.

### Elevation

- Ordinary panels, counters, filters, tables, and buttons have no resting shadow.
- Sticky command bar: `0 6px 20px rgba(15,23,42,0.14)`.
- Confirmation toast: `0 12px 32px rgba(15,23,42,0.20)`.
- Checkpoint release may use a transient inset green wash and low shadow, then must settle to flat.

---

## Responsive Layout Contract

### Containers

- General dashboard and action content: max 1800px.
- Job detail and fleet: max 1600px.
- Command bar inner frame: max 1900px.
- Page gutters: 16px default, 24px from 640px, 32px from 1024px.

### Command Bar

- Sticky at the top at every width.
- Below 1024px: brand/reset row above a three-column destination row.
- From 1024px: one horizontal operating bar.
- Dashboard, Action Required, and Chassis Fleet are always visible.
- Opening job detail preserves its origin; Back returns there and that navigation item remains active.

### Dashboard Indicators

- Below 1024px: compact 2×4 grid.
- From 1024px: 4×2 grid.
- From 1280px: one row of eight.
- Phone cards prioritize count, label, and icon; the tertiary note may hide.
- The Action Required header must remain visible in the first 844px phone viewport after all eight indicators.

### Registers

- Action Required is a stacked full-width job register below 1280px.
- From 1280px it becomes one dark-headed ruled table.
- Wide trip and fleet tables may scroll inside their own panel.
- The page itself must not overflow horizontally at 375, 768, 1024, or 1440px.

---

## Component Specs

### Primary Button

```css
.btn-primary {
  min-height: 56px;
  padding: 12px 24px;
  border: 0;
  border-radius: 6px;
  background: #17418c;
  color: #fff;
  font-size: 18px;
  font-weight: 600;
}

.btn-primary:hover { background: #12366f; }
.btn-primary:focus-visible { outline: 4px solid #0284c7; outline-offset: 2px; }
```

### Operational Panel

```css
.panel {
  overflow: hidden;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
  box-shadow: none;
}
```

Panel headers are white, 64px minimum height, and separated by a 1px slate rule. Panel and row padding is normally 16–24px.

### Operational Indicator

- White 8px card with 1px slate border and no shadow.
- 80px minimum height on phones; 112px from 640px.
- 24px count on phones, 30px from 640px, weight 600.
- 16px plain-language label.
- Small 32–36px icon field uses semantic tint only when the metric has semantic meaning.

### Filters

- 48px minimum height, 6px radius, 18px semibold label.
- Unselected: white with slate border and text.
- Selected: Brand Action with white text and `aria-pressed="true"`.

### Status and Responsibility Pills

- 32–36px minimum height with full radius.
- Pale semantic ground, matching rule, dark semantic ink.
- Meaning must be fully written: `Us`, `Customer`, `Carrier`, `Nobody`, `Ready for Collection`, and so on.

### Action Register

- Dark Work Header with white 16px semibold column labels.
- 18px row content and quiet slate dividers.
- Job reference is Brand Action, semibold, and underlined.
- Each row states blocking fact, next action, and waiting party in words.
- Below 1280px, keep these labels in a vertical job button rather than shrinking the table.

### Readiness and Next Action

- Readiness: 8px ruled panel, 36px pass/fail marks, 18px fact labels, solid READY or BLOCKED verdict.
- Next action: 8px Work Header surface with white text, written reason, and waiting party.

### Toast

- Fixed lower-right, max width 560px, white 8px field.
- Emerald confirmation icon and 18px semibold message.
- 44px dismiss target and polite live-region announcement.
- Remains visible for 5.2 seconds unless dismissed.

---

## Motion Contract

Authored motion is limited to the checkpoint-to-trip consequence:

- CMS sequence: readiness at 0ms, verdict at 650ms, status at 1300ms, created trip at 1950ms, next action at 2600ms.
- Release and text flashes: 1.1s with `cubic-bezier(0.16, 1, 0.3, 1)`.
- Created trip row: 1.35s left-to-right reveal with the same easing.
- Other controlled branches use 700ms steps.
- Created trips carry the label `Created automatically`.
- Reduced motion collapses the animation to 0.01ms while preserving final state and message.

Do not animate static decoration, lift cards on hover, or use looping ambient motion.

---

## Accessibility and Interaction

- 18px operational body; 16px compact minimum.
- 44px minimum target for every button and link.
- 4px visible Focus Sky outlines on light and dark surfaces.
- Never rely on color alone; use explicit text and icons.
- No hover-only information or icon-only primary actions.
- Keep all three destinations persistent and the Reset control visible.
- Respect `prefers-reduced-motion`.

---

## Anti-Patterns

- No gradients, glassmorphism, blur overlays, decorative illustration, or faux maritime texture.
- No dark-mode page canvas; dark color belongs to the command shell and dense work headers.
- No orange CTA system; Brand Action is `#17418c`.
- No rounded-everything treatment, pill buttons, or 12–16px card radii.
- No card lift, scale transform, or resting shadow on ordinary surfaces.
- No hidden mobile destinations or horizontally scrolling indicator strip.
- No page-level horizontal overflow at the four tested widths.
- No back action that loses the job-detail origin.

---

## Pre-Delivery Checklist

- [ ] Sticky command bar remains present at every width.
- [ ] Dashboard, Action Required, and Chassis Fleet are always visible.
- [ ] Phone indicators remain a prioritized 2×4 grid.
- [ ] Eight indicators become one row at 1280px.
- [ ] Action Required is visible within the first 844px phone viewport.
- [ ] No page-level overflow at 375, 768, 1024, or 1440px.
- [ ] Job-detail Back returns to Dashboard, Action Required, or Chassis Fleet as opened.
- [ ] Operational copy is 18px and compact copy is at least 16px.
- [ ] Interactive targets are at least 44px with visible focus.
- [ ] Semantic colors carry explicit words or values.
- [ ] Authored motion is limited to operational consequence and respects reduced motion.
- [ ] No gradients or ordinary resting shadows.
