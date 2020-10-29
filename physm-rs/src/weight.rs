use crate::Position;

#[derive(Debug)]
pub struct Weight {
    mass: f64,
    position: Position,
}

impl Weight {
    pub fn new(mass: f64) -> Weight {
        Weight {
            mass,
            position: [0., 0.],
        }
    }

    pub fn set_position(mut self, position: [f64; 2]) -> Self {
        self.position = position;
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn constructor() {
        let weight = Weight::new(7.);
        assert_eq!(weight.mass, 7.);
        assert_eq!(weight.position, [0., 0.]);

        let weight = weight.set_position([3., 4.]);
        assert_eq!(weight.mass, 7.);
        assert_eq!(weight.position, [3., 4.]);
    }
}
