## Design Context

### Users

Two distinct audiences:

1. **Restaurant/business customers** — scan a QR code at their table right
   after their visit, fill a short mobile review form (rating, comment,
   email). Casual, everyday people. The job is speed and low friction, not
   delight-through-decoration.
2. **Business owners/managers** (the paying customer) — check the
   dashboard periodically, not constantly, to see review volume/quality,
   manage locations and QR codes. Small-business, non-technical, desktop-
   primary but must work on mobile. They are trusting this tool with their
   reputation data.

### Brand Personality

**Confiable, directo, sin vueltas** (trustworthy, direct, no-nonsense) —
the client's own words. Reference given: **midday.ai**'s dashboard
(precision, typographic elegance, thin borders, real data, quiet
confidence) — explicitly NOT monday.com-style playful maximalism, and NOT
a generic dark "AI startup" dashboard with glowing panels.

### Aesthetic Direction

- **Light canvas throughout.** No dark hero panels — precision and
  restraint communicate trust better than drama, for this audience.
- **One elegant serif moment per key view**, not a whole heading — a
  personalized greeting or headline word set in the brand's existing
  Instrument Serif italic, everything else in the clean sans (Inter
  Tight). Mirrors midday's "Morning Viktor" pattern.
- **Thin 1px borders over heavy shadows/cards.** Structure comes from
  hairlines and whitespace, not `box-shadow` and rounded card stacks.
- **Compact, tight metric-tile grids** with real, meaningful small
  charts/sparklines where there's real time-series data to show — never
  decorative ones.
- **Existing palette stays** (cream / ink / lime / amber, defined in
  `docs/atrium-brand-colors.html` and `app/globals.css`), but lime becomes
  a rare, precise accent (true 60-30-10 discipline), not a glowing
  background wash.
- **Anti-references:** generic AI-dashboard tropes — gradient text,
  glassmorphism, glowing dark panels used decoratively, colored
  side-stripe borders on cards/alerts, decorative sparklines, everything
  wrapped in its own shadowed card.
- **Theme:** light only. This audience checks the dashboard in normal
  daytime business contexts, not late-night ops monitoring — light is the
  deliberate choice, not a default.

### Design Principles

1. Precision over drama — restraint communicates trust for this audience.
2. One typographic accent moment (serif italic) per view; everywhere else
   stays in the clean sans.
3. Borders and whitespace build structure, not shadows and cards.
4. Every chart or number shown must be real and meaningful — nothing
   decorative.
5. When something needs to feel bold, that comes from typographic
   confidence (scale, weight, precise numbers) — not color, glow, or a
   dark panel.
