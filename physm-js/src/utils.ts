/**
 * The odds and ends that belong to no particular type.
 *
 * This file used to carry twenty-odd unrelated exports, including the whole
 * matrix layer. Those have moved to the modules that own them -- `Mat3`,
 * `Vec3`, `State` and `solveLinearSystem` -- and what is left is what genuinely
 * has no better home.
 */

export class MissingArgumentError extends Error {}

export class NotImplementedError extends Error {}

/**
 * A default that throws, for an argument with no sensible fallback.
 *
 * Predates TypeScript here and is largely superseded by it: a required
 * parameter is now a compile error at every typed call site. It stays for the
 * `.js` callers that remain, and for the runtime boundary where scene JSON
 * arrives untyped.
 */
export function required(name: string): never {
  throw new MissingArgumentError(`Missing required function argument: ${name}`);
}

/** See `https://gist.github.com/gordonbrander/2230317`. */
export function generateRandomId(): string {
  return Math.random().toString(36).substring(2, 11);
}
