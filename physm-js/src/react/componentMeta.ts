import type { SceneNode } from './sceneNodes';

/**
 * What kind of value a prop holds, as an editor needs to know it.
 *
 * Coarser than the TypeScript type on purpose. `position` and `radius` are both
 * numbers or tuples of them to the compiler; to a person editing a rig one is a
 * place and the other a size, and they want different widgets.
 */
export type PropKind =
  /** Any finite number. */
  | 'number'
  /** A non-negative distance, in scene units. */
  | 'length'
  /** Radians, shown in degrees. */
  | 'angle'
  | 'flag'
  /** `[x, y]`, in the enclosing frame's coordinates. */
  | 'point'
  /** `[q, q̇]`: a frame's initial coordinate and its rate. */
  | 'state'
  /** A CSS colour. */
  | 'color'
  /** An id other parts of the scene refer to. */
  | 'name'
  /** One end of a constraint: an anchor's id, or a frame's. */
  | 'end';

/** One prop, described for an editor and for generated source. */
export interface PropSpec {
  readonly kind: PropKind;
  readonly label: string;

  /**
   * The value the component behaves as though it had when the prop is absent,
   * written as it would be in JSX.
   *
   * Generated source omits a prop equal to it, and an editor shows it as a
   * placeholder rather than a value. **Absent when absence means something no
   * value can say**: an `<Anchor>` without a `position` has its point solved
   * for, which no `[x, y]` expresses -- so once such a prop is set, it stays in
   * the source.
   */
  readonly default?: unknown;

  /** The component cannot be built without it. */
  readonly required?: boolean;

  /**
   * What a newly inserted instance starts with, for a required prop.
   *
   * A required prop has no default by definition, so something has to fill it
   * the moment the component is dropped into a scene -- or the scene it lands
   * in does not build.
   */
  readonly initial?: unknown;

  /**
   * Worth showing, dimmed, in a tree row.
   *
   * A display hint and nothing more. Identity is the element's key, or its
   * position among its siblings -- never a prop value, which can be shared by
   * two instances and can change under an edit.
   */
  readonly summary?: boolean;
}

/**
 * One spec per prop -- no more, and no fewer.
 *
 * `children` and `ref` are structure rather than values, so they have none. The
 * `-?` is what makes a missing spec a compile error: add a prop to a component,
 * forget to describe it, and its metadata stops type-checking.
 */
export type PropSpecs<P> = {
  readonly [K in Exclude<keyof P, 'children' | 'ref'>]-?: PropSpec;
};

/** What a component contributes to a scene: a frame, a decal, and so on. */
export type Slot = SceneNode['slot'];

/** A component, described for an editor's library and for generated source. */
export interface ComponentMeta<P> {
  /**
   * The component's JSX tag.
   *
   * Stated rather than read off `Function.name`, which a production build
   * minifies -- and generated source that says `<a>` where it meant
   * `<TrackFrame>` does not rebuild.
   */
  readonly name: string;

  /** Where the library shelves it. */
  readonly category: 'Frames' | 'Shapes' | 'Physics' | 'Constraints';

  readonly slot: Slot;
  readonly description: string;
  readonly props: PropSpecs<P>;
}

/**
 * Whether a node of one slot may sit directly inside another, or at the root.
 *
 * The same rules the builders enforce, stated where an editor can ask them
 * *before* an insertion rather than learn them from a failed build: a scene
 * carries no mass of its own, so a weight at the root has nowhere to go, and an
 * anchor marks a point on a frame, so it needs one. Only a frame has children
 * at all.
 */
export function canContain(parent: Slot | 'root', child: Slot): boolean {
  switch (parent) {
    case 'frame':
      return true;
    case 'root':
      return child !== 'weight' && child !== 'anchor';
    default:
      return false;
  }
}
