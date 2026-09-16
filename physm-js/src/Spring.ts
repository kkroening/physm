export interface SpringJson {
  stiffness: number;
  rest: number;
}

/**
 * A spring acting on the frame's own coordinate, slack at `rest`.
 *
 * The restoring generalised force is `-stiffness * (q - rest)`: a torque on a
 * rotational joint, and a force along the axis of a track. It is conservative
 * -- `U = stiffness * (q - rest)^2 / 2` -- so it enters the potential with
 * gravity rather than the dissipative terms, which is what
 * `docs/algorithm.md` means by "the frame's own coordinate is the whole of its
 * input".
 *
 * **A node rather than a prop on the frame**, for the reasons a frame's
 * `Weight`s are: there may be several, they are separate things a person adds
 * and removes, and they carry their own parameters. While every spring is
 * linear the multiplicity buys nothing -- two of them sum exactly to one --
 * and it buys everything the moment one is not, which is where a stop that
 * engages past a threshold, or a stiffness that rises with the angle, would
 * go. `docs/issues/0016/12-wishlist.md` asks for exactly that.
 *
 * It is also what keeps a *joint* spring and a spring anchored to something
 * else distinguishable. They are different devices -- one belongs to a
 * frame's coordinate and one names two ends -- and a pair of numbers on the
 * frame is a shape in which that cannot be said.
 */
export default class Spring {
  readonly stiffness: number;

  /**
   * Where the spring is slack, in the frame's *own* coordinate.
   *
   * An angle on a revolute joint and a length along a track, because that is
   * what the coordinate is -- so it carries no unit of its own and none is
   * assumed, the same way `stiffness` does not.
   *
   * **Relative, not absolute.** A crane arm held "horizontal" is held
   * horizontal *relative to what it is mounted on*, which is what a rest in
   * the joint's coordinate says. Where the rest genuinely has to be read
   * against some other frame, that is not a property of the spring at all --
   * it is one frame observed from another, which belongs to the expression
   * system. See `docs/issues/0030.md`.
   */
  readonly rest: number;

  constructor(stiffness = 0, rest = 0) {
    this.stiffness = stiffness;
    this.rest = rest;
  }

  /**
   * What this spring contributes to its frame's generalised force.
   *
   * Asked of the spring rather than computed by the solver, so that what a
   * spring is slack *toward* stays the spring's own business: the solver hands
   * over the coordinate and adds up what it gets back.
   */
  force(q: number): number {
    return -this.stiffness * (q - this.rest);
  }

  toJsonObj(): SpringJson {
    return { stiffness: this.stiffness, rest: this.rest };
  }
}
