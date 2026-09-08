/**
 * A minimal shim for `react-test-renderer`.
 *
 * The package ships no types of its own, and `@types/react-test-renderer` was
 * deprecated for React 19 rather than updated. Only what the suite calls is
 * declared -- a shim that claimed the whole surface would be a guess, and the
 * point of this file is to stop `any` leaking out of the import.
 */
declare module 'react-test-renderer' {
  import type { ReactElement } from 'react';

  export interface ReactTestRenderer {
    toJSON(): unknown;
    unmount(): void;
  }

  export function create(element: ReactElement): ReactTestRenderer;

  const renderer: { create: typeof create };
  export default renderer;
}
