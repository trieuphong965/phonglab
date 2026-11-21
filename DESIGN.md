---
version: alpha
name: PhongLab
description: A calm, exact workspace for a control-panel engineer. Graphite surfaces, one cobalt accent, and wire-marker tubes.
---

# PhongLab design system

Read this file before changing any interface. The tokens below describe what ships in `@src/styles.css`. When a value changes, update both files in the same commit.

## Overview

PhongLab is a self-hosted personal workspace for an electrical control-panel engineer: schedules, drawings, documents, checklists, a daily journal, and a Vietnamese, Japanese and English glossary. People keep it open all day, so it has to stay quiet and easy to scan.

- **Character:** exact, calm, workshop.
- **World:** control panels, nameplates (銘板), wire numbers (線番), terminal blocks, pilot lamps, engineering drawings.
- **Where the richness goes:** the Gantt chart and checklist progress. Everything around them stays neutral.
- **Signature:** the printed wire-marker tube. It marks revisions and file types, and nothing else.
- **Density:** a working tool, not a landing page. Keep rows compact and aligned.

The design pass follows [unslop](https://github.com/heydamir/unslop) by Damir Sokolovsky ([@heydamir](https://x.com/heydamir)), CC BY 4.0.

## Colors

Surfaces, borders and text come from one graphite ramp. Cobalt is the only accent. It marks the current selection, work in progress, today and progress, and should cover only a few percent of a screen. Primary buttons use the ink color, not cobalt.

Red means late, failed or destructive. Amber is reserved for notices. Project swatches are user data and are the only other hues allowed in the chrome.

```yaml
colors:
  light:
    primary: "#171717"
    primary-hover: "#333333"
    on-primary: "#FFFFFF"
    accent: "#1F4FBF"
    accent-soft: "#E9EEFA"
    on-accent: "#FFFFFF"
    background: "#FAFAFA"
    sidebar: "#F4F4F5"
    surface: "#FFFFFF"
    surface-raised: "#F4F4F5"
    on-surface: "#171717"
    on-surface-secondary: "#525252"
    on-surface-muted: "#6B6B6B"
    outline: "rgba(23, 23, 23, 0.09)"
    outline-strong: "rgba(23, 23, 23, 0.18)"
    warning: "#92600A"
    error: "#C62828"
    status-todo: "#A3A3A3"
    status-doing: "#1F4FBF"
    status-done: "#525252"
    tube: "#F7F7F2"
    on-tube: "#171717"
    gantt-weekend: "rgba(23, 23, 23, 0.03)"
    gantt-track: "#DFE4EE"
    gantt-fill: "#1F4FBF"
    gantt-group: "#E4E4E7"
    gantt-group-fill: "#71717A"
    gantt-complete: "#52525B"
    gantt-late: "#F6DDDD"
    gantt-late-fill: "#C62828"
    gantt-arrow: "#A1A1AA"
  dark:
    primary: "#EDEDED"
    primary-hover: "#FFFFFF"
    on-primary: "#141415"
    accent: "#86A8F5"
    accent-soft: "#1E2638"
    on-accent: "#0F1520"
    background: "#141415"
    sidebar: "#0F0F10"
    surface: "#19191B"
    surface-raised: "#232325"
    on-surface: "#EDEDED"
    on-surface-secondary: "#A1A1A6"
    on-surface-muted: "#8B8B91"
    outline: "rgba(237, 237, 237, 0.08)"
    outline-strong: "rgba(237, 237, 237, 0.18)"
    warning: "#D9A441"
    error: "#EF6A6E"
    status-todo: "#6E6E74"
    status-doing: "#86A8F5"
    status-done: "#A1A1A6"
    tube: "#E9E9E2"
    on-tube: "#141415"
    gantt-weekend: "rgba(237, 237, 237, 0.025)"
    gantt-track: "#2A3243"
    gantt-fill: "#5F8BEE"
    gantt-group: "#2C2C2F"
    gantt-group-fill: "#85858B"
    gantt-complete: "#6E6E74"
    gantt-late: "#41262A"
    gantt-late-fill: "#D9545A"
    gantt-arrow: "#5F5F66"
```

## Typography

**IBM Plex Sans** is the interface face and **IBM Plex Mono** sets figures, dates, counts and wire markers. Both are self-hosted with Latin and Vietnamese subsets. Japanese falls back to Yu Gothic UI, Hiragino Sans, Noto Sans JP, then Meiryo.

Hierarchy comes from size and color. Use weights 400 and 500, with 600 only for strong emphasis inside Markdown. Use sentence case and tabular figures. Do not use uppercase tracked labels or italic emphasis.

```yaml
typography:
  headline-lg:
    fontFamily: IBM Plex Sans
    fontSize: 28px
    fontWeight: 500
    lineHeight: 36px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: IBM Plex Sans
    fontSize: 24px
    fontWeight: 500
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: IBM Plex Sans
    fontSize: 20px
    fontWeight: 500
    lineHeight: 28px
  title-sm:
    fontFamily: IBM Plex Sans
    fontSize: 14px
    fontWeight: 500
    lineHeight: 20px
  body-md:
    fontFamily: IBM Plex Sans
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
  body-reading:
    fontFamily: IBM Plex Sans
    fontSize: 14px
    fontWeight: 400
    lineHeight: 24px
  label-md:
    fontFamily: IBM Plex Sans
    fontSize: 13px
    fontWeight: 500
    lineHeight: 20px
  label-sm:
    fontFamily: IBM Plex Sans
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
  figure-lg:
    fontFamily: IBM Plex Mono
    fontSize: 28px
    fontWeight: 500
    lineHeight: 32px
  mono-editor:
    fontFamily: IBM Plex Mono
    fontSize: 14px
    fontWeight: 400
    lineHeight: 24px
  mono-sm:
    fontFamily: IBM Plex Mono
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
  mono-xs:
    fontFamily: IBM Plex Mono
    fontSize: 11px
    fontWeight: 400
    lineHeight: 16px
  marker:
    fontFamily: IBM Plex Mono
    fontSize: 11px
    fontWeight: 500
    lineHeight: 16px
```

## Layout

Everything sits on a 4px grid. The app shell fills the viewport with a 240px sidebar, collapsible to 56px, and fluid content capped at 1320px. Tool pages with a list use a 240 to 320px list pane beside a fluid detail pane.

- Navigation and list rows are 36px, compact controls 32px, touch targets 44px.
- Gantt rows are exactly 36px. The task column is 320px on desktop and 176px on phones. Keep `ROW` in `@src/pages/Gantt.tsx` in step with the CSS.
- Below 820px the sidebar becomes a drawer and split views show one pane at a time. Inputs use 16px text so phones do not zoom.

```yaml
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 20px
  2xl: 24px
  3xl: 32px
  4xl: 48px
  sidebar: 240px
  sidebar-collapsed: 56px
  content-max: 1320px
  row: 36px
  control: 32px
  touch: 44px
  breakpoint-mobile: 820px
```

## Elevation & Depth

Depth comes from surface steps and hairlines. In light mode, cards may use `0 1px 2px rgba(0, 0, 0, 0.05)`. In dark mode, resting surfaces have no shadow. Only floating layers (menus, modals, the task drawer) use `0 8px 24px` at 10% black in light mode and 40% in dark mode. No colored shadows, glows or glass.

## Shapes

Radius follows size: 4px for small marks and Gantt bars, 8px for rows and controls, 12px for cards and panels. An inner radius equals the outer radius minus the padding, and never goes below 4px. Pills are not part of this system. Only status dots are round.

```yaml
rounded:
  tube: 3px
  sm: 4px
  segment: 6px
  md: 8px
  lg: 12px
  full: 9999px
```

## Motion & Micro-interaction

Motion is feedback only. Hover and focus change color quickly, a pressed button scales to 0.98, and menus and modals rise 6px while fading in. Nothing loops. Animate only color, background, border, opacity and transform, and honor `prefers-reduced-motion`.

```yaml
motion:
  press:
    duration: 120ms
    delay: 0ms
    timingFunction: cubic-bezier(0.22, 1, 0.36, 1)
  state-change:
    duration: 140ms
    delay: 0ms
    timingFunction: cubic-bezier(0.22, 1, 0.36, 1)
  menu-enter:
    duration: 160ms
    delay: 0ms
    timingFunction: cubic-bezier(0.22, 1, 0.36, 1)
  surface-enter:
    duration: 200ms
    delay: 0ms
    timingFunction: cubic-bezier(0.22, 1, 0.36, 1)
  drawer:
    duration: 240ms
    delay: 0ms
    timingFunction: cubic-bezier(0.22, 1, 0.36, 1)
```

## Voice & Content Strategy

- **Tone of voice:** plain, precise and brief, like a label on a panel. No exclamation marks, hype or greetings.
- **Languages:** every interface string exists in Vietnamese, Japanese and English in `@src/lib.ts`. Never hard-code one language.
- **Capitalization:** sentence case for headings, buttons, labels and menus.
- **Terminology:** English uses Schedule, To-do, Diagrams, Documents, Journal, Checklists and Glossary. Vietnamese uses Tiến độ, Todo, Sơ đồ, Tài liệu, Nhật ký, Checklist and Thuật ngữ. Japanese uses 工程表, ToDo リスト, フロー図, 資料, 日報, チェックリスト and 用語集. Keep engineering terms such as 銘板, 部品表 and 線番 where the user works with them.
- **Actions:** short verb phrases that name the outcome, such as "Add task" or "Export month to Excel".
- **Empty and error states:** say what is missing or what failed. A destructive confirmation states what will be lost and that it cannot be undone.
- **Numbers and dates:** format dates with the active locale, use tabular figures, show revisions as `rev2` and hours as `12.5h`.

## Components

Components live in `@src/styles.css` and the pages under `src/pages`. Icons are Lucide line icons at 16px with a 1.5 stroke, in the color of their text role. Emoji are never used as icons.

- **Wire-marker tube:** an off-white printed tube with darker end caps, used only for revision numbers and file-type badges. It looks the same in both themes.
- **Gantt bars:** a neutral or tinted track with a solid fill. In progress is cobalt, complete is grey, late is red. Groups are thin neutral bars. Today is a 1px cobalt line with a filled date cell.
- **Selection:** a surface step with a hairline. In the sidebar, the active icon turns cobalt.
- **Tags:** quiet `#tag` text, not filled pills.

```yaml
components:
  button-primary:
    backgroundColor: "{colors.light.primary}"
    textColor: "{colors.light.on-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    height: "{spacing.control}"
    padding: 12px
  button-primary-hover:
    backgroundColor: "{colors.light.primary-hover}"
    textColor: "{colors.light.on-primary}"
  button-primary-dark:
    backgroundColor: "{colors.dark.primary}"
    textColor: "{colors.dark.on-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    height: "{spacing.control}"
    padding: 12px
  button-secondary:
    backgroundColor: "{colors.light.surface}"
    textColor: "{colors.light.on-surface}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    height: "{spacing.control}"
    padding: 12px
  button-secondary-dark:
    backgroundColor: "{colors.dark.surface}"
    textColor: "{colors.dark.on-surface}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    height: "{spacing.control}"
    padding: 12px
  input:
    backgroundColor: "{colors.light.surface}"
    textColor: "{colors.light.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    height: "{spacing.control}"
    padding: 12px
  card:
    backgroundColor: "{colors.light.surface}"
    textColor: "{colors.light.on-surface}"
    rounded: "{rounded.lg}"
    padding: 20px
  card-dark:
    backgroundColor: "{colors.dark.surface}"
    textColor: "{colors.dark.on-surface}"
    rounded: "{rounded.lg}"
    padding: 20px
  nav-item:
    textColor: "{colors.light.on-surface-secondary}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    height: "{spacing.row}"
    padding: 8px
  nav-item-active:
    backgroundColor: "{colors.light.surface}"
    textColor: "{colors.light.on-surface}"
    typography: "{typography.title-sm}"
    rounded: "{rounded.md}"
    height: "{spacing.row}"
    padding: 8px
  marker-tube:
    backgroundColor: "{colors.light.tube}"
    textColor: "{colors.light.on-tube}"
    typography: "{typography.marker}"
    rounded: "{rounded.tube}"
    height: 20px
    padding: 8px
  gantt-bar:
    backgroundColor: "{colors.light.gantt-track}"
    textColor: "{colors.light.on-surface}"
    typography: "{typography.mono-xs}"
    rounded: "{rounded.sm}"
    height: 20px
  gantt-bar-fill:
    backgroundColor: "{colors.light.gantt-fill}"
    textColor: "{colors.light.on-accent}"
    rounded: "{rounded.sm}"
    height: 20px
```

## Do's and Don'ts

- Do keep the chrome neutral and let the Gantt chart and progress carry the color
- Do use cobalt only for selection, in-progress work, today and progress
- Do use existing tokens, the 4px grid and one Lucide icon size
- Do add every new string in all three languages
- Do check new screens in light and dark themes and at phone width
- Don't use gradients, glows, colored shadows, glass, blobs or decorative images
- Don't use emoji, uppercase tracked labels, italic emphasis or weights above 600
- Don't use pills for tags, counts or dates
- Don't use the wire-marker tube for anything except revisions and file types
- Don't add greeting headlines, exclamation marks or hype words
- Don't animate width, height, top, left or margins, and don't add looping motion
