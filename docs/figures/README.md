# Figures

Each figure is committed as a **light/dark pair** and selected in Markdown with
`<picture>` + `<source media="(prefers-color-scheme: dark)">`. GitHub's Markdown
sanitizer strips inline `<svg>`, so the drawings have to be image files; and an SVG
loaded through `<img>` gets no `currentColor` context, so every fill and stroke is an
explicit literal. Hence two files rather than one theme-aware one.

The two variants of a figure are **identical except for four colour literals**, which are
GitHub's own palette so the drawings read as native on either canvas:

| Role | Light | Dark |
| --- | --- | --- |
| Foreground — strokes, text, matrix cells | `#1f2328` | `#e6edf3` |
| Accent — the object under discussion | `#0969da` | `#4493f8` |
| Source identifiers | `#953800` | `#db6d28` |
| Knockout text on an accent fill | `#ffffff` | `#0d1117` |

Do not edit the `-light.svg` / `-dark.svg` files directly. Each figure is authored once
as `<name>.tpl.svg` with those four values as `@FG@` / `@BLUE@` / `@OXIDE@` / `@BG@`
placeholders; `./render.sh` expands them into both variants. Edit the template, run it,
commit all three files.
