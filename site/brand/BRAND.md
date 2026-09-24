# Handoff: Za3tar logo mark

## Overview
Primary symbol for Za3tar, an AI operating-layer company. A square Latin **Z** whose diagonal is an Arabic **ز** (zayn) drawn as a tapered thyme leaf, with the zayn's dot sitting on the top bar. Reads as: Z → ز → leaf → (quietly) a smile. Locked geometry is the "10b / heavy 44" variant from the exploration sheet; finishes from round 11.

## About the design files
`Za3tar Identity.dc.html` is an HTML **design reference / exploration sheet**, not production code. The deliverable to integrate is the set of SVG files in this folder. Recreate any surrounding UI (header, avatar, deck cover) in the target codebase's own stack; embed the SVGs as assets or inline.

## Fidelity
**High-fidelity.** The SVGs are final vector geometry. Do not redraw, restroke, or add effects; scale only.

## Files
- `za3tar-mark.svg` — primary, on light grounds (ink #0B1710, leaf #C6DE3E)
- `za3tar-mark-on-dark.svg` — for dark grounds (bars #F2EEE2, leaf #C6DE3E)
- `za3tar-mark-mono.svg` — one colour (all #0B1710, dot knocked out in #F2EEE2). Use for print, embossing, low-colour contexts. Recolour by replacing #0B1710.
- `za3tar-mark-shaded.svg` — hero-only finish (leaf gradient #DFF06A→#8FA828 along the diagonal). App icon, deck cover, splash. Never below 64px.
- `za3tar-favicon.svg` — dark square tile with padded mark; source for favicon.ico / apple-touch-icon / maskable icons. Safe zone: mark occupies 72% of the tile.

## Geometry (viewBox units)
All files share one coordinate system; the mark's bounding square is x 56–190, y 14–148 (134 × 134).
- Top bar: rect 56,14 → 134 × 44, clipped left of the leaf's inner edge.
- Bottom bar: rect 56,104 → 134 × 44, clipped right of the leaf's outer edge.
- Leaf (ز): `M190 14C195.4 96 150 140 56 148C102 128 147.2 88 190 14Z` — tip at the square's top-right corner (190,14), tail at bottom-left (56,148).
- Dot: circle centre (126,36) r 11 — vertically centred on the top bar.
- Clip paths: top `M0 0H190V14C147.2 88 102 128 56 148L0 200Z`; bottom `M56 148C150 140 195.4 96 190 14H200V200H56Z`.

## Usage rules
- Minimum size 16px (favicon). At ≤24px use the flat variants only.
- Clear space: ¼ of the mark's width on all sides.
- Background pairings: mark.svg on #F2EEE2 or white; mark-on-dark.svg on #0B1710 or #101E17; mono on anything.
- Do not rotate, skew, outline, add drop shadows, or change the leaf/bar weight ratio. Do not separate the dot from the top bar.
- The mark may appear alone (avatar, favicon, app icon) or left of the wordmark with a gap equal to the bar height (44 units). A matching custom wordmark is **not yet drawn** — until it is, set "Za3tar" in a condensed grotesk at bar-height cap size, ink #0B1710 / #F2EEE2.

## Design tokens
- Thyme black `#0B1710` (ink, dark ground)
- Limestone `#F2EEE2` (light ground, reversed bars)
- Dry olive `#6F7F5A` (secondary; also used for muted leaf on tonal grounds)
- Fresh thyme `#C6DE3E` (leaf, dot, accent)
- Deep panel `#101E17`, hairline `#1E3327`
- Shaded leaf stops `#DFF06A` → `#8FA828`

## Suggested integration
```
public/
  favicon.svg            ← za3tar-favicon.svg
  apple-touch-icon.png   ← rasterise favicon at 180×180
  icon-512.png           ← rasterise favicon at 512×512 (maskable)
src/assets/brand/
  mark.svg, mark-dark.svg, mark-mono.svg, mark-shaded.svg
```
Inline the SVG when the colour must follow theme; otherwise reference the file. For CSS-driven theming, replace fills with `currentColor` on the bars and a `--leaf` custom property on the leaf/dot.

## Reference
`Za3tar Identity.dc.html` (project root) — full exploration, rounds 1–11. Round 10b is the locked geometry; round 11 shows the approved finishes (11a shaded, 11i mono).
