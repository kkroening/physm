import { createContext } from 'react';
import type { FrameId } from './../Frame';

/**
 * The id of the frame a component is nested inside, or `null` at the root.
 *
 * Distinct from `ParentKeyContext`, which carries the component *key* used for
 * parentage. A frame's id is its `id` prop when it has one and its key when it
 * does not, so the two differ exactly when the author named the frame -- and an
 * `<Anchor>` needs the id, since that is what a constraint is written against.
 */
const FrameIdContext = createContext<FrameId | null>(null);

export default FrameIdContext;
