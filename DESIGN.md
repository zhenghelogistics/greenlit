---
name: "Project Greenlit"
description: "A calm maritime operations console that turns readiness facts into visible work."
colors:
  shell-ink: "#0f2333"
  shell-active: "#18364c"
  shell-hover: "#142e42"
  work-header: "#172a3a"
  brand-action: "#17418c"
  brand-action-hover: "#12366f"
  focus-sky: "#0284c7"
  active-signal: "#38bdf8"
  canvas-ground: "#f4f6f8"
  surface-white: "#ffffff"
  surface-quiet: "#f8fafc"
  slate-rule: "#e2e8f0"
  slate-control: "#cbd5e1"
  slate-ink: "#020617"
  slate-text: "#0f172a"
  slate-muted: "#475569"
  slate-soft: "#64748b"
  information-ground: "#f0f9ff"
  information-rule: "#bae6fd"
  information-ink: "#0c4a6e"
  success-ground: "#ecfdf5"
  success-rule: "#a7f3d0"
  success-solid: "#047857"
  success-ink: "#065f46"
  warning-ground: "#fffbeb"
  warning-rule: "#fde68a"
  warning-solid: "#b45309"
  warning-ink: "#92400e"
  exception-ground: "#fff1f2"
  exception-rule: "#fecdd3"
  exception-solid: "#be123c"
  exception-ink: "#9f1239"
typography:
  headline:
    fontFamily: '"IBM Plex Sans", "Inter", ui-sans-serif, system-ui, sans-serif'
    fontSize: "2rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  headline-compact:
    fontFamily: '"IBM Plex Sans", "Inter", ui-sans-serif, system-ui, sans-serif'
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  title:
    fontFamily: '"IBM Plex Sans", "Inter", ui-sans-serif, system-ui, sans-serif'
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.01em"
  metric:
    fontFamily: '"IBM Plex Sans", "Inter", ui-sans-serif, system-ui, sans-serif'
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  body:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  body-strong:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "normal"
  compact:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "normal"
rounded:
  small: "4px"
  control: "6px"
  container: "8px"
  pill: "9999px"
spacing:
  space-1: "4px"
  space-2: "8px"
  space-3: "12px"
  space-4: "16px"
  space-5: "20px"
  space-6: "24px"
  space-7: "28px"
  space-8: "32px"
components:
  button-primary:
    backgroundColor: "{colors.brand-action}"
    textColor: "{colors.surface-white}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.control}"
    padding: "12px 24px"
    height: "56px"
  button-secondary:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.brand-action}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
    height: "48px"
  filter-active:
    backgroundColor: "{colors.brand-action}"
    textColor: "{colors.surface-white}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.control}"
    padding: "8px 20px"
    height: "48px"
  navigation-active:
    backgroundColor: "{colors.shell-active}"
    textColor: "{colors.surface-white}"
    typography: "{typography.compact}"
    padding: "12px 20px"
    height: "64px"
  counter-card:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.slate-ink}"
    rounded: "{rounded.container}"
    padding: "16px"
  panel:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.slate-text}"
    rounded: "{rounded.container}"
    padding: "0px"
  next-action:
    backgroundColor: "{colors.work-header}"
    textColor: "{colors.surface-white}"
    rounded: "{rounded.container}"
    padding: "24px"
  status-exception:
    backgroundColor: "{colors.exception-ground}"
    textColor: "{colors.exception-ink}"
    rounded: "{rounded.pill}"
    padding: "4px 12px"
    height: "36px"
  status-warning:
    backgroundColor: "{colors.warning-ground}"
    textColor: "{colors.warning-ink}"
    rounded: "{rounded.pill}"
    padding: "4px 12px"
    height: "36px"
  status-success:
    backgroundColor: "{colors.success-ground}"
    textColor: "{colors.success-ink}"
    rounded: "{rounded.pill}"
    padding: "4px 12px"
    height: "36px"
---

# Design System: Project Greenlit

## Overview

**Creative North Star: "The Calm Maritime Console"**

Project Greenlit is a quiet, shift-ready operations console. A deep ink-navy command shell anchors the experience while cool neutral ground and white work surfaces keep dense operational information calm and legible. The interface feels precise and maritime without turning ports, containers, or anchors into decoration.

The system prioritizes responsibility, readiness, and consequence over dashboard spectacle. Common hierarchy tops out at medium-bold weight, compact containers use restrained corners, and colored states always explain a real operational fact in words. No gradient, glass, illustration, or ornamental motion competes with the work.

Its signature is causal feedback: when a checkpoint changes, the effect carries through the readiness verdict, job status, automatically created trip, and next action. Everything else stays visually steady.

**Key Characteristics:**

- A persistent deep ink command bar at every width.
- Cool neutral ground with white, lightly ruled work surfaces.
- 18px operational copy, 16px compact labels, and a restrained 600-weight ceiling for common hierarchy.
- Rose, amber, and emerald used only for named operational states.
- Compact 2×4 mobile indicators that become one row of eight at extra-large widths.

## Colors

Ink Navy provides the shell, Work Header distinguishes dense registers, and Brand Action preserves the original Project Greenlit interaction color. The remaining palette is deliberately cool and neutral so semantic state color retains meaning.

### Primary

- **Ink Navy** (`#0f2333`): Owns the persistent command shell and the strongest operating context.
- **Shell Active / Shell Hover** (`#18364c` / `#142e42`): Provide quiet navigation selection and hover states inside Ink Navy.
- **Brand Action** (`#17418c`): Owns primary actions, linked job references, selected filters, and important interactive text.
- **Active Signal** (`#38bdf8`): Appears only as the narrow current-destination underline in the command bar.

### Secondary

- **Work Header** (`#172a3a`): Heads operational tables and forms the job-detail next-action block.
- **Focus Sky** (`#0284c7`): Provides the high-contrast keyboard focus outline on both light and dark surfaces.
- **Information Ground / Rule / Ink** (`#f0f9ff` / `#bae6fd` / `#0c4a6e`): Explain demo guidance and active dashboard filters without implying urgency.

### Tertiary

- **Exception Rose** (`#fff1f2` / `#9f1239`): Marks company-owned work, open exceptions, failed checkpoints, and breached thresholds.
- **Warning Amber** (`#fffbeb` / `#92400e`): Marks customer waiting, approaching free-time risk, carpark dwell, and maintenance attention.
- **Success Emerald** (`#ecfdf5` / `#065f46`): Marks ready, delivered, available, released, and automatically created outcomes.

### Neutral

- **Canvas Ground** (`#f4f6f8`): The cool app field behind all work surfaces.
- **Surface White / Surface Quiet** (`#ffffff` / `#f8fafc`): The default panel and alternating-row grounds.
- **Slate Ink / Text / Muted / Soft** (`#020617` / `#0f172a` / `#475569` / `#64748b`): The primary-to-secondary text ladder.
- **Slate Rule / Control** (`#e2e8f0` / `#cbd5e1`): Quietly separate panels, rows, controls, and navigation regions.

**The Ink-Shell Rule.** Ink Navy frames navigation and operational context; Brand Action remains the primary interaction color and is not replaced by semantic color.

**The State-Means-Something Rule.** Rose, amber, and emerald must always accompany an explicit label, number, icon, or explanation of the condition.

**The No-Gradient Rule.** All surfaces use solid color, borders, and restrained tonal contrast.

## Typography

**Display Font:** IBM Plex Sans with Inter and system sans fallbacks.
**Body Font:** System sans (`ui-sans-serif, system-ui, sans-serif`).

**Character:** Headings are sturdy, familiar, and compact; operational copy is plain and readable. Hierarchy comes from size, spacing, color, and a controlled 600 weight rather than a stack of progressively heavier weights.

### Hierarchy

- **Headline** (600, 32px, 1.2): Page titles from the small breakpoint upward.
- **Headline Compact** (600, 30px, 1.2): Page titles on narrow screens.
- **Title** (600, 20px/28px): Panel headers, prominent identifiers, and named operational sections.
- **Metric** (600, 24–30px): Indicator counts; larger fleet totals may reach 36–48px while keeping the same weight.
- **Body** (400–600, 18px/27px): Operational prose, table content, filters, actions, status explanations, and job facts.
- **Compact** (400–600, 16px minimum): Command-bar support, indicator labels, table headings, and secondary notes.

**The Operational Type Rule.** Use 18px for operational reading and controls; 16px is the compact minimum, never a way to compress core work.

**The Weight Ceiling Rule.** Common hierarchy stops at 600. Stronger meaning comes from position, color, and spacing instead of 700–900 weight escalation.

## Layout

The experience is one calm operating canvas beneath a persistent sticky command bar. General work caps at 1800px, job detail and fleet views at 1600px, and the command frame at 1900px. Page gutters are 16px by default, 24px from 640px, and 32px from 1024px. Recurring section gaps are 20–28px, with 16–24px internal padding.

At narrow and medium widths, the command bar stacks a brand/reset row above a persistent three-column destination row. From 1024px it becomes one horizontal bar. Job detail remembers whether it was opened from Dashboard, Action Required, or Chassis Fleet; Back returns to that origin and the matching destination remains active.

The dashboard reading order never changes: page context, eight indicators, Action Required, then supporting carpark, free-time, and chassis registers. Indicators are a compact 2×4 grid below 1024px, a 4×2 grid from 1024px, and one row of eight from 1280px. On a 390×813 capture—and as a contract for the first 844px at phone widths—the Action Required header remains visible below all eight indicators.

Below 1280px the action register becomes stacked full-width job rows; at 1280px it becomes a single ruled table. Paired panels split at 1280px and supporting fact groups split from 768px where useful. Wide trip and fleet tables may scroll inside their bounded panel, but the page itself must not overflow horizontally at 375, 768, 1024, or 1440px.

All interactive controls meet a 44px minimum target. Mobile indicator cards prioritize the count, label, and state icon; secondary notes appear only where space permits.

**The First-Viewport Rule.** On phone screens, preserve command → title/date → 2×4 indicators → visible Action Required header within the first 844px.

**The Origin Rule.** Opening a job must never erase where the operator came from; Back and active navigation both preserve that context.

## Elevation & Depth

The system is flat at rest. White surfaces, cool ground, 1px slate rules, solid headers, and semantic fills provide depth without card shadows. The sticky command bar uses one low shadow to remain anchored, while the fixed confirmation toast uses the strongest elevation. Release feedback may create a short-lived shadow and then returns fully to flat.

### Shadow Vocabulary

- **Sticky Command Bar** (`0 6px 20px rgba(15,23,42,0.14)`): Separates persistent navigation from the scrolling canvas.
- **Confirmation Toast** (`0 12px 32px rgba(15,23,42,0.20)`): Keeps live confirmation readable over dense work.
- **Release Flash** (`inset 0 0 0 999px rgba(16,185,129,0.14), 0 8px 24px rgba(15,35,51,0.12)`): Temporary consequence feedback only.

**The Flat-at-Rest Rule.** Ordinary panels, indicators, filters, tables, and controls use borders and tonal separation, not resting shadows.

## Shapes

Containers use a subtle 8px radius and clip their joined rows cleanly. Controls stay restrained within a 4–8px range; the implemented default is a compact 6px corner. Pills are reserved for bounded statuses, responsibility, job type, and numeric navigation badges. Borders are normally 1px, while the active navigation signal is a narrow 3px inset underline.

**The Restrained-Corner Rule.** Radius may soften an operational surface but must not make the console bubbly; never turn every label or action into a pill.

## Components

### Buttons

- **Shape:** Restrained 6px control radius with a 44px minimum target; decisive record actions are 56px high.
- **Primary:** Brand Action with white 18px semibold text and 12px × 24px padding.
- **Hover / Focus:** Primary actions darken; all controls use a 4px Focus Sky outline, offset on light surfaces and inset where a full row is the target.
- **Secondary:** White or transparent with a visible slate or Brand Action border. Underlined text actions use a generous 44px hit area.

### Chips

- **Style:** Status and responsibility pills use a pale semantic ground, matching semantic border and ink, explicit text, and a full radius.
- **State:** `Us` is rose, `Customer` amber, `Carrier` neutral, and `Nobody` emerald. Filters remain compact rounded buttons, not pills, and expose `aria-pressed`.

### Cards / Containers

- **Corner Style:** Subtle 8px container radius.
- **Background:** Surface White over Canvas Ground; quiet rows may use Surface Quiet.
- **Shadow Strategy:** None at rest.
- **Border:** One 1px Slate Rule around the panel and between joined rows.
- **Internal Padding:** Usually 16–24px; indicator cards tighten to 12px at phone widths.

### Navigation

The sticky command shell always exposes Dashboard, Action Required, and Chassis Fleet. Narrow widths use a three-column destination row below the brand; wide widths use one horizontal frame. The active destination uses Shell Active with a thin Active Signal underline, while counts remain compact outlined pills. Reset stays visible in the brand row at every width.

### Operational Indicators

Each indicator is a compact white button with count, plain-language label, and a small state-tinted icon field. Phone cards are approximately 80px minimum height and omit the tertiary note; from 640px they become roomier. Indicator color is semantic only when the count represents risk or availability.

### Action Register

The urgency-ranked register keeps job, status, blocking fact, next action, and waiting party explicit. It is a dark-headed table at extra-large widths and a vertical stack of full-width job buttons below that breakpoint. Linked job identifiers use Brand Action and an underline; rows use quiet alternate fills and pale information hover feedback.

### Readiness & Next Action

Readiness uses ruled fact rows with an explicit pass/fail icon, label, and recorded value, followed by a full-width READY or BLOCKED verdict. Its paired Next Action surface is Work Header with white text and written explanations for why and waiting on whom.

### Checkpoint-to-Trip Consequence

The canonical CMS sequence highlights readiness at 0ms, verdict at 650ms, status at 1300ms, the new trip row at 1950ms, and next action at 2600ms. The release and text flashes last 1.1 seconds; the created row wipes in over 1.35 seconds. Other branch sequences use 700ms steps. The created row is labelled `Created automatically`, and the confirmation toast remains for 5.2 seconds. Reduced-motion mode collapses authored animation to 0.01ms while preserving the final state and message.

**The Consequence-Carry Rule.** Authored motion must connect a changed checkpoint to a downstream operational result; never animate static decoration.

## Do's and Don'ts

### Do:

- **Do** preserve the first-view order of command, context, eight indicators, then Action Required.
- **Do** keep the command bar sticky and all three destinations visible at every width.
- **Do** preserve the 2×4 phone indicator grid and one-row eight-indicator layout from 1280px.
- **Do** use 18px operational copy, a 16px compact minimum, 44px targets, and visible focus outlines.
- **Do** state status and responsibility in words before reinforcing them with semantic color.
- **Do** return job detail to the destination from which the job was opened.

### Don't:

- **Don't** introduce gradients, glass, decorative maritime imagery, or ornamental motion.
- **Don't** replace Brand Action with rose, amber, or emerald for ordinary interaction.
- **Don't** exceed the restrained 4–8px corner language for ordinary controls and containers.
- **Don't** compress the eight indicators into horizontal scrolling or hide Action Required below the first phone viewport.
- **Don't** allow page-level horizontal overflow at 375, 768, 1024, or 1440px.
- **Don't** add hover-only explanations, icon-only primary actions, or resting shadows to ordinary cards.
