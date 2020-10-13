export const defaultGetNodeParents = (x) => x.parents;
export const defaultGetNodeKey = (x) => x;

export function toposort(
  nodes,
  { getNodeParents = undefined, getNodeKey = undefined } = {},
) {
  getNodeParents = getNodeParents || defaultGetNodeParents;
  getNodeKey = getNodeKey || defaultGetNodeKey;
  const markedNodes = new Set();
  const sortedNodes = [];
  const sortedKeys = [];
  const unvisitedNodes = [...nodes];

  function visit(node, child) {
    const nodeKey = getNodeKey(node);
    if (markedNodes.has(nodeKey)) {
      throw new Error(`Graph is not a DAG; recursively encountered ${node}`);
    }
    if (!sortedKeys.includes(nodeKey)) {
      const parents = getNodeParents(node);
      if (parents) {
        markedNodes.add(nodeKey);
        parents.forEach((parent) => visit(parent, node));
        markedNodes.delete(nodeKey);
        sortedNodes.push(node);
        sortedKeys.push(nodeKey);
      }
    }
  }

  while (unvisitedNodes.length) {
    const node = unvisitedNodes.pop();
    visit(node, null);
  }
  return sortedNodes;
}

export function getChildMap(
  nodes,
  { getNodeParents = undefined, getNodeKey = undefined } = {},
) {
  getNodeParents = getNodeParents || defaultGetNodeParents;
  getNodeKey = getNodeKey || defaultGetNodeKey;
  const sortedNodes = toposort(nodes, {
    getNodeParents: getNodeParents,
    getNodekey: getNodeKey,
  });
  const childMap = new Map();
  sortedNodes.forEach((node) => {
    const nodeKey = getNodeKey(node);
    if (!childMap.has(nodeKey)) {
      childMap.set(nodeKey, new Set());
    }
    childMap.get(nodeKey).add(node);
  });
  return childMap;
}

export function transform(
  nodes,
  {
    getNodeParents = undefined,
    getNodeKey = undefined,
    visitNode = undefined,
    visitEdge = undefined,
    nodeMapCache = new Map(),
    edgeMapCache = new Map(),
  } = {},
) {
  getNodeParents = getNodeParents || defaultGetNodeParents;
  getNodeKey = getNodeKey || defaultGetNodeKey;
  visitNode = visitNode || ((node, parentValues) => null);
  visitEdge = visitEdge || ((node, parentNode, parentValue) => parentValue);
  let lazyGetNodeParents;
  if (nodeMapCache) {
    // Bypass traversal of nodes that are already in the cache:
    // TODO: figure out whether this actually makes sense or not.
    lazyGetNodeParents = (node) =>
      nodeMapCache.has(getNodeKey(node)) ? [] : getNodeParents(node);
  } else {
    lazyGetNodeParents = getNodeParents;
  }
  const sortedNodes = toposort(nodes, {
    getNodeParents: lazyGetNodeParents,
    getNodeKey: getNodeKey,
  });
  const nodeMap = new Map(nodeMapCache);
  const edgeMap = new Map(edgeMapCache);
  sortedNodes.forEach((node) => {
    const nodeKey = getNodeKey(node);
    let nodeValue;
    if (nodeMapCache.has(nodeKey)) {
      nodeValue = nodeMapCache.get(nodeKey);
    } else {
      const parentNodes = getNodeParents(node);
      const parentEdgeValues = parentNodes.map((parentNode) => {
        const parentNodeKey = getNodeKey(parentNode);
        const edgeValue = visitEdge(
          node,
          parentNode,
          nodeMap.get(parentNodeKey),
        );
        edgeMap.set([parentNodeKey, nodeKey], edgeValue);
        return edgeValue;
      });
      nodeValue = visitNode(node, parentEdgeValues);
    }
    nodeMap.set(nodeKey, nodeValue);
  });
  return [nodeMap, edgeMap];
}

export function transformNodes(
  nodes,
  {
    getNodeParents = undefined,
    getNodeKey = undefined,
    visitNode = undefined,
    nodeMapCache = new Map(),
  } = {},
) {
  const [nodeMap] = transform(nodes, {
    getNodeParents: getNodeParents,
    getNodeKey: getNodeKey,
    visitNode: visitNode,
    nodeMapCache: nodeMapCache,
  });
  return nodeMap;
}

export function transformEdges(
  nodes,
  {
    getNodeParents = undefined,
    getNodeKey = undefined,
    visitEdge = undefined,
    edgeMapCache = new Map(),
  } = {},
) {
  const [, edgeMap] = transform(nodes, {
    getNodeParents: getNodeParents,
    getNodeKey: getNodeKey,
    visitEdge: visitEdge,
    edgeMapCache: edgeMapCache,
  });
  return edgeMap;
}
