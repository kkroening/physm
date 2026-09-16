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
    expect(new Spring(2.5).toJsonObj()).toEqual({ stiffness: 2.5 });
  });
});
