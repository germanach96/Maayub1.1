# muuyal — Style Reference
> Sunset-lit instrument panel with warm data orbs

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

**Palette source:** every color in this document comes from `frontend/src/palette.css` (the `--mu-*` variables from the brand package in `handoff/`). No color is written by hand outside that file: if a shade is needed that is not in the palette, it is mixed from two palette colors with `color-mix()`. Visual direction: sunset and earth — oranges, terracottas and warm browns over cream/sand neutrals with an amber base. **Never blue-gray, never pure white, never pure gray, never black.**

muuyal operates as a sunset-lit travel terminal: a warm cream canvas wrapped in golden light, with data orbs and gold-to-orange light gradients that suggest heat, horizon and late-afternoon sun. The interface is sparse and cinematic, relying on a single custom display face (Matter) at medium weight with aggressive negative tracking to create scale without shouting. Color is rationed — warm ink browns carry almost all content, while the chromatic palette (orange, terracotta, gold) is reserved for the primary CTA, prices and statistics, atmospheric gradients, and the data scales (cost, weather, states). Cards float on subtle surface shifts within the cream/sand stack (16px radius) rather than heavy elevation, so the hierarchy reads as layers of warm light rather than shadow-on-paper. Components feel engineered and instrument-like: uppercase tracked labels, thin geometric arrow icons, large numerical stats in terracotta.

## Tokens — Colors

### Brand

| Name | Value | Token | Role |
|------|-------|-------|------|
| Sunset Orange | `#E8731A` | `--mu-orange` | Primary action — CTA fill ("Buscar vuelos"), selected state, the hot end of the signature gradient. Text on it is always `--mu-ink` (4.8:1) |
| Terracotta | `#B8502D` | `--mu-terracotta` | Logo color, prices (weight 600) and large statistics. The brand's signature accent on light surfaces (4.8:1 on `--mu-surface`). Text on it is always `--mu-surface` |
| Clay | `#8A3E20` | `--mu-clay` | Dark strokes and strong borders — focus rings, map outlines, icon strokes that need more weight than `--mu-border` |
| Earth | `#5C3520` | `--mu-earth` | Emphasized body text, pull-quotes, depth. Border of the selected row/card. Base of the warm translucent shadows |
| Gold | `#D9A441` | `--mu-gold` | Warm accent — sun icon, highlights, the light end of the signature gradient. Text on it is always `--mu-ink` (6.5:1) |

### Warm neutrals (amber base — nothing blue-gray)

| Name | Value | Token | Role |
|------|-------|-------|------|
| Surface | `#FFF9F0` | `--mu-surface` | Raised surface — cards, panels, result rows, inputs. The lightest color in the system; replaces pure white everywhere |
| Cream | `#FAF3E7` | `--mu-cream` | Primary canvas — page background, header, hero. The dominant warm field everything floats on |
| Sand | `#F2E4CE` | `--mu-sand` | Recessed surface — chips, table zebra stripes, low-emphasis panels, the arrow icon button fill |
| Border | `#E5D3B8` | `--mu-border` | Subtle borders and dividers — card outlines, table rules, input borders |
| Ink Soft | `#7A6350` | `--mu-ink-soft` | Secondary body text, muted descriptions, inactive nav, uppercase column headers and section labels (5.1:1 on cream) |
| Ink | `#3A2418` | `--mu-ink` | Headings, nav items, primary text, text on orange and gold (13.2:1 on cream). The dominant text color across all heading levels |
| Dark | `#2C1B10` | `--mu-dark` | The only dark field — footer and recessed "well" panels. Text on it is `--mu-cream` / `--mu-surface` |

### Cost scale (€ → €€€€, monotonic luminosity, colorblind-safe)

| Name | Value | Token | Text on it |
|------|-------|-------|------------|
| Cost 1 (€) | `#D9A441` | `--mu-cost-1` | `--mu-ink` |
| Cost 2 (€€) | `#E8731A` | `--mu-cost-2` | `--mu-ink` |
| Cost 3 (€€€) | `#B8502D` | `--mu-cost-3` | `--mu-surface` |
| Cost 4 (€€€€) | `#6E3A21` | `--mu-cost-4` | `--mu-surface` |

The number of € symbols is the redundant signal — never rely on color alone.

### Weather scale

| Name | Value | Token | Role |
|------|-------|-------|------|
| Cold | `#EFDDBE` | `--mu-cold` | Coldest step of the temperature ramp |
| Mild | `#E9B76B` | `--mu-mild` | Mild temperatures |
| Warm | `#DE8A34` | `--mu-warm` | Warm temperatures |
| Hot | `#B8502D` | `--mu-hot` | Hottest step of the ramp |
| Sun | `#D9A441` | `--mu-sun` | Sun icon / sunny days |
| Rain | `#5C3520` | `--mu-rain` | Rain icon / rainy days |

Always paired with an icon or a number, never color alone.

### States

| Name | Value | Token | Role |
|------|-------|-------|------|
| Success | `#6B7F3A` | `--mu-success` | Warm olive. Large text or icons only (4.3:1). Text on it: `--mu-surface` |
| Warning | `#D9A441` | `--mu-warning` | Text on it: `--mu-ink` |
| Error | `#B03A2E` | `--mu-error` | Clay red. Text on it: `--mu-surface` |
| Selected | `#E8731A` | `--mu-selected` | Selected row/card, always with a `--mu-earth` border or inset bar |

### Gradients (built only from palette colors)

| Name | Value | Token | Role |
|------|-------|-------|------|
| Sunset Gradient | `linear-gradient(90deg, #D9A441 0%, #E8731A 100%)` | `--mu-gradient-sunset` | Signature button and UI gradient — horizontal sweep from gold into sunset orange. The brand's signature chromatic gesture. Both ends hold `--mu-ink` text at AA |
| Horizon Gradient | `linear-gradient(90deg, #FFF9F0 0%, #F2E4CE 30%, #E9B76B 65%, #E8731A 100%)` | `--mu-gradient-horizon` | Decorative only — thin bands, hero atmosphere, small accents. Never carries text at its orange end without checking contrast |

## Tokens — Typography

### Matter — Primary display and body face — used at weight 500 for all headings (H1–H3) and oversized kinetic text (86–295px). Weight 400 for body and UI copy. Characterized by aggressive negative tracking on large sizes (-0.04em at 61px, -0.046em at 86px) and wide positive tracking on uppercase labels (0.08em at 20px, 0.12em at 12px, 0.15em at 10px). The medium-weight-only heading strategy is distinctive — no bold, no light — giving the type a uniform mechanical confidence. · `--font-matter`
- **Substitute:** Inter, DM Sans, or Satoshi for close geometric-grotesk match
- **Weights:** 400, 500
- **Sizes:** 10, 12, 13, 14, 16, 20, 24, 36, 61, 86, 96, 295px
- **Line height:** 1.0, 1.3, 1.4, 1.5
- **Letter spacing:** -0.046em at 86px, -0.04em at 61px, -0.02em at 24px, 0.08em uppercase at 20px, 0.12em uppercase at 12px, 0.15em uppercase at 10px
- **Role:** Primary display and body face — used at weight 500 for all headings (H1–H3) and oversized kinetic text (86–295px). Weight 400 for body and UI copy. Characterized by aggressive negative tracking on large sizes (-0.04em at 61px, -0.046em at 86px) and wide positive tracking on uppercase labels (0.08em at 20px, 0.12em at 12px, 0.15em at 10px). The medium-weight-only heading strategy is distinctive — no bold, no light — giving the type a uniform mechanical confidence.

### Arial — Secondary fallback for interactive UI elements (nav, buttons, hero micro-copy, footer). Only appears at 14px — used as a safe generic fallback where Matter isn't loaded, covering form labels, button text, and small utility copy. · `--font-arial`
- **Substitute:** system-ui, -apple-system, sans-serif
- **Weights:** 400
- **Sizes:** 14px
- **Line height:** 1.43
- **Role:** Secondary fallback for interactive UI elements (nav, buttons, hero micro-copy, footer). Only appears at 14px — used as a safe generic fallback where Matter isn't loaded, covering form labels, button text, and small utility copy.

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing | Token |
|------|--------|--------|------|-------------|----------------|-------|
| caption | — | — | 10px | 1.4 | 1.5px | `--text-caption` |
| body | — | — | 16px | 1.4 | 0px | `--text-body` |
| subheading | — | — | 24px | 1.3 | -0.48px | `--text-subheading` |
| heading | — | — | 36px | 1 | 0px | `--text-heading` |
| heading-lg | — | — | 61px | 1 | -2.44px | `--text-heading-lg` |
| display | — | — | 96px | 1 | -3.84px | `--text-display` |

## Tokens — Spacing & Shapes

**Base unit:** 4px

**Density:** spacious

### Spacing Scale

| Name | Value | Token |
|------|-------|-------|
| 12 | 12px | `--spacing-12` |
| 16 | 16px | `--spacing-16` |
| 20 | 20px | `--spacing-20` |
| 24 | 24px | `--spacing-24` |
| 28 | 28px | `--spacing-28` |
| 32 | 32px | `--spacing-32` |
| 36 | 36px | `--spacing-36` |
| 40 | 40px | `--spacing-40` |
| 48 | 48px | `--spacing-48` |
| 64 | 64px | `--spacing-64` |
| 80 | 80px | `--spacing-80` |
| 120 | 120px | `--spacing-120` |
| 140 | 140px | `--spacing-140` |
| 160 | 160px | `--spacing-160` |
| 164 | 164px | `--spacing-164` |

### Border Radius

| Element | Value |
|---------|-------|
| cards | 16px |
| small | 6px |
| buttons | 6px |

### Layout

- **Page max-width:** 1440px
- **Section gap:** 68px
- **Card padding:** 36-48px
- **Element gap:** 20px

## Components

### Gradient Pill Button
**Role:** Primary CTA

Filled button with the sunset gradient background (gold → orange), or flat `--mu-orange` when a solid fill is preferred. 6px border-radius, 32px vertical padding, 22px horizontal padding. Text in `--mu-ink` (#3A2418) at 14px Arial, uppercase — never white or cream text on orange. Hover goes one step darker (`color-mix(in srgb, var(--mu-orange) 85%, var(--mu-clay))`). Used for the most important action on each section. The gradient direction is horizontal, creating a sunset effect.

### Ghost Navigation Link
**Role:** Nav item

Transparent background, no border, uppercase text at 12px Matter weight 400 with 0.12em letter-spacing. `--mu-ink` (#3A2418) in active state, `--mu-ink-soft` (#7A6350) for inactive. No padding — sits inline with tight 16px column-gap between items.

### Surface Card
**Role:** Content container

Card with `--mu-surface` (#FFF9F0) background on the cream canvas, 16px border-radius, 36px padding all sides, 1px `--mu-border` (#E5D3B8) outline. Headings at 36px Matter 500 `--mu-ink`, body at 16px Matter 400 `--mu-ink-soft`. Used for feature blocks and content panels.

### Recessed Card
**Role:** Deep content panel

Card with `--mu-dark` (#2C1B10) background, 16px border-radius, 120px vertical padding. Text in `--mu-cream` / `--mu-surface`, accents in `--mu-gold`. Creates a sunken well effect — the deepest UI surface, used for footer-adjacent content blocks and call-to-action panels with maximum breathing room. A lighter alternative for in-page wells is `--mu-sand`.

### Feature Row Card
**Role:** Service listing

Transparent background card with 16px radius and 48px vertical / 36px horizontal padding. Contains a heading, body description, and a small square arrow icon button (32×32, 6px radius, sand fill with earth arrow). Used for the three main sections of the Explore area.

### Arrow Icon Button
**Role:** Inline link trigger

32×32 square button, 6px border-radius, `--mu-sand` (#F2E4CE) fill. Contains a `--mu-earth` (#5C3520) diagonal arrow (↗) icon. On hover the fill becomes `--mu-orange` with a `--mu-ink` arrow. Always positioned to the right of a card title as a 'go to' trigger.

### Uppercase Section Label
**Role:** Eyebrow / kicker

12px or 20px Matter weight 500, uppercase, letter-spacing 0.08–0.12em, `--mu-ink-soft` (#7A6350) or `--mu-terracotta` (#B8502D) color. Appears above section headings as a categorical label (e.g. 'MUUYAL', 'EXPLORA'). Wide tracking is signature — it reads as technical instrumentation labeling.

### Hero Headline
**Role:** Page-level title

61–96px Matter weight 500, line-height 1.0, letter-spacing -0.04em, `--mu-ink`. Fluid sizing via clamp(2.5rem, ..., 3.8rem) for H1 and clamp(2.1rem, ..., 3rem) for H2. Tight tracking compensates for the geometric letterforms at scale.

### Oversized Kinetic Text
**Role:** Section-spanning display

86–295px Matter weight 500 at line-height 1.0, letter-spacing -0.046em, `--mu-ink` or `--mu-terracotta`. Used for massive section markers. The extreme size creates a kinetic, almost physical presence — text as environmental element.

### Statistic Counter
**Role:** Metric display

Large number in `--mu-terracotta` (#B8502D) with label below in `--mu-ink-soft` at 13px uppercase tracked. The terracotta-on-cream combination is the signature emphasis treatment — statistics glow like embers against the warm canvas. On the dark well, numbers switch to `--mu-gold` and labels to `--mu-cream`.

### Price
**Role:** Flight price

`--mu-terracotta` (#B8502D), weight 600. Never orange (orange text on cream does not pass AA).

### Cost Badge
**Role:** € → €€€€ indicator

Small 6px-radius chip using the cost scale: `--mu-cost-1`/`--mu-cost-2` with `--mu-ink` text, `--mu-cost-3`/`--mu-cost-4` with `--mu-surface` text. The number of € symbols always carries the meaning on its own.

### Selected Row / Card
**Role:** Selection state

Background `color-mix(in srgb, var(--mu-selected) 14%, var(--mu-surface))` with a 3px inset `--mu-earth` bar on the left. Hover uses `--mu-sand`.

### Navigation Bar
**Role:** Site header

Full-width header, transparent over the cream canvas, ~80px height. Logo (muuyal mark in `--mu-terracotta` + wordmark) left, nav links centered, CTA button right. 6px radius on the CTA. Items separated by 16–24px gaps.

### Geometric Molecule Illustration
**Role:** Decorative graphic

Flat geometric pattern of circles and connector shapes in `--mu-clay` / `--mu-terracotta` strokes, positioned as right-column decoration in the Explore section. No fill complexity — just circles and thin connector lines forming an abstract network diagram (e.g. routes between airports).

### Particle Sphere Visual
**Role:** Hero animation

3D particle sphere rendered in terracotta, orange and gold dots, rotating in the hero or section transition. The particles pick up the warm canvas and the gold accent at its edges, creating a sunset data-orb effect — a small sun on the horizon. Functions as a brand-defining visual element.

## Do's and Don'ts

### Do
- Use only the warm surface stack (`--mu-sand` #F2E4CE → `--mu-cream` #FAF3E7 → `--mu-surface` #FFF9F0, plus `--mu-dark` #2C1B10 for the footer well) for background differentiation — never introduce gray, blue-gray, black or pure white surfaces
- Take every color from the `--mu-*` variables; when a new shade is needed, mix two palette colors with `color-mix()` instead of writing a hex by hand
- Reserve the sunset gradient exclusively for primary CTAs and signature accent moments — never as a large background fill
- Use dark text (`--mu-ink`) on gold and orange, and cream text (`--mu-surface`) on terracotta, earth and dark
- Use terracotta (`--mu-terracotta` #B8502D) for prices and large statistics
- Always pair cost, weather and state colors with an icon or a number of symbols — color is never the only signal
- Set all headings at Matter weight 500 — no bold, no light, no other weights at display sizes
- Apply uppercase tracking (0.08–0.15em) to all section labels, kickers, and eyebrow text at 10–20px
- Keep card radii at 16px and small element radii at 6px — these two values are the complete shape vocabulary
- Use line-height 1.0 for all display text above 36px and line-height 1.4 for all body text — the contrast defines the typographic rhythm

### Don't
- Do not use black or gray shadows — differentiation comes from surface shifts in the warm stack. If a shadow is unavoidable, it must be translucent warm brown (`rgba(92, 53, 32, 0.06–0.16)`, i.e. `--mu-earth`), never black
- Do not introduce bold (600+) or light (300-) weights at display sizes — the medium-only strategy is core to the mechanical confidence (prices at 600 are the one exception)
- Do not use pure white (#ffffff) anywhere — the lightest color is `--mu-surface` (#FFF9F0)
- Do not put white or cream text on orange or gold — it fails contrast; use `--mu-ink`
- Do not use orange or gold as a text color on cream — they fail contrast; use terracotta or earth
- Do not use `--mu-success` for small body text — large text or icons only
- Do not apply the sunset gradient to text, borders, or backgrounds larger than a single button — it loses luminosity at scale
- Do not use rounded corners above 16px — the system is sharp-rounded, not pill-shaped (buttons are 6px, cards are 16px)
- Do not use any color outside the `--mu-*` palette — the palette is rationed and deliberate

## Surfaces

| Level | Name | Value | Purpose |
|-------|------|-------|---------|
| 0 | Cream | `#FAF3E7` | Page canvas — the dominant background field. All content floats on this. |
| 1 | Sand | `#F2E4CE` | Recessed surface — chips, zebra rows, in-page wells that sink below the canvas. |
| 2 | Surface | `#FFF9F0` | Raised card surface — content cards, feature panels, result rows, inputs. |
| 3 | Dark | `#2C1B10` | Inverted well — footer and the deepest call-to-action panels. Cream text only. |

## Elevation

The design avoids heavy drop shadows. Depth is communicated through a warm surface stack (sand → cream → surface) where each level is a slightly darker or lighter step in the same amber hue, with 1px `--mu-border` outlines where two light levels meet. This creates the sensation of layers lit by a low, golden sun rather than objects raised off cold paper. When a shadow is truly needed (floating panels, popovers), it is soft and warm brown (`rgba(92, 53, 32, 0.1)`), never black, so it reads as warm shade instead of gray dirt.

## Imagery

Imagery is minimal and atmospheric. The hero features a 3D particle sphere — thousands of small terracotta, orange and gold dots forming a rotating orb that picks up the cream canvas and glows gold at its edges, like a sun sitting on the horizon. Section decorations include flat geometric network diagrams (clay/terracotta circles and thin connector lines on the cream canvas) used as right-column balancing elements. No photography, no lifestyle imagery, no people — the visual language is pure data-graphics and abstract forms. The particle sphere is the defining brand visual; it should appear at least once on any major page to anchor the sunset metaphor.

## Layout

Full-bleed cream canvas with max-width 1440px content. Hero is a centered text stack (eyebrow → headline → subtext → CTA) occupying the full viewport height, with the particle sphere as a background element. Sections are full-width bands separated by generous 68px+ vertical gaps, alternating between canvas (cream) and slightly recessed surfaces (sand). The Explore section uses an asymmetric two-column layout: left column is stacked feature cards, right column holds the geometric network illustration. Content is centered in narrow columns (max ~600px) for readability rather than stretching edge-to-edge. The footer is a dark well (`--mu-dark` #2C1B10) with 120px vertical padding, like dusk falling at the bottom of the page. Navigation is a thin transparent bar with items spaced at 16–24px gaps. The overall rhythm is cinematic and spacious — each section breathes, and the warm color scheme makes the page feel wrapped in golden light.

## Agent Prompt Guide

**Quick Color Reference**
- Text (primary): #3A2418 (`--mu-ink`)
- Text (body/secondary): #7A6350 (`--mu-ink-soft`)
- Text (emphasis): #5C3520 (`--mu-earth`)
- Background (canvas): #FAF3E7 (`--mu-cream`)
- Background (cards): #FFF9F0 (`--mu-surface`)
- Border: #E5D3B8 (`--mu-border`)
- Accent (prices/stats): #B8502D (`--mu-terracotta`)
- Primary action: #E8731A (`--mu-orange`) with #3A2418 text
- Footer / dark well: #2C1B10 (`--mu-dark`) with #FAF3E7 text

**Example Component Prompts**

1. **Create a Primary Action Button:** `--mu-orange` (#E8731A) background, `--mu-ink` (#3A2418) text, 6px radius, compact padding. Hover one step darker. Use this filled treatment for the main CTA.

2. **Create a feature card:** Background `--mu-surface` (#FFF9F0), 1px `--mu-border` (#E5D3B8), 16px radius, 36px padding. Heading at 36px Matter 500 `--mu-ink` (#3A2418), line-height 1.0. Body at 16px Matter 400 `--mu-ink-soft` (#7A6350). Arrow icon button (32×32, 6px radius, `--mu-sand` #F2E4CE fill) positioned top-right with an `--mu-earth` ↗ icon.

3. **Create a statistics block:** Three columns. Large number (e.g. '1.240 €') at 86px Matter 500 `--mu-terracotta` (#B8502D), line-height 1.0, letter-spacing -3.96px. Label below at 13px Matter 400, uppercase, 0.055em letter-spacing, `--mu-ink-soft` (#7A6350).

## Quick Start

### CSS Custom Properties

```css
:root {
  /* Colors — Brand (same values as frontend/src/palette.css) */
  --mu-orange:      #E8731A;
  --mu-terracotta:  #B8502D;
  --mu-clay:        #8A3E20;
  --mu-earth:       #5C3520;
  --mu-gold:        #D9A441;

  /* Colors — Warm neutrals */
  --mu-surface:     #FFF9F0;
  --mu-cream:       #FAF3E7;
  --mu-sand:        #F2E4CE;
  --mu-border:      #E5D3B8;
  --mu-ink-soft:    #7A6350;
  --mu-ink:         #3A2418;
  --mu-dark:        #2C1B10;

  /* Colors — Cost scale */
  --mu-cost-1:      #D9A441;
  --mu-cost-2:      #E8731A;
  --mu-cost-3:      #B8502D;
  --mu-cost-4:      #6E3A21;

  /* Colors — Weather */
  --mu-cold:        #EFDDBE;
  --mu-mild:        #E9B76B;
  --mu-warm:        #DE8A34;
  --mu-hot:         #B8502D;
  --mu-sun:         #D9A441;
  --mu-rain:        #5C3520;

  /* Colors — States */
  --mu-success:     #6B7F3A;
  --mu-warning:     #D9A441;
  --mu-error:       #B03A2E;
  --mu-selected:    #E8731A;

  /* Gradients — built from the palette */
  --mu-gradient-sunset: linear-gradient(90deg, var(--mu-gold) 0%, var(--mu-orange) 100%);
  --mu-gradient-horizon: linear-gradient(90deg, var(--mu-surface) 0%, var(--mu-sand) 30%, var(--mu-mild) 65%, var(--mu-orange) 100%);

  /* Derived (mixed, never hand-written) */
  --mu-trazo: color-mix(in srgb, var(--mu-terracotta) 80%, var(--mu-dark));
  --mu-orange-hover: color-mix(in srgb, var(--mu-orange) 85%, var(--mu-clay));
  --mu-shadow: 0 2px 10px rgba(92, 53, 32, 0.12);

  /* Typography — Font Families */
  --font-matter: 'Matter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-arial: 'Arial', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  /* Typography — Scale */
  --text-caption: 10px;
  --leading-caption: 1.4;
  --tracking-caption: 1.5px;
  --text-body: 16px;
  --leading-body: 1.4;
  --tracking-body: 0px;
  --text-subheading: 24px;
  --leading-subheading: 1.3;
  --tracking-subheading: -0.48px;
  --text-heading: 36px;
  --leading-heading: 1;
  --tracking-heading: 0px;
  --text-heading-lg: 61px;
  --leading-heading-lg: 1;
  --tracking-heading-lg: -2.44px;
  --text-display: 96px;
  --leading-display: 1;
  --tracking-display: -3.84px;

  /* Typography — Weights */
  --font-weight-regular: 400;
  --font-weight-medium: 500;

  /* Spacing */
  --spacing-unit: 4px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-24: 24px;
  --spacing-28: 28px;
  --spacing-32: 32px;
  --spacing-36: 36px;
  --spacing-40: 40px;
  --spacing-48: 48px;
  --spacing-64: 64px;
  --spacing-80: 80px;
  --spacing-120: 120px;
  --spacing-140: 140px;
  --spacing-160: 160px;
  --spacing-164: 164px;

  /* Layout */
  --page-max-width: 1440px;
  --section-gap: 68px;
  --card-padding: 36-48px;
  --element-gap: 20px;

  /* Border Radius */
  --radius-md: 6px;
  --radius-xl: 12px;
  --radius-2xl: 16px;

  /* Named Radii */
  --radius-cards: 16px;
  --radius-small: 6px;
  --radius-buttons: 6px;

  /* Surfaces */
  --surface-canvas: var(--mu-cream);
  --surface-recessed: var(--mu-sand);
  --surface-raised: var(--mu-surface);
  --surface-well: var(--mu-dark);
}
```

### Tailwind v4

```css
@theme {
  /* Colors — Brand */
  --color-mu-orange: #E8731A;
  --color-mu-terracotta: #B8502D;
  --color-mu-clay: #8A3E20;
  --color-mu-earth: #5C3520;
  --color-mu-gold: #D9A441;

  /* Colors — Warm neutrals */
  --color-mu-surface: #FFF9F0;
  --color-mu-cream: #FAF3E7;
  --color-mu-sand: #F2E4CE;
  --color-mu-border: #E5D3B8;
  --color-mu-ink-soft: #7A6350;
  --color-mu-ink: #3A2418;
  --color-mu-dark: #2C1B10;

  /* Colors — Cost scale */
  --color-mu-cost-1: #D9A441;
  --color-mu-cost-2: #E8731A;
  --color-mu-cost-3: #B8502D;
  --color-mu-cost-4: #6E3A21;

  /* Colors — Weather */
  --color-mu-cold: #EFDDBE;
  --color-mu-mild: #E9B76B;
  --color-mu-warm: #DE8A34;
  --color-mu-hot: #B8502D;
  --color-mu-sun: #D9A441;
  --color-mu-rain: #5C3520;

  /* Colors — States */
  --color-mu-success: #6B7F3A;
  --color-mu-warning: #D9A441;
  --color-mu-error: #B03A2E;
  --color-mu-selected: #E8731A;

  /* Typography */
  --font-matter: 'Matter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-arial: 'Arial', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  /* Typography — Scale */
  --text-caption: 10px;
  --leading-caption: 1.4;
  --tracking-caption: 1.5px;
  --text-body: 16px;
  --leading-body: 1.4;
  --tracking-body: 0px;
  --text-subheading: 24px;
  --leading-subheading: 1.3;
  --tracking-subheading: -0.48px;
  --text-heading: 36px;
  --leading-heading: 1;
  --tracking-heading: 0px;
  --text-heading-lg: 61px;
  --leading-heading-lg: 1;
  --tracking-heading-lg: -2.44px;
  --text-display: 96px;
  --leading-display: 1;
  --tracking-display: -3.84px;

  /* Spacing */
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-24: 24px;
  --spacing-28: 28px;
  --spacing-32: 32px;
  --spacing-36: 36px;
  --spacing-40: 40px;
  --spacing-48: 48px;
  --spacing-64: 64px;
  --spacing-80: 80px;
  --spacing-120: 120px;
  --spacing-140: 140px;
  --spacing-160: 160px;
  --spacing-164: 164px;

  /* Border Radius */
  --radius-md: 6px;
  --radius-xl: 12px;
  --radius-2xl: 16px;
}
```
