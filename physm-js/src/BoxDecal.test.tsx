import * as mat3 from './Mat3';
import * as vec3 from './Vec3';
import BoxDecal from './BoxDecal';

describe('BoxDecal', () => {
  test('defaults to a centred unit square', () => {
    const decal = new BoxDecal();

    expect(decal.width).toBe(1);
    expect(decal.height).toBe(1);
    expect(decal.position).toEqual(vec3.ORIGIN);
    expect(decal.centered).toBe(true);
    expect(decal.solid).toBe(true);
  });

  test('a solid box renders a rect at its upper-left corner', () => {
    const element = new BoxDecal({ width: 4, height: 2 }).getDomElement(
      mat3.IDENTITY,
    );

    expect(element.type).toBe('rect');
    expect(element.props).toMatchObject({ width: 4, height: 2 });
  });

  test('an outlined box renders one line per edge', () => {
    const element = new BoxDecal({ solid: false }).getDomElement(mat3.IDENTITY);
    const lines = element.props.children as unknown[];

    expect(lines).toHaveLength(4);
  });

  test('centred and quadrant-one boxes differ by half a side', () => {
    // The two corner sets are the only thing `centered` changes, so this is
    // what would catch them being swapped.
    const centred = new BoxDecal({ width: 2, height: 2, solid: false });
    const corner = new BoxDecal({
      width: 2,
      height: 2,
      solid: false,
      centered: false,
    });

    const firstOf = (decal: BoxDecal): unknown =>
      (decal.getDomElement(mat3.IDENTITY).props.children as { props: unknown }[])[0]
        ?.props;

    expect(firstOf(centred)).toMatchObject({ x1: -1, y1: -1 });
    expect(firstOf(corner)).toMatchObject({ x1: 0, y1: 0 });
  });

  test('xform scales the box and its stroke together', () => {
    const moved = new BoxDecal({ width: 2, height: 3, lineWidth: 1 }).xform(
      mat3.scaling(5, 5),
    );

    expect(moved.width).toBeCloseTo(10, 9);
    expect(moved.height).toBeCloseTo(15, 9);
    expect(moved.lineWidth).toBeCloseTo(5, 9);
  });
});
