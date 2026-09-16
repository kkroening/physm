import Anchor from './Anchor';
import Box from './Box';
import Circle from './Circle';
import Coincidence from './Coincidence';
import Distance from './Distance';
import FixedFrame from './FixedFrame';
import Line from './Line';
import RotationalFrame from './RotationalFrame';
import Spring from './Spring';
import TrackFrame from './TrackFrame';
import Weight from './Weight';
import WorldLine from './WorldLine';

/**
 * The binding's building blocks, in the order a library lists them.
 *
 * Every entry carries a `sceneNode` and a `meta`. A test holds this list and the
 * binding's exports to each other, so a new building block cannot be exported
 * without being described, or described without being listed.
 */
const coreComponents = [
  TrackFrame,
  RotationalFrame,
  FixedFrame,
  Box,
  Circle,
  Line,
  WorldLine,
  Weight,
  Spring,
  Anchor,
  Coincidence,
  Distance,
] as const;

export default coreComponents;
