/// <reference types="vite/client" />

// Vite's client types: what a stylesheet, an asset or `import.meta.env` is to
// the type checker. A plain `.ts` file needs them the moment it imports CSS --
// `App.jsx` never did, because `checkJs` is off and it is not type-checked.
