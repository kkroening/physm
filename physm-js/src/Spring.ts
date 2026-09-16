export interface SpringJson {
  stiffness: number;
}

/**
 * A spring acting on the frame's own coordinate, slack at zero.
 *
 * The restoring generalised force is `-stiffness * q`: a torque on a
 * rotational joint, and a force along the axis of a track. It is conservative
 * -- `U = stiffness * q^2 / 2` -- so it enters the potential with gravity
 * rather than the dissipative terms, which is what `docs/algorithm.md` means
 * by "the frame's own coordinate is the whole of its input".
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

  constructor(stiffness = 0) {
    this.stiffness = stiffness;
  }

  /**
   * What this spring contributes to its frame's generalised force.
   *
   * Asked of the spring rather than computed by the solver, so that what a
   * spring is slack *toward* stays the spring's own business: the solver hands
   * over the coordinate and adds up what it gets back.
   */
  force(q: number): number {
    return -this.stiffness * q;
  }

  toJsonObj(): SpringJson {
    return { stiffness: this.stiffness };
  }
}
