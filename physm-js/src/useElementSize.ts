import { useLayoutEffect, useState } from 'react';
import type { RefObject } from 'react';

/**
 * An element's rendered size, kept current as it changes.
 *
 * A plot that fills a flex item is the size of the window, not a constant, and
 * a view transform has to centre on it. A `ResizeObserver` rather than a
 * `resize` listener, because the element also changes size when the surrounding
 * layout does, with no window event to hear.
 *
 * `useLayoutEffect`, not `useEffect`, and the first measurement is taken
 * synchronously rather than waited for. An effect runs *after* the browser
 * paints, so an observer started there cannot report until the second frame --
 * which would make the first painted frame a view centred on `(0, 0)`, the
 * element's own corner, with half the scene clipped away. A layout effect runs
 * before paint and its `setSize` is flushed before paint, so that frame never
 * reaches the screen.
 *
 * An unmounted element throws rather than reading as zero. The effect runs once,
 * since a ref's identity never changes, so a guard would turn "not mounted yet"
 * into a permanent zero -- which renders as a corner-centred view rather than as
 * an error.
 */
export default function useElementSize(
  ref: RefObject<Element | null>,
): readonly [number, number] {
  const [size, setSize] = useState<readonly [number, number]>([0, 0]);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      throw new Error('useElementSize: the element is not mounted');
    }

    const update = (width: number, height: number): void =>
      setSize((current) =>
        // The *same array* when nothing moved, not an equal one: React skips a
        // re-render only on `Object.is`, so returning a fresh pair here would
        // re-render the whole scene on every observer delivery.
        width === current[0] && height === current[1]
          ? current
          : [width, height],
      );

    update(element.clientWidth, element.clientHeight);

    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        update(entry.contentRect.width, entry.contentRect.height);
      }
    });
    observer.observe(element);

    return () => observer.disconnect();
  }, [ref]);

  return size;
}
