import scrollTopFor from './scrollTopFor';

// Each pane here is 300 pixels high and scrolled 100 down: it shows 100 to 400.
describe('scrollTopFor', () => {
  test('a mark in view stays where it is', () => {
    expect(scrollTopFor(100, 300, 150, 200)).toBe(100);
  });

  test('one out of view comes in by the smallest move', () => {
    // From above to the pane's top, from below to its bottom, and partly in
    // view the rest of the way.
    expect(scrollTopFor(100, 300, 40, 80)).toBe(40);
    expect(scrollTopFor(100, 300, 420, 460)).toBe(160);
    expect(scrollTopFor(100, 300, 80, 120)).toBe(80);
    expect(scrollTopFor(100, 300, 380, 420)).toBe(120);
  });

  test("one the pane's height fits, and comes wholly into view", () => {
    expect(scrollTopFor(100, 300, 200, 500)).toBe(200);
  });

  test('one taller than the pane comes in by its first line, at the top', () => {
    // Above the pane, below it, and across it with its first line out of view
    // -- at the bottom edge is out of view.
    expect(scrollTopFor(100, 300, 0, 500)).toBe(0);
    expect(scrollTopFor(100, 300, 450, 900)).toBe(450);
    expect(scrollTopFor(100, 300, 50, 450)).toBe(50);
    expect(scrollTopFor(100, 300, 400, 800)).toBe(400);
  });

  test('one taller than the pane stays put while its first line shows', () => {
    // At the top edge, and below it.
    expect(scrollTopFor(100, 300, 100, 600)).toBe(100);
    expect(scrollTopFor(100, 300, 200, 700)).toBe(100);
  });
});
