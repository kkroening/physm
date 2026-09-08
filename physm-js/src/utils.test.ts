import { MissingArgumentError, generateRandomId, required } from './utils';

describe('utils', () => {
  test('required throws rather than returning a sentinel', () => {
    expect(() => required('thing')).toThrow(MissingArgumentError);
    expect(() => required('thing')).toThrow(/thing/);
  });

  test('generateRandomId produces distinct non-empty ids', () => {
    const ids = new Set(Array.from({ length: 500 }, () => generateRandomId()));

    expect(ids.size).toBe(500);
    expect([...ids].every((id) => id.length > 0)).toBe(true);
  });
});
