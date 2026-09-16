import Spring from './Spring';

describe('Spring', () => {
  test('pulls the coordinate back toward zero', () => {
    const spring = new Spring(4);

    expect(spring.force(0.5)).toBeCloseTo(-2, 12);
    expect(spring.force(-0.5)).toBeCloseTo(2, 12);
    expect(spring.force(0)).toBeCloseTo(0, 12);
  });

  test('a slack spring is one of no stiffness, not an absent one', () => {
    expect(new Spring().stiffness).toBe(0);
    expect(new Spring().force(3)).toBeCloseTo(0, 12);
  });

  test('serializes as what it is', () => {
    expect(new Spring(2.5, 0.5).toJsonObj()).toEqual({
      stiffness: 2.5,
      rest: 0.5,
    });
  });

  test('is slack where its rest says, not at zero', () => {
    // What "hold the arm horizontal" actually needs, and needs nothing else:
    // horizontal relative to whatever the arm is mounted on is a rest in the
    // joint's own coordinate. It reads no pose and touches no other frame.
    const spring = new Spring(4, 0.5);

    expect(spring.force(0.5)).toBeCloseTo(0, 12);
    expect(spring.force(1)).toBeCloseTo(-2, 12);
    expect(spring.force(0)).toBeCloseTo(2, 12);
  });

  test('a rest moves where it is slack and nothing else', () => {
    // The same spring, shifted: the force at a given displacement *from rest*
    // is what it always was, which is what makes this a rest rather than a
    // second stiffness.
    const slack = new Spring(4);
    const offset = new Spring(4, 1.5);

    for (const away of [0, 0.4, -1.7]) {
      expect(offset.force(1.5 + away)).toBeCloseTo(slack.force(away), 12);
    }
  });
});
