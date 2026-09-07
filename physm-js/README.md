# physm-js

The browser front end for [physm](../): a 2D mechanical simulator that renders a scene of
coordinate frames and point masses, and steps it with either of two interchangeable solvers —
`JsSolver` (JavaScript, on tfjs tensors) or `RsSolver` (the Rust solver in
[`../physm-rs`](../physm-rs), compiled to WebAssembly).

## Prerequisites

| | |
| --- | --- |
| **Node** | see [`.nvmrc`](.nvmrc) / [`.node-version`](.node-version) — `nvm use` reads the former, fnm/asdf/Volta the latter |
| **Rust** | stable toolchain — [rustup](https://rustup.rs) |
| **wasm-pack** | `cargo install wasm-pack`, or `brew install wasm-pack` |

`wasm-pack` installs the `wasm32-unknown-unknown` target itself on first use.

## Quick start

```
npm run setup   # build both wasm targets, then install node deps
npm run dev     # http://localhost:5173
```

`npm run setup` is a convenience rather than a hard prerequisite. A bare `npm install` also
works: `package.json` depends on `physm-rs` as `file:../physm-rs/pkg`, but the committed
lockfile already records that link, so npm never opens the missing directory — it just leaves
`node_modules/physm-rs` as a dangling symlink until the first `dev`/`build` fills the target
in. `setup` exists so both wasm builds are in place up front instead.

Either way, `npm run dev`, `npm run build` and `npm test` each rebuild the wasm they need on
their own.

## Why there are two wasm builds

`wasm-pack` emits different JavaScript glue per target, and this project needs two of them:

| Directory | Target | Used by |
| --- | --- | --- |
| `../physm-rs/pkg` | `bundler` | the browser app, via `import('physm-rs')` in [`src/index.jsx`](src/index.jsx) |
| `../physm-rs/nodepkg` | `nodejs` | the test suite, via a direct path import in [`src/Solver.test.js`](src/Solver.test.js) |

Both are generated from the same crate; neither is checked in. If `Solver.test.js` fails to
resolve `../../physm-rs/nodepkg/physm_rs.js`, run `npm run wasm:node`.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run setup` | Both wasm builds, then `npm install`. Run this first. |
| `npm run dev` | Rebuilds `pkg`, copies the tfjs wasm binaries, starts Vite |
| `npm run build` | Same, then a production build into `dist/` |
| `npm run preview` | Serves the built `dist/` |
| `npm test` | Rebuilds `nodepkg`, then runs Vitest once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run wasm` | Just the `bundler` build → `../physm-rs/pkg` |
| `npm run wasm:node` | Just the `nodejs` build → `../physm-rs/nodepkg` |

| `npm run lint` | ESLint over the package |

The `wasm` steps are wired to `dev`/`build`/`test` through npm's `pre*` hooks, so they are not
steps you have to remember — they are listed because knowing they exist makes the failures
legible.

tfjs runs on its CPU backend here. Its WebGL and WASM backends are both available but neither
is enabled; enabling the WASM one would mean re-adding `@tensorflow/tfjs-backend-wasm` and
serving its binaries from the site root, which does not compose with this package's relative
`base`.

## Cross-validating the two solvers

`src/Solver.test.js` runs `JsSolver` and `RsSolver` over the same scene and asserts they agree
step for step. It is worth knowing about beyond this package: it is an independent check on the
Rust solver written against a separate implementation of the same equations, so
`npm test` here exercises `physm-rs` in a way its own test suite cannot.
