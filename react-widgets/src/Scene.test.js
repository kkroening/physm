import Scene from './Scene';

describe('Scene', () => {
  test('constructor', () => {
    const scene = new Scene();
    expect(scene.decals).toEqual([]);
    
  });
});
