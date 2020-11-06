export const defaultGetNodeParents = (x) => x.parents;
export const defaultGetNodeKey = (x) => x;

export function toposort(
  nodes,
  { getNodeParents = undefined, getNodeKey = undefined } = {}
) {
  getNodeParents = getNodeParents || defaultGetNodeParents;
  getNodeKey = getNodeKey || defaultGetNodeKey;
  const markedNodes = new Set();
  const sortedNodes = [];
  const sortedKeys = [];

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

  [...nodes].forEach((node) => visit(node, null));
  return sortedNodes;
}

export function getChildMap(
  nodes,
  { getNodeParents = undefined, getNodeKey = undefined } = {}
) {
  getNodeParents = getNodeParents || defaultGetNodeParents;
  getNodeKey = getNodeKey || defaultGetNodeKey;
  const sortedNodes = toposort(nodes, {
    getNodeParents: getNodeParents,
    getNodeKey: getNodeKey,
  });
  const childMap = new Map();
  sortedNodes.forEach((node) => {
    const nodeKey = getNodeKey(node);
    const parents = getNodeParents(node);
    childMap.has(nodeKey) || childMap.set(nodeKey, new Set());
    parents.forEach((parent) => {
      const parentKey = getNodeKey(parent);
      childMap.has(parentKey) || childMap.set(parentKey, new Set());
      childMap.get(parentKey).add(node);
    });
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
  } = {}
) {
  getNodeParents = getNodeParents || defaultGetNodeParents;
  getNodeKey = getNodeKey || defaultGetNodeKey;
  visitNode = visitNode || ((node, parentValues) => null);
  visitEdge = visitEdge || ((node, parentNode, parentValue) => parentValue);
  const sortedNodes = toposort(nodes, {
    getNodeParents: getNodeParents,
    getNodeKey: getNodeKey,
  });
  const nodeMap = new Map();
  const edgeMap = new Map();
  sortedNodes.forEach((node) => {
    const nodeKey = getNodeKey(node);
    const parentNodes = getNodeParents(node);
    const parentEdgeValues = parentNodes.map((parentNode) => {
      const parentNodeKey = getNodeKey(parentNode);
      const edgeValue = visitEdge(node, parentNode, nodeMap.get(parentNodeKey));
      edgeMap.set([parentNodeKey, nodeKey], edgeValue);
      return edgeValue;
    });
    const nodeValue = visitNode(node, parentEdgeValues);
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
  } = {}
) {
  const [nodeMap] = transform(nodes, {
    getNodeParents: getNodeParents,
    getNodeKey: getNodeKey,
    visitNode: visitNode,
  });
  return nodeMap;
}

export function transformEdges(
  nodes,
  {
    getNodeParents = undefined,
    getNodeKey = undefined,
    visitEdge = undefined,
  } = {}
) {
  const [, edgeMap] = transform(nodes, {
    getNodeParents: getNodeParents,
    getNodeKey: getNodeKey,
    visitEdge: visitEdge,
  });
  return edgeMap;
}
