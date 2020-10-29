import Weight from './Weight';
import { areTensorsEqual } from './testutils';
import { checkTfMemory } from './testutils';
import { ZERO_POS } from './utils';

describe('Weight class', () => {
  test('constructor', () => {
    const weight = checkTfMemory(() => new Weight());
    expect(weight.mass == 1);
    expect(areTensorsEqual(weight.position, ZERO_POS));
    expect(weight.drag == 0);
  });

  test('.dispose method', () => {
    checkTfMemory(() => {
      new Weight().dispose();
    });
  });
});
