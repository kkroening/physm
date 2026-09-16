import Frame from './Frame';
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

describe("a frame's springs", () => {
  test('add, so several are one of their summed stiffness', () => {
    // The property that makes the list shape cost nothing today: while every
    // spring is linear, `[k1, k2]` and `[k1 + k2]` are the same spring. It is
    // also the property that stops holding the moment one is not linear,
    // which is the reason the list exists.
    const several = new Frame({ springs: [new Spring(3), new Spring(5)] });
    const one = new Frame({ springs: [new Spring(8)] });

    for (const q of [0, 0.4, -1.7]) {
      expect(several.springForce(q)).toBeCloseTo(one.springForce(q), 12);
    }
  });

  test('a frame with none is a frame with no spring force', () => {
    expect(new Frame().springs).toEqual([]);
    expect(new Frame().springForce(2)).toBe(0);
  });

  test('reach the frame through its own serialization', () => {
    expect(
      new Frame({ id: 'a', springs: [new Spring(6)] }).toJsonObj().springs,
    ).toEqual([{ stiffness: 6 }]);
  });
});
