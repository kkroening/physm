# physm-js

The browser front end for [physm](../): a 2D mechanical simulator that renders a scene of
coordinate frames and point masses, and steps it with either of two interchangeable solvers —
`JsSolver` (JavaScript, on tfjs tensors) or `RsSolver` (the Rust solver in
[`../physm-rs`](../physm-rs), compiled to WebAssembly).

## Prerequisites

| | |
| --- | --- |
| **Node** | version in [`.node-version`](.node-version); `nvm use` picks it up |
| **Rust** | stable toolchain — [rustup](https://rustup.rs) |
| **wasm-pack** | `cargo install wasm-pack`, or `brew install wasm-pack` |

`wasm-pack` installs the `wasm32-unknown-unknown` target itself on first use.

## Quick start

```
npm run setup   # build both wasm targets, then install node deps
npm run dev     # http://localhost:5173
```

`npm run setup` has to come first, and the order inside it matters: `package.json` depends on
`physm-rs` as `file:../physm-rs/pkg`, so that directory must exist before `npm install` can
resolve it. Cloning and running a bare `npm install` will fail — that is the expected
behaviour, not a broken checkout.

After the first setup, `npm run dev`, `npm run build` and `npm test` each rebuild the wasm
they need on their own.

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
| `npm run tfwasm` | Copies tfjs's wasm backend binaries into `public/` |

The `wasm` and `tfwasm` steps are wired to `dev`/`build`/`test` through npm's `pre*` hooks, so
they are not steps you have to remember — they are listed because knowing they exist makes the
failures legible.

`tfwasm` exists because [`src/index.jsx`](src/index.jsx) calls `tfWasm.setWasmPaths('/')`, which
makes tfjs fetch its backend binaries from the site root at runtime. Vite serves `public/` at
the root, so that is where they have to be. tfjs ships three variants and feature-detects which
to use, so all three are copied.

## Cross-validating the two solvers

`src/Solver.test.js` runs `JsSolver` and `RsSolver` over the same scene and asserts they agree
step for step. It is worth knowing about beyond this package: it is an independent check on the
Rust solver written against a separate implementation of the same equations, so
`npm test` here exercises `physm-rs` in a way its own test suite cannot.
