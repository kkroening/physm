//! Loop closure via Lagrange multipliers.
//!
//! See `docs/constraints.md`. The frame tree stays a tree; a relationship the tree
//! cannot express — two rope chains that must meet — enters as rows on an augmented
//! system.

use std::fmt::Debug;

use crate::json;
use crate::Error;
use crate::FrameId;
use crate::Mat3;
use crate::Position;
use crate::Vec3;

pub type ConstraintBox = Box<dyn Constraint>;

/// Everything a constraint needs from the solver's sweeps.
///
/// `pos_mats` and `vel_mats` are functions of `q` alone, and are the only fields
/// `value` and `jacobian_rows` read. The velocity-dependent sweeps are `Option`
/// precisely so those two can be evaluated at a trial configuration that no solve
/// was run at — which is what a projection stabilization pass needs, and which a
/// context that always carried them would quietly prevent (`constraints.md` §7,
/// seam 4).
pub struct ConstraintCtx<'a> {
    pub frame_count: usize,
    pub index_a: usize,
    pub index_b: usize,
    /// Root path of each frame, as global indices — so a path member *is* a matrix
    /// index. `physm-py` lacked this and indexed by position along the path, which
    /// misplaced every constraint row on a branched scene (`constraints.md` §9).
    pub path_a: &'a [usize],
    pub path_b: &'a [usize],
    pub pos_mats: &'a [Mat3],
    pub vel_mats: &'a [Mat3],
    pub vel_sum_mats: Option<&'a [Mat3]>,
    pub accel_sum_mats: Option<&'a [Mat3]>,
}

impl<'a> ConstraintCtx<'a> {
    fn world_points(&self, r_p: &Position, r_q: &Position) -> (Vec3, Vec3) {
        (
            self.pos_mats[self.index_a] * r_p.to_vec3(),
            self.pos_mats[self.index_b] * r_q.to_vec3(),
        )
    }

    /// Rows of `J_d = ∂d/∂q`, one per generalized coordinate.
    ///
    /// `(J_d)_i = [i ⪯ a] V_i x_P − [i ⪯ b] V_i x_Q`, nonzero only on the union of
    /// the two root paths. Returned dense because `n` is small and a dense row is
    /// what the assembler wants.
    fn separation_jacobian(&self, x_p: &Vec3, x_q: &Vec3) -> Vec<Vec3> {
        let mut rows = vec![Vec3::zeros(); self.frame_count];
        for &i in self.path_a {
            rows[i] += self.vel_mats[i] * x_p;
        }
        for &i in self.path_b {
            rows[i] -= self.vel_mats[i] * x_q;
        }
        rows
    }

    /// `ḋ = S_a x_P − S_b x_Q`, from the spatial twists.
    fn separation_velocity(&self, x_p: &Vec3, x_q: &Vec3) -> Vec3 {
        let s = self
            .vel_sum_mats
            .expect("separation_velocity needs vel_sum_mats; ConstraintCtx was built for a trial configuration");
        s[self.index_a] * x_p - s[self.index_b] * x_q
    }

    /// `J̇_d q̇ = A_a x_P − A_b x_Q`, from the bias accelerations.
    ///
    /// This is the *separation's* bias. Each constraint type derives its own
    /// `J̇q̇` from it, and they differ — conflating the two is the error
    /// `constraints.md` §4 exists to prevent.
    fn separation_bias(&self, x_p: &Vec3, x_q: &Vec3) -> Vec3 {
        let a = self
            .accel_sum_mats
            .expect("separation_bias needs accel_sum_mats; ConstraintCtx was built for a trial configuration");
        a[self.index_a] * x_p - a[self.index_b] * x_q
    }
}

pub trait Constraint: Debug {
    fn frame_ids(&self) -> (&FrameId, &FrameId);

    /// Number of scalar rows this constraint contributes.
    fn row_count(&self) -> usize;

    /// `C(q)`, one entry per row. Zero when satisfied.
    ///
    /// Reads only the configuration sweeps, so it is evaluable at a trial `q`.
    fn value(&self, ctx: &ConstraintCtx) -> Vec<f64>;

    /// Rows of `∂C/∂q`, each of length `frame_count`.
    ///
    /// Reads only the configuration sweeps, so it is evaluable at a trial `q`.
    fn jacobian_rows(&self, ctx: &ConstraintCtx) -> Vec<Vec<f64>>;

    /// `J̇q̇`, one entry per row. Needs the velocity-dependent sweeps.
    fn bias(&self, ctx: &ConstraintCtx) -> Vec<f64>;
}

/// `C = ½(‖d‖² − L²)` — one row. A rigid massless link, free to swing about both
/// ends.
///
/// Degenerates as `‖d‖ → 0`: the row is `J_dᵀ d`, which vanishes with `d`, while the
/// right-hand side keeps a `−‖ḋ‖²` term that does not. `length` must be positive,
/// and `constraints.md` §8 covers the configuration-dependent case where `‖d‖`
/// drifts small anyway.
#[derive(Debug)]
pub struct DistanceConstraint {
    pub frame1: FrameId,
    pub frame2: FrameId,
    pub position1: Position,
    pub position2: Position,
    pub length: f64,
}

impl DistanceConstraint {
    /// Panics on a non-positive `length`, which is the degeneracy the type's doc
    /// comment describes rather than an input to validate: this constructor is
    /// reached from Rust code, where a zero target is a bug at the call site.
    /// `from_json_value` returns an `Error` for the same condition, because
    /// there the length is untrusted input and deserves a message.
    pub fn new(frame1: FrameId, frame2: FrameId, length: f64) -> Self {
        assert!(
            length > 0.,
            "DistanceConstraint length must be positive; got {}",
            length
        );
        Self {
            frame1,
            frame2,
            position1: Position::default(),
            position2: Position::default(),
            length,
        }
    }

    pub fn set_positions(mut self, position1: Position, position2: Position) -> Self {
        self.position1 = position1;
        self.position2 = position2;
        self
    }

    pub fn from_json_value(value: &serde_json::Value) -> Result<Self, Error> {
        let obj = json::value_to_json_obj(value)?;
        let length = json::map_value_item(value, &"length", json::value_to_f64)?;
        if !(length > 0.) {
            return Err(Error(format!(
                "DistanceConstraint length must be positive; got {}",
                length
            )));
        }
        Ok(Self {
            frame1: json::map_value_item(value, &"frame1", json::value_to_str)?.into(),
            frame2: json::map_value_item(value, &"frame2", json::value_to_str)?.into(),
            position1: json::map_obj_item_or_default(obj, "position1", Position::from_json_value)?,
            position2: json::map_obj_item_or_default(obj, "position2", Position::from_json_value)?,
            length,
        })
    }
}

impl Constraint for DistanceConstraint {
    fn frame_ids(&self) -> (&FrameId, &FrameId) {
        (&self.frame1, &self.frame2)
    }

    fn row_count(&self) -> usize {
        1
    }

    fn value(&self, ctx: &ConstraintCtx) -> Vec<f64> {
        let (x_p, x_q) = ctx.world_points(&self.position1, &self.position2);
        let d = x_p - x_q;
        vec![0.5 * (d.dot(&d) - self.length * self.length)]
    }

    fn jacobian_rows(&self, ctx: &ConstraintCtx) -> Vec<Vec<f64>> {
        let (x_p, x_q) = ctx.world_points(&self.position1, &self.position2);
        let d = x_p - x_q;
        // ∂C/∂qⁱ = dᵀ (J_d)_i
        vec![ctx
            .separation_jacobian(&x_p, &x_q)
            .iter()
            .map(|col| d.dot(col))
            .collect()]
    }

    fn bias(&self, ctx: &ConstraintCtx) -> Vec<f64> {
        let (x_p, x_q) = ctx.world_points(&self.position1, &self.position2);
        let d = x_p - x_q;
        let d_dot = ctx.separation_velocity(&x_p, &x_q);
        // J̇q̇ = ‖ḋ‖² + dᵀ(A_a x_P − A_b x_Q). The ‖ḋ‖² term is what distinguishes
        // this from the coincidence case, and is what the 2019 implementation
        // dropped along with getting the remaining term's sign wrong.
        vec![d_dot.dot(&d_dot) + d.dot(&ctx.separation_bias(&x_p, &x_q))]
    }
}

/// `C = d = 0` — two rows in 2D. A true pin joint.
///
/// Each component is linear in `d`, so unlike the distance form there is no
/// degeneracy at the target. This is also the form a desugared second parent
/// produces (`constraints.md` §2).
#[derive(Debug)]
pub struct CoincidenceConstraint {
    pub frame1: FrameId,
    pub frame2: FrameId,
    pub position1: Position,
    pub position2: Position,
}

impl CoincidenceConstraint {
    pub fn new(frame1: FrameId, frame2: FrameId) -> Self {
        Self {
            frame1,
            frame2,
            position1: Position::default(),
            position2: Position::default(),
        }
    }

    pub fn set_positions(mut self, position1: Position, position2: Position) -> Self {
        self.position1 = position1;
        self.position2 = position2;
        self
    }

    pub fn from_json_value(value: &serde_json::Value) -> Result<Self, Error> {
        let obj = json::value_to_json_obj(value)?;
        Ok(Self {
            frame1: json::map_value_item(value, &"frame1", json::value_to_str)?.into(),
            frame2: json::map_value_item(value, &"frame2", json::value_to_str)?.into(),
            position1: json::map_obj_item_or_default(obj, "position1", Position::from_json_value)?,
            position2: json::map_obj_item_or_default(obj, "position2", Position::from_json_value)?,
        })
    }
}

impl Constraint for CoincidenceConstraint {
    fn frame_ids(&self) -> (&FrameId, &FrameId) {
        (&self.frame1, &self.frame2)
    }

    fn row_count(&self) -> usize {
        2
    }

    fn value(&self, ctx: &ConstraintCtx) -> Vec<f64> {
        let (x_p, x_q) = ctx.world_points(&self.position1, &self.position2);
        let d = x_p - x_q;
        // The homogeneous component of d is identically zero and is not a row.
        vec![d[0], d[1]]
    }

    fn jacobian_rows(&self, ctx: &ConstraintCtx) -> Vec<Vec<f64>> {
        let (x_p, x_q) = ctx.world_points(&self.position1, &self.position2);
        let cols = ctx.separation_jacobian(&x_p, &x_q);
        (0..2)
            .map(|axis| cols.iter().map(|col| col[axis]).collect())
            .collect()
    }

    fn bias(&self, ctx: &ConstraintCtx) -> Vec<f64> {
        let (x_p, x_q) = ctx.world_points(&self.position1, &self.position2);
        let beta = ctx.separation_bias(&x_p, &x_q);
        vec![beta[0], beta[1]]
    }
}

pub fn value_to_constraint(value: &serde_json::Value) -> Result<ConstraintBox, Error> {
    let type_name = json::map_value_item(value, &"type", json::value_to_str)?;
    match type_name {
        "DistanceConstraint" => Ok(Box::new(DistanceConstraint::from_json_value(value)?)),
        "CoincidenceConstraint" => Ok(Box::new(CoincidenceConstraint::from_json_value(value)?)),
        _ => Err(Error(format!("Unknown constraint type: {}", type_name))),
    }
}

pub fn value_to_constraints(value: &serde_json::Value) -> Result<Vec<ConstraintBox>, Error> {
    value
        .as_array()
        .ok_or_else(|| Error(format!("Expected constraint array; got {}", value)))?
        .iter()
        .map(value_to_constraint)
        .collect()
}
