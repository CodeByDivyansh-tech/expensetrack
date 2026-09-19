---
name: Fresh Student Wealth
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#3d4a42'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#6d7a72'
  outline-variant: '#bccac0'
  surface-tint: '#006c4a'
  primary: '#006948'
  on-primary: '#ffffff'
  primary-container: '#00855d'
  on-primary-container: '#f5fff7'
  inverse-primary: '#68dba9'
  secondary: '#565e74'
  on-secondary: '#ffffff'
  secondary-container: '#dae2fd'
  on-secondary-container: '#5c647a'
  tertiary: '#825100'
  on-tertiary: '#ffffff'
  tertiary-container: '#a36700'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#85f8c4'
  primary-fixed-dim: '#68dba9'
  on-primary-fixed: '#002114'
  on-primary-fixed-variant: '#005137'
  secondary-fixed: '#dae2fd'
  secondary-fixed-dim: '#bec6e0'
  on-secondary-fixed: '#131b2e'
  on-secondary-fixed-variant: '#3f465c'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#ffb95f'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 3rem
    fontWeight: '800'
    lineHeight: 3.5rem
    letterSpacing: -0.03em
  display-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 2.25rem
    fontWeight: '800'
    lineHeight: 2.75rem
    letterSpacing: -0.025em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 2rem
    fontWeight: '700'
    lineHeight: 2.5rem
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 1.5rem
    fontWeight: '700'
    lineHeight: 2rem
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 1.25rem
    fontWeight: '600'
    lineHeight: 1.75rem
    letterSpacing: -0.01em
  title-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 1.125rem
    fontWeight: '600'
    lineHeight: 1.5rem
  body-lg:
    fontFamily: Inter
    fontSize: 1rem
    fontWeight: '400'
    lineHeight: 1.5rem
  body-md:
    fontFamily: Inter
    fontSize: 0.875rem
    fontWeight: '400'
    lineHeight: 1.375rem
  body-sm:
    fontFamily: Inter
    fontSize: 0.75rem
    fontWeight: '400'
    lineHeight: 1.125rem
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 0.875rem
    fontWeight: '600'
    lineHeight: 1.25rem
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 0.75rem
    fontWeight: '600'
    lineHeight: 1rem
    letterSpacing: 0.02em
  numeric-balance:
    fontFamily: Plus Jakarta Sans
    fontSize: 2.5rem
    fontWeight: '800'
    lineHeight: 3rem
    letterSpacing: -0.03em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-tablet: 1.5rem
  margin: 1rem
  margin-tablet: 2rem
  margin-desktop: 3rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style
This design system is crafted specifically for college students navigating personal finance, shared living expenses, and early budgeting habits. Traditional fintech platforms often lean intimidating, cold, or overly corporate; this system balances financial clarity with a friendly, approachable, and optimistic spirit. 

The aesthetic is clean modern with tactile, pill-soft geometry and clear visual hierarchy. It blends rounded containment, luminous surface tints, and high-legibility figures to reduce financial anxiety and transform budgeting into an encouraging daily ritual. The interface celebrates micro-wins—such as hitting weekly grocery targets or contributing to a spring break fund—through energetic yet balanced accent tones.

## Colors
The palette relies on organic greens to evoke financial vitality and safety, grounded by deep slate neutrals and energized by warm warning accents.

- **Primary (`#059669`, with accent `#10B981`):** Serves as the key anchor for primary actions, positive cash flow, healthy budget states, and primary navigation active states.
- **Secondary (`#0F172A`, supportive `#1E293B`):** Acts as the high-contrast foundational layer for headings, critical figures, dark mode elements, and strong grounding elements.
- **Tertiary (`#F59E0B`):** Used for savings targets, milestones, warnings, and non-blocking threshold alerts.
- **Critical / Alert (`#EF4444`):** Reserved strictly for budget overruns, negative balances, and destructive actions.
- **Surfaces & Canvases:** The main canvas is set on `#F8FAFC` (Off-white canvas), while active summary cards and highlighted modules use `#F0FDF4` (Soft Mint). Card backgrounds remain crisp `#FFFFFF` with muted slate borders (`#E2E8F0`) to ensure legibility in bright outdoor campus settings.

## Typography
The typographic system pairs Plus Jakarta Sans for titles, metrics, and labels with Inter for structural body content.

- **Numeric Displays:** All primary financial totals, bank sync figures, and remaining balance metrics use `numeric-balance` or `display-lg-mobile` with tabular figures enabled (`font-feature-settings: "tnum"`). This prevents layout shifts during live input updates.
- **Hierarchy & Tone:** Plus Jakarta Sans provides geometric warmth and friendly, rounded letterforms that de-escalate stress in financial summaries. Inter delivers neutral, hyper-legible rendering across variable screen sizes for transaction logs, merchants, and fine print.

## Layout & Spacing
The layout operates on a mobile-first fluid model structured within a compact 4-column grid on mobile (< 640px), transitioning to an 8-column grid on tablet (640px–1024px), and a max-width 12-column layout (max 1200px) on desktop viewports.

- **Mobile Viewport Optimization:** Core mobile canvas margins are pinned to `1rem` (16px) to maximize touch surfaces on smaller handheld devices. Horizontal scrolling carousels (e.g., budget category breakdowns, peer splits) break margin constraints with negative margin bleeds and edge snapping.
- **Bottom Navigation Clearance:** The root viewport reserves a fixed bottom offset of `4.5rem` (72px) plus environment safe areas (`env(safe-area-inset-bottom)`) to guarantee zero occlusion from the persistent tab bar.

## Elevation & Depth
Depth is created through tinted ambient diffusion rather than harsh drop shadows, avoiding heavy structural divisions.

- **Level 0 (Canvas):** Flat base on `#F8FAFC`.
- **Level 1 (Default Cards & Tiles):** Elevated via `0 2px 8px -2px rgba(15, 23, 42, 0.04), 0 1px 3px -1px rgba(15, 23, 42, 0.02)` bordered by a crisp `1px solid #F1F5F9`.
- **Level 2 (Featured Savings & Key Totals):** Highlighted with a colored ambient aura: `0 10px 25px -5px rgba(5, 150, 105, 0.08), 0 4px 10px -3px rgba(15, 23, 42, 0.03)`.
- **Level 3 (Modals & Bottom Drawers):** Interactive bottom sheets and quick-log modals use `0 20px 35px -10px rgba(15, 23, 42, 0.16)`.
- **Persistent Bottom Nav:** Utilizes a subtle frosted backdrop blur (`backdrop-filter: blur(12px)`) at `rgba(255, 255, 255, 0.85)` with a top border rule of `1px solid rgba(226, 232, 240, 0.6)`.

## Shapes
The system employs a generous rounded design language to evoke approachability and contemporary app polish. 

- **Cards & Enclosures:** Primary content containers, spending cards, and modal sheets adopt extra-rounded profiles (`1rem` to `1.5rem` / `rounded-2xl` to `rounded-3xl`), removing visual sharpness from budget reviews.
- **Interactive Pills & Tags:** Action tags, status badges, filter buttons, and primary callouts take fully rounded pill geometry (`9999px`).
- **Input Fields & Alerts:** Form controls and transient alert boxes use uniform `0.75rem` (12px) radiuses to sit comfortably within higher-level card containers.

## Components

### Buttons
- **Primary:** Full pill-shaped (`rounded-full`), `#059669` emerald fill, white text, bold label typography (`label-md`). Padding: `0.75rem 1.5rem`. Subtle press feedback via `scale(0.98)` active state.
- **Secondary:** Surface `#1E293B` or `#F1F5F9` neutral with high-contrast text. 
- **Quick-Add Floating Action Button (FAB):** Centered floating circular control (`56px x 56px`) seated above or integrated into the bottom bar with an emerald gradient fill and white iconography.

### Cards & Budget Tiles
- **Standard Card:** White `#FFFFFF` background, `rounded-2xl`, `1rem` padding, subtle 1px border `#F1F5F9`.
- **Hero Balance Card:** Solid emerald `#059669` or soft mint `#F0FDF4` background. Features oversized display numerals for total balance, paired with horizontal progress meters showing weekly remaining allowance.
- **Progress Trackers:** Custom track background (`#E2E8F0`, 8px height, rounded full) with multi-state fills: Emerald (<80%), Amber (80-99%), and Red (100%+ overrun).

### Chips & Tags
- **Category Chips (Dining, Books, Rent, Nightlife):** Pill-shaped (`rounded-full`), height `32px`, lightweight colored tint backgrounds matching the category icon, paired with `label-sm` text.

### Transaction Lists
- Separator-free row layout. Leading rounded squircle icon container (`40px x 40px`, `rounded-xl`) with category tint, center stacked merchant name (`title-md`) and date (`body-sm`), trailing transaction amount colored `#0F172A` (or `#EF4444` for debits, `#059669` for deposits/scholarships).

### Inputs & Number Steppers
- Large currency entry inputs featuring fixed `$` prefix, zero border lines, zero background, centering large auto-sizing Plus Jakarta Sans digits. Form fields rely on `#F8FAFC` backgrounds with a transition to an emerald ring outline on `:focus`.

### Bottom Navigation
- Fixed 5-action bar (Home, Budgets, Quick Add [Center], Savings, Profile). Height: `64px`. Active items render with an emerald tint and micro indicator dot; inactive items utilize `#64748B`.