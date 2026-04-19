# Visual Design Document

## Purpose

This document captures the visual system currently implemented in the website codebase. It reflects the existing UI, not an aspirational redesign.

Primary implementation sources:

- `src/app/layout.tsx`
- `src/app/globals.css`
- `src/app/page.tsx`
- `src/app/login/page.tsx`
- `src/app/profile/page.tsx`
- `src/app/u/[username]/page.tsx`
- `src/components/Header.tsx`
- `src/components/Footer.tsx`
- `src/components/CityFilter.tsx`
- `src/components/HomeSpotCard.tsx`
- `src/components/SpotDetailModal.tsx`
- `src/components/OnboardingModal.tsx`
- `src/components/Pagination.tsx`
- `src/components/Toast.tsx`
- `src/app/admin/page.tsx`

## Brand Character

The product presents itself as:

- editorial, minimal, and slightly archival rather than glossy SaaS
- monochrome-first, with a warm paper-like canvas instead of a cold white app shell
- typography-led, using uppercase mono labels to create identity and structure
- image-forward on discovery surfaces, with photography carrying most of the emotional weight

The public experience feels like a curated club or field guide. The admin experience keeps the same neutral palette, but uses more standard app-shell conventions and supports dark mode.

## Font System

Global font setup is defined in `src/app/layout.tsx` using `next/font/google`:

- Primary sans: `Geist`
- Secondary mono: `Geist Mono`

Theme bindings in `src/app/globals.css`:

- `--font-sans: var(--font-geist-sans)`
- `--font-mono: var(--font-geist-mono)`

### Usage Rules

- `Geist` is the default body and heading face.
- `Geist Mono` is used for labels, metadata, badges, navigation links, utility actions, and small interface chrome.
- Mono text is almost always uppercase with expanded tracking.

## Color System

The site relies on a restrained neutral system with one custom accent.

### Core Surface Colors

| Token | Value | Usage |
| --- | --- | --- |
| Canvas background | `#f5f5f2` | Main public-site background |
| Base light surface | `#ffffff` | Cards, modals, overlays, form surfaces |
| Global light background token | `#ffffff` | `:root --background` |
| Global light foreground token | `#000000` | `:root --foreground` |
| Global dark background token | `#000000` | `prefers-color-scheme: dark` fallback |
| Global dark foreground token | `#ffffff` | `prefers-color-scheme: dark` fallback |

### Primary Neutral Scale In Use

These are mostly standard Tailwind neutral tokens used directly in class names:

| Token | Approx. Hex | Usage |
| --- | --- | --- |
| `neutral-900` | `#171717` | Primary text, strong emphasis |
| `neutral-800` | `#262626` | Secondary high-emphasis text |
| `neutral-700` | `#404040` | Buttons, controls, tertiary text |
| `neutral-600` | `#525252` | Body-supporting text |
| `neutral-500` | `#737373` | Labels, meta text, helper copy |
| `neutral-400` | `#a3a3a3` | Placeholders, very low emphasis |
| `neutral-300` | `#d4d4d4` | Input and divider borders in admin |
| `neutral-200` | `#e5e5e5` | Soft container borders in admin |
| `neutral-100` | `#f5f5f5` | Hover and loading backgrounds |
| `neutral-50` | `#fafafa` | Admin section backgrounds |

### Accent / Semantic Colors

| Token | Value | Usage |
| --- | --- | --- |
| Accent link blue | `#2f47d6` | Share link on profile page |
| Error red | `red-700` / approx. `#b91c1c` | Error text |
| Error tint | `red-50` with transparency | Error toast background |
| White text overlays | `white`, `white/90`, `white/80` | Image-card captions |

### Transparency and Layering

A large part of the visual feel comes from translucency rather than many colors:

- `bg-white/50`, `bg-white/60`, `bg-white/70`, `bg-white/80`, `bg-white/90`, `bg-white/95`
- `border-black/10`, `border-black/15`, `border-black/20`, `border-black/25`
- `bg-black/45` for modal scrims
- `from-black/80` gradients over imagery

This makes the interface feel soft and printed rather than flat-solid.

## Typography

### Primary Hierarchy

| Level | Typical classes | Usage |
| --- | --- | --- |
| Hero / profile handle | `text-3xl`, `text-2xl`, `tracking-tight` | Public profile identity, detail titles |
| Section heading | `text-xl`, `text-2xl`, `font-medium`, `tracking-tight` | Login heading, modal heading, profile sections |
| Card title / item title | `text-sm`, `font-medium` or `font-semibold` | Spot names, list item labels |
| Body copy | `text-sm` | Descriptions, helper text, empty states |
| Small helper copy | `text-xs` | Notes, support copy, system messaging |
| Micro labels | `text-[10px]`, `text-[11px]`, `uppercase` | Meta labels, tabs, buttons, chips |
| Ultra-micro badge | `text-[9px]` | "Yet to Try" badge on cards |

### Typography Conventions

- Sans headings use `font-medium` and `tracking-tight` instead of heavy weights.
- Most utility/UI labels use mono uppercase with tracking between roughly `0.13em` and `0.22em`.
- The wordmark `NewSpots.club` is mono, uppercase, and spaced out rather than logo-driven.
- Body copy stays understated and usually sits in `neutral-600`.

### Tracking Patterns

Common values in use:

- `tracking-tight` for major headings
- `tracking-[0.1em]` for avatar initials and compact micro labels
- `tracking-[0.13em]` to `tracking-[0.16em]` for most mono controls
- `tracking-[0.18em]` to `tracking-[0.22em]` for branding and section overlines

## Layout System

### Widths

- Main public shell: `max-w-6xl`
- Reading / form shell: `max-w-md`, `max-w-lg`, `max-w-4xl`
- Detail modal shell: `max-w-3xl`

### Spacing Rhythm

Common layout spacing:

- Page padding: `px-4 py-6` on mobile, `md:px-8 md:py-8` on larger screens
- Section spacing: `mb-7`, `mb-8`, `mt-7`, `mt-10`, `mt-12`
- Card/content padding: `p-3`, `p-4`, `p-5`, `p-6`
- Dense controls: `px-2.5 py-1.5`
- Primary actions: `px-3 py-2` or `px-3 py-2.5`

The rhythm is compact. The UI prefers tightly packed controls with more generous spacing only at section boundaries.

### Grid and Structure

- Homepage uses a `2-column` mobile grid and `3-column` desktop grid for spot discovery.
- Cards keep a fixed `aspect-[4/5]` ratio.
- Modals and profile layouts switch to two-column compositions on desktop.

## Shape, Borders, and Elevation

### Corners

- Public content largely uses square or nearly square corners.
- `rounded-md` is used on discovery cards.
- `rounded-sm` is used on toast surfaces.
- `rounded-full` is used only for avatars.
- Admin surfaces are noticeably softer, using `rounded-lg` and `rounded-xl`.

### Borders

Borders define most separation. The system uses borders more than shadows.

- Standard public border: `border-black/20`
- Strong border: `border-black`
- Soft divider: `border-black/10`
- Admin borders shift to neutral/white tokens depending on dark mode

### Elevation

- Minimal shadow usage overall
- `shadow-sm` for lightweight menus and toasts
- `shadow-xl` / `shadow-2xl` reserved for blocking modals
- `backdrop-blur` is used sparingly for menus and the login card

## Background Treatment

The homepage and login page share a subtle atmospheric background made from:

- a warm base canvas: `#f5f5f2`
- radial dark wash from the top-left
- soft top-to-bottom white-to-dark linear overlay

This treatment gives the site a slightly tactile, paper-and-light feel while staying minimal.

## Imagery

Photography is a primary visual ingredient.

- Spot cards are full-bleed image tiles.
- Text is placed over a dark bottom gradient for legibility.
- Images scale slightly on hover (`scale-[1.02]`) for a restrained motion cue.
- Modals preserve photography as the dominant left column / top panel.

Image behavior is intentionally simple:

- `object-cover`
- hard crop to maintain grid regularity
- text overlays instead of separate metadata blocks whenever possible

## Component Guidelines

### Header

- Mono wordmark with uppercase tracking
- lightweight text links with underlines instead of filled nav pills
- profile/auth actions treated as utility controls, not primary calls to action

### Filter Chips

- Mono uppercase micro labels
- inactive: translucent white surface with faint black border
- active: solid black background with white text
- no pill radius; the aesthetic is more editorial than playful

### Discovery Cards

- fixed aspect image tile
- border-first framing
- minimal metadata: title, city, optional hero dish
- small status badge for unverified spots
- floating add button in upper-right corner

### Menus and Overlays

- light translucent white panels
- black border at low opacity
- mono uppercase actions
- hover state often flips to black background with white text

### Forms

- simple rectangular fields
- transparent or white backgrounds depending on page context
- black/neutral 20-30% borders
- label text is mono uppercase microcopy
- strong black primary action, understated secondary border action

### Modals

- full-screen dim scrim (`bg-black/45`)
- centered card with strong border and high shadow
- public modals preserve the editorial tone with almost no rounding

### Toasts

- fixed bottom-right placement
- small, square, quiet surfaces
- success remains neutral; error becomes red-tinted

## Interaction States

### Hover

- borders darken from translucent black to solid black
- white surfaces become slightly more opaque
- some actions invert from light to black
- image tiles scale very slightly

### Active / Selected

- selected filter and pagination items are black with white text
- menus use checkmarks and lock icons instead of color-heavy states

### Disabled

- mostly handled with `opacity-50` or `opacity-60`
- avoids special disabled colors

### Errors

- red text or red-tinted toasts
- not a large part of the visual identity; only used when needed

## Motion

Motion is restrained.

- global custom animation: `pill-enter` (`180ms ease-out`) defined in `globals.css`
- common transitions use short Tailwind defaults such as `transition` or `duration-300`
- scroll-to-top pagination behavior respects `prefers-reduced-motion`

The product does not rely on motion for personality. Motion is used for polish and clarity only.

## Public Site vs Admin UI

### Public Site

- warmer canvas (`#f5f5f2`)
- image-led, editorial, lightly translucent
- square corners, thin borders, mono metadata

### Admin UI

- same neutral family, but more conventional app-shell structure
- heavier use of `neutral-50`, `neutral-200`, `neutral-300`
- rounded containers (`rounded-lg`, `rounded-xl`)
- explicit dark mode variants across controls and surfaces

The admin interface is visually related to the public product, but operationally more like a utility dashboard.

## Practical Design Rules

When extending the existing website, follow these rules:

1. Start with monochrome and only add color when it conveys meaning.
2. Use `Geist Mono` for UI chrome, labels, and metadata; use `Geist` for content and headings.
3. Prefer borders, spacing, and typography for hierarchy before adding fills or shadows.
4. Keep card and form shapes mostly square; avoid overly rounded consumer-app styling.
5. Use translucent white surfaces on the public site instead of flat gray panels.
6. Keep buttons compact and uppercase; avoid oversized CTA styling unless the page is explicitly promotional.
7. Preserve the warm paper-like canvas on public-facing pages.
8. Let photography carry visual richness; the UI itself should stay restrained.
9. Use the blue accent sparingly; the current implementation treats it as an exception, not a system color.
10. For admin features, keep the same neutral logic but allow softer corners and clearer container grouping.

## Gaps in the Current System

The design language is consistent, but it is mostly implicit in component-level Tailwind classes rather than centralized tokens.

Current limitations:

- no dedicated design-token file for color, spacing, or radius
- most visual decisions are repeated inline in component class strings
- the accent blue is page-specific rather than formalized
- public pages and admin pages share a family resemblance, but not a documented component library

If this system is expanded further, the next useful step would be to formalize:

- reusable color tokens for public vs admin surfaces
- a small typography scale reference
- shared button, input, badge, and card recipes
