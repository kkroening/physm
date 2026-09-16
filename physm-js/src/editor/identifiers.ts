/**
 * The names generated code binds, and the ones it cannot.
 *
 * Shared by the document and the emitter because they check the same thing
 * from two sides: the document refuses a name while a person can still fix it,
 * and the emitter refuses one a document built in code arrived with. Neither
 * replaces the other, and a name either accepts and the other does not is a
 * module that will not parse with nobody to say so.
 */

/** A JavaScript identifier, which is what a name in the emitted source is. */
export const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * The words `IDENTIFIER` matches and JavaScript will not bind.
 *
 * Worth knowing why this needs saying at all: a *component* name is checked by
 * a rule requiring a capital first letter, which excludes this whole set
 * without ever naming it -- so a check copied from there and relaxed to allow
 * lowercase loses the guarantee silently, which is what happened.
 *
 * The strict-mode reservations are in because the emitted file is a module,
 * and so are `arguments` and `eval`, which are not reserved but cannot be
 * bound in strict code either.
 */
export const RESERVED = new Set([
  'arguments',
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'eval',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'interface',
  'let',
  'new',
  'null',
  'package',
  'private',
  'protected',
  'public',
  'return',
  'static',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
]);

/**
 * ECMAScript's own capitalised built-ins: names generated code may use -- page
 * 6's `-Math.PI / 2`, say -- and the same set whichever host runs the editor.
 */
export const BUILT_INS = new Set([
  'AggregateError',
  'Array',
  'ArrayBuffer',
  'Atomics',
  'BigInt',
  'BigInt64Array',
  'BigUint64Array',
  'Boolean',
  'DataView',
  'Date',
  'Error',
  'EvalError',
  'FinalizationRegistry',
  'Float32Array',
  'Float64Array',
  'Function',
  'Infinity',
  'Int16Array',
  'Int32Array',
  'Int8Array',
  'Intl',
  'Iterator',
  'JSON',
  'Map',
  'Math',
  'NaN',
  'Number',
  'Object',
  'Promise',
  'Proxy',
  'RangeError',
  'ReferenceError',
  'Reflect',
  'RegExp',
  'Set',
  'SharedArrayBuffer',
  'String',
  'Symbol',
  'SyntaxError',
  'TypeError',
  'URIError',
  'Uint16Array',
  'Uint32Array',
  'Uint8Array',
  'Uint8ClampedArray',
  'WeakMap',
  'WeakRef',
  'WeakSet',
]);
