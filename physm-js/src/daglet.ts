/**
 * Generic directed-acyclic-graph traversal: topological sort, and folds over a
 * graph in dependency order.
 *
 * Nothing here knows about physics. `Scene` uses it to order frames parents-first
 * and to accumulate each frame's root path.
 */

/** Where a node's incoming edges come from. `null` means "not a node to visit". */
export type GetNodeParents<Node> = (node: Node) => readonly Node[] | null;

/** A node's stable identity, which need not be the node itself. */
export type GetNodeKey<Node, Key> = (node: Node) => Key;

/** Folds a node together with the values already computed for its parents. */
export type VisitNode<Node, NodeValue, EdgeValue> = (
  node: Node,
  parentValues: readonly EdgeValue[],
) => NodeValue;

/** Folds one edge, given the value already computed for the parent it comes from. */
export type VisitEdge<Node, NodeValue, EdgeValue> = (
  node: Node,
  parentNode: Node,
  parentValue: NodeValue | undefined,
) => EdgeValue;

/**
 * `| undefined` on each: these options are forwarded from destructured values,
 * so under `exactOptionalPropertyTypes` an explicitly-`undefined` property is a
 * real input and not the same thing as an absent one.
 */
export interface TraversalOptions<Node, Key> {
  getNodeParents?: GetNodeParents<Node> | undefined;
  getNodeKey?: GetNodeKey<Node, Key> | undefined;
}

/**
 * The default parent accessor reads a `parents` property, which only exists on
 * nodes shaped that way -- hence the cast. Callers whose nodes are shaped
 * otherwise pass their own accessor, and then this is never reached.
 */
export function defaultGetNodeParents<Node>(
  node: Node,
): readonly Node[] | null {
  return (node as { parents?: readonly Node[] | null }).parents ?? null;
}

/** The default identity: the node is its own key. */
export function defaultGetNodeKey<Node, Key>(node: Node): Key {
  return node as unknown as Key;
}

/**
 * The mutable state one `toposort` carries, passed explicitly rather than
 * captured, so that `visit` below states what it touches.
 */
interface ToposortState<Node, Key> {
  getNodeParents: GetNodeParents<Node>;
  getNodeKey: GetNodeKey<Node, Key>;

  /** Nodes on the current path, so a cycle is a revisit rather than a hang. */
  active: Set<Key>;

  sortedNodes: Node[];
  sortedKeys: Set<Key>;
}

function visitForToposort<Node, Key>(
  node: Node,
  state: ToposortState<Node, Key>,
): void {
  const nodeKey = state.getNodeKey(node);

  if (state.active.has(nodeKey)) {
    throw new Error(`Graph is not a DAG; recursively encountered ${node}`);
  }

  if (state.sortedKeys.has(nodeKey)) {
    return;
  }

  const parents = state.getNodeParents(node);
  if (!parents) {
    return;
  }

  // Parents first, so the node lands after everything it depends on.
  state.active.add(nodeKey);
  parents.forEach((parent) => visitForToposort(parent, state));
  state.active.delete(nodeKey);

  state.sortedNodes.push(node);
  state.sortedKeys.add(nodeKey);
}

/** The nodes, ordered so that every node follows all of its parents. */
export function toposort<Node, Key = Node>(
  nodes: Iterable<Node>,
  {
    getNodeParents = defaultGetNodeParents,
    getNodeKey = defaultGetNodeKey,
  }: TraversalOptions<Node, Key> = {},
): Node[] {
  const state: ToposortState<Node, Key> = {
    getNodeParents,
    getNodeKey,
    active: new Set(),
    sortedNodes: [],
    sortedKeys: new Set(),
  };

  [...nodes].forEach((node) => visitForToposort(node, state));

  return state.sortedNodes;
}

/**
 * The reverse adjacency: each node's key mapped to the nodes that name it as a
 * parent. Every key reachable from `nodes` appears, including childless ones.
 */
/** The child set for a key, created empty on first reach. */
function childrenOf<Node, Key>(
  childMap: Map<Key, Set<Node>>,
  key: Key,
): Set<Node> {
  const existing = childMap.get(key);
  if (existing) {
    return existing;
  }

  const created = new Set<Node>();
  childMap.set(key, created);

  return created;
}

export function getChildMap<Node, Key = Node>(
  nodes: Iterable<Node>,
  {
    getNodeParents = defaultGetNodeParents,
    getNodeKey = defaultGetNodeKey,
  }: TraversalOptions<Node, Key> = {},
): Map<Key, Set<Node>> {
  const childMap = new Map<Key, Set<Node>>();

  toposort(nodes, { getNodeParents, getNodeKey }).forEach((node) => {
    childrenOf(childMap, getNodeKey(node));

    (getNodeParents(node) ?? []).forEach((parent) =>
      childrenOf(childMap, getNodeKey(parent)).add(node),
    );
  });

  return childMap;
}

export interface TransformOptions<
  Node,
  Key,
  NodeValue,
  EdgeValue,
> extends TraversalOptions<Node, Key> {
  visitNode?: VisitNode<Node, NodeValue, EdgeValue> | undefined;
  visitEdge?: VisitEdge<Node, NodeValue, EdgeValue> | undefined;
}

/** `transformNodes` folds nodes only, so it does not accept an edge visitor. */
export interface TransformNodesOptions<
  Node,
  Key,
  NodeValue,
> extends TraversalOptions<Node, Key> {
  visitNode?: VisitNode<Node, NodeValue, NodeValue> | undefined;
}

/** `transformEdges` folds edges only, so it does not accept a node visitor. */
export interface TransformEdgesOptions<
  Node,
  Key,
  EdgeValue,
> extends TraversalOptions<Node, Key> {
  visitEdge?: VisitEdge<Node, unknown, EdgeValue> | undefined;
}

/**
 * Fold the graph in dependency order, producing a value per node and per edge.
 *
 * Because the traversal is topological, every parent's value is already computed
 * by the time a node is visited, which is what lets `visitNode` build on them.
 */
export function transform<
  Node,
  Key = Node,
  NodeValue = unknown,
  EdgeValue = unknown,
>(
  nodes: Iterable<Node>,
  {
    getNodeParents = defaultGetNodeParents,
    getNodeKey = defaultGetNodeKey,

    // `null`, not `undefined`: `transformEdges` leans on this being the value a
    // parent contributes when no `visitNode` was supplied.
    visitNode = () => null as NodeValue,
    visitEdge = (_node, _parentNode, parentValue) => parentValue as EdgeValue,
  }: TransformOptions<Node, Key, NodeValue, EdgeValue> = {},
): [Map<Key, NodeValue>, Map<[Key, Key], EdgeValue>] {
  const nodeMap = new Map<Key, NodeValue>();
  const edgeMap = new Map<[Key, Key], EdgeValue>();

  toposort(nodes, { getNodeParents, getNodeKey }).forEach((node) => {
    const nodeKey = getNodeKey(node);

    const parentValues = (getNodeParents(node) ?? []).map((parentNode) => {
      const parentKey = getNodeKey(parentNode);
      const edgeValue = visitEdge(node, parentNode, nodeMap.get(parentKey));

      // The key is a fresh tuple, so `edgeMap` is iterable but not lookup-able
      // by an equivalent pair. Preserved as-is; no caller looks one up.
      edgeMap.set([parentKey, nodeKey], edgeValue);

      return edgeValue;
    });

    nodeMap.set(nodeKey, visitNode(node, parentValues));
  });

  return [nodeMap, edgeMap];
}

/** `transform`, for callers that only want the per-node values. */
export function transformNodes<Node, Key = Node, NodeValue = unknown>(
  nodes: Iterable<Node>,
  {
    getNodeParents,
    getNodeKey,
    visitNode,
  }: TransformNodesOptions<Node, Key, NodeValue> = {},
): Map<Key, NodeValue> {
  // Forwarded field by field rather than as a bag: passing the whole object on
  // would let a stray `visitEdge` reach `transform` and change what the node
  // visitor is handed.
  const [nodeMap] = transform<Node, Key, NodeValue, NodeValue>(nodes, {
    getNodeParents,
    getNodeKey,
    visitNode,
  });

  return nodeMap;
}

/** `transform`, for callers that only want the per-edge values. */
export function transformEdges<Node, Key = Node, EdgeValue = unknown>(
  nodes: Iterable<Node>,
  {
    getNodeParents,
    getNodeKey,
    visitEdge,
  }: TransformEdgesOptions<Node, Key, EdgeValue> = {},
): Map<[Key, Key], EdgeValue> {
  // Likewise: no `visitNode` reaches `transform`, so every `parentValue` handed
  // to `visitEdge` is the default `null` rather than something a caller
  // supplied for a map this function then discards.
  const [, edgeMap] = transform<Node, Key, unknown, EdgeValue>(nodes, {
    getNodeParents,
    getNodeKey,
    visitEdge,
  });

  return edgeMap;
}
