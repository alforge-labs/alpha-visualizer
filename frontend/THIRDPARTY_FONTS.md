# Bundled Fonts

The Visualizer self-hosts the following typefaces via the `@fontsource/*` packages
on npm, instead of loading them from Google Fonts at runtime. All three are
licensed under the **SIL Open Font License 1.1**, the canonical text of which is
available at <https://openfontlicense.org/open-font-license-official-text/>.

| Family             | Author                                           | Upstream                                                       |
| ------------------ | ------------------------------------------------ | -------------------------------------------------------------- |
| Source Serif 4     | Frank Grießhammer / Adobe Inc.                   | <https://github.com/adobe-fonts/source-serif>                  |
| Inter Tight        | Rasmus Andersson                                 | <https://github.com/rsms/inter>                                |
| JetBrains Mono     | JetBrains s.r.o.                                 | <https://github.com/JetBrains/JetBrainsMono>                   |

The npm packages used to deliver the WOFF2 files are:

- `@fontsource/source-serif-4` — <https://www.npmjs.com/package/@fontsource/source-serif-4>
- `@fontsource/inter-tight` — <https://www.npmjs.com/package/@fontsource/inter-tight>
- `@fontsource/jetbrains-mono` — <https://www.npmjs.com/package/@fontsource/jetbrains-mono>

Each `@fontsource/*` package re-distributes the upstream OFL fonts unmodified
under the same OFL 1.1 license; their LICENSE files are present in
`visualizer/node_modules/@fontsource/<name>/LICENSE` after `pnpm install` and are
included in the Vite build's source map references.

## Loaded weights and subsets

To stay within the bundle budget (≤ +120 KB gz), only the following weights and
subsets are imported (see `visualizer/src/main.tsx`):

| Family             | Weights                              | Subset      |
| ------------------ | ------------------------------------ | ----------- |
| Source Serif 4     | 600                                  | latin       |
| Inter Tight        | 400 / 500 / 600                      | latin       |
| JetBrains Mono     | 500                                  | latin       |

Other Unicode ranges (cyrillic, greek, vietnamese, latin-ext) are not loaded —
the Visualizer renders Japanese text via the platform `system-ui` fallback in
the design tokens (`--sans` / `--serif` / `--mono` in `src/design/tokens.css`).

## SIL Open Font License 1.1 — short notice

> Copyright the respective font authors as listed above.
>
> This Font Software is licensed under the SIL Open Font License, Version 1.1.
> This license is copied below, and is also available with a FAQ at:
> <https://openfontlicense.org/>

The full license text is included in each `@fontsource/<name>/LICENSE` file.
