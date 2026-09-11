/**
 * Where a pane scrolls to show a mark in it. `scrollTop` and `height` are the
 * pane's; `top` and `bottom` are the mark's, measured down from the top of
 * what the pane scrolls.
 *
 * A mark that fits comes into view by the smallest move, and stays put if it
 * is in view already. One taller than the pane comes in by its first line --
 * for a frame, the opening tag that says which node it is -- at the top,
 * unless that line is showing already.
 */
export default function scrollTopFor(
  scrollTop: number,
  height: number,
  top: number,
  bottom: number,
): number {
  if (bottom - top > height) {
    return top >= scrollTop && top < scrollTop + height ? scrollTop : top;
  }

  return top < scrollTop ? top : Math.max(scrollTop, bottom - height);
}
