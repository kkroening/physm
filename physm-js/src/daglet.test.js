import { getChildMap } from './daglet';
import * as tf from './tfjs';
import { toposort } from './daglet';
import { transform } from './daglet';
import { transformEdges } from './daglet';
import { transformNodes } from './daglet';

describe('toposort function', () => {
  test('default parameters', () => {
    const node1 = { name: 'node1', parents: [] };
    const node2 = { name: 'node2', parents: [] };
    const node3 = { name: 'node3', parents: [node2] };
    const node4 = { name: 'node4', parents: [node1, node3] };
    const node5 = { name: 'node5', parents: [node1, node4] };
    const node6 = { name: 'node6', parents: [] };
    const sortedNodes = toposort([node5, node6]);
    const sortedNodeNames = sortedNodes.map((x) => x.name);
    expect(sortedNodeNames).toStrictEqual([
      node1.name,
      node2.name,
      node3.name,
      node4.name,
      node5.name,
      node6.name,
    ]);
  });

  test('custom getNodeParents function', () => {
    const node1 = { name: 'node1', nodes: [] };
    const node2 = { name: 'node1', nodes: [node1] };
    const sortedNodes = toposort([node2], { getNodeParents: (x) => x.nodes });
    const sortedNodeNames = sortedNodes.map((x) => x.name);
    expect(sortedNodeNames).toStrictEqual([node1.name, node2.name]);
  });

  test('custom getNodeKey function', () => {
    const node1a = { name: 'node1', parents: [] };
    const node1b = { name: 'node1', parents: [] };
    const node2 = { name: 'node2', parents: [node1a] };
    const node3 = { name: 'node3', parents: [node2, node1b] };
    const sortedNodes = toposort([node3], { getNodeKey: (x) => x.name });
    const sortedNodeNames = sortedNodes.map((x) => x.name);
    expect(sortedNodeNames).toStrictEqual([
      node1a.name,
      node2.name,
      node3.name,
    ]);
  });

  test('detects cycles', () => {
    const toString = (x) => x.name;
    const node1 = { toString: () => 'node1' };
    const node2 = { toString: () => 'node2', parents: [node1] };
    node1.parents = [node2];
    expect(() => toposort([node2])).toThrow(
      new Error('Graph is not a DAG; recursively encountered node2'),
    );
  });
});

test('getChildMap function', () => {
  const parentMap = {
    node1: [],
    node2: [],
    node3: ['node2'],
    node4: ['node1', 'node3'],
    node5: ['node1', 'node4'],
  };
  const getParents = (nodeName) => parentMap[nodeName];
  const childMap = getChildMap(['node5'], { getNodeParents: getParents });
  const expectedChildMap = new Map([
    ['node1', new Set(['node4', 'node5'])],
    ['node2', new Set(['node3'])],
    ['node3', new Set(['node4'])],
    ['node4', new Set(['node5'])],
    ['node5', new Set()],
  ]);
  expect(childMap).toEqual(expectedChildMap);
});

test('transform function', () => {
  const parentMap = {
    node1: [],
    node2: [],
    node3: ['node2'],
    node4: ['node1', 'node3'],
    node5: ['node1', 'node4'],
  };
  const getParents = (nodeName) => parentMap[nodeName];
  const visitNode = (nodeName, parentValues) => [nodeName, parentValues.length];
  const visitEdge = (nodeName, parentNodeName, parentValue) => [
    nodeName,
    parentNodeName,
    parentValue,
  ];
  const [nodeMap, edgeMap] = transform(['node5'], {
    getNodeParents: getParents,
    visitNode: visitNode,
    visitEdge: visitEdge,
  });
  expect(Object.fromEntries([...nodeMap])).toEqual({
    node1: ['node1', 0],
    node2: ['node2', 0],
    node3: ['node3', 1],
    node4: ['node4', 2],
    node5: ['node5', 2],
  });
  expect(Object.fromEntries([...edgeMap])).toEqual({
    [['node1', 'node4']]: ['node4', 'node1', ['node1', 0]],
    [['node1', 'node5']]: ['node5', 'node1', ['node1', 0]],
    [['node2', 'node3']]: ['node3', 'node2', ['node2', 0]],
    [['node3', 'node4']]: ['node4', 'node3', ['node3', 1]],
    [['node4', 'node5']]: ['node5', 'node4', ['node4', 2]],
  });
});

test('transformNodes function', () => {
  const parentMap = {
    node1: [],
    node2: [],
    node3: ['node2'],
    node4: ['node1', 'node3'],
    node5: ['node1', 'node4'],
  };
  const getParents = (nodeName) => parentMap[nodeName];
  const visitNode = (nodeName, parentValues) => nodeName;
  const nodeMap = transformNodes(['node5'], {
    getNodeParents: getParents,
    visitNode: visitNode,
  });
  expect(Object.fromEntries([...nodeMap])).toEqual({
    node1: 'node1',
    node2: 'node2',
    node3: 'node3',
    node4: 'node4',
    node5: 'node5',
  });
});

test('transformEdges function', () => {
  const parentMap = {
    node1: [],
    node2: [],
    node3: ['node2'],
    node4: ['node1', 'node3'],
    node5: ['node1', 'node4'],
  };
  const getParents = (nodeName) => parentMap[nodeName];
  const visitEdge = (nodeName, parentNodeName, parentValue) => [
    nodeName,
    parentNodeName,
    parentValue,
  ];
  const edgeMap = transformEdges(['node5'], {
    getNodeParents: getParents,
    visitEdge: visitEdge,
  });
  expect(Object.fromEntries([...edgeMap])).toEqual({
    [['node1', 'node4']]: ['node4', 'node1', null],
    [['node1', 'node5']]: ['node5', 'node1', null],
    [['node2', 'node3']]: ['node3', 'node2', null],
    [['node3', 'node4']]: ['node4', 'node3', null],
    [['node4', 'node5']]: ['node5', 'node4', null],
  });
});
