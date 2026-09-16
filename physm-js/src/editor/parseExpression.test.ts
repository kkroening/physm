import parseExpression from './parseExpression';
import { evaluate } from './../expression';
import { literalOf, parameterOf, shownValueOf } from './propValue';
import type { PropValue } from './propValue';

/** What the text parses to, or a throw carrying the refusal it gave instead. */
function nodeOf(text: string): PropValue {
  const parsed = parseExpression(text);
  if ('refusal' in parsed) {
    throw new Error(parsed.refusal);
  }

  return parsed.node;
}

/**
 * How the parsed text reads back, through the printer the pane actually runs.
 *
 * `shownValueOf` rather than a configuration of `expressionSource` assembled
 * here: the two agree on finite numbers and diverge on exactly the values
 * `describe` exists to handle, so a printer built for the test would verify a
 * configuration that ships nowhere.
 */
function sourceOf(text: string): string {
  return shownValueOf(nodeOf(text))!;
}

/** The refusal the text gives, or a throw saying it was accepted. */
function refusalOf(text: string): string {
  const parsed = parseExpression(text);
  if (!('refusal' in parsed)) {
    throw new Error(`'${text}' was accepted.`);
  }

  return parsed.refusal;
}

describe('what a person types into a prop box', () => {
  test('text that says a plain value stays one', () => {
    // Storing `4` as an operation over itself would make every prop an
    // expression, and draw a one-node graph beneath each of them.
    expect(nodeOf('4')).toEqual(literalOf(4));
    expect(nodeOf(' 1.5e2 ')).toEqual(literalOf(150));
    expect(nodeOf('halfLength')).toEqual(parameterOf('halfLength'));

    // A minus sign on a number is part of the number, for the same reason.
    expect(nodeOf('-1.5')).toEqual(literalOf(-1.5));
    expect(nodeOf('-halfLength')).toEqual({
      kind: 'operation',
      op: 'neg',
      operands: [parameterOf('halfLength')],
    });
  });

  test.each([
    ['halfLength * 2', 'mul(halfLength, 2)'],
    ['1 + 2 + 3', 'add(add(1, 2), 3)'],
    ['1 - 2 - 3', 'sub(sub(1, 2), 3)'],
    ['1 + 2 * 3', 'add(1, mul(2, 3))'],
    ['(1 + 2) * 3', 'mul(add(1, 2), 3)'],
    ['1 / 2 / 4', 'div(div(1, 2), 4)'],
    ['-x * 2', 'mul(neg(x), 2)'],
    ['sqrt(9)', 'sqrt(9)'],
    ['vec(x, y * 2)', 'vec(x, mul(y, 2))'],
    ['dot(vec(1, 2), vec(3, 4))', 'dot(vec(1, 2), vec(3, 4))'],
  ])('%s', (typed, source) => {
    expect(sourceOf(typed)).toBe(source);

    // And printing is the parser's inverse, which idempotence is the cheap
    // statement of: what comes out has to go back in and come out the same.
    expect(sourceOf(source)).toBe(source);
  });

  test('what it parses to is what it computes', () => {
    // The surface and the storage have to agree about arithmetic, or the
    // picture and the number would disagree.
    expect(evaluate(nodeOf('1 + 2 * 3'))).toBe(7);
    expect(evaluate(nodeOf('(1 + 2) * 3'))).toBe(9);
    expect(evaluate(nodeOf('10 - 2 - 3'))).toBe(5);
    expect(evaluate(nodeOf('sqrt(3 * 3 + 4 * 4)'))).toBe(5);
    expect(evaluate(nodeOf('-(2 + 3)'))).toBe(-5);
  });

  test.each([
    ['', 'An expression needs something in it.'],
    ['  ', 'An expression needs something in it.'],
    ['2 +', 'Expected a value, and the expression ended.'],
    ['2 + * 3', "Expected a value at character 5, and found '*'."],
    ['(2 + 3', "Expected ')', and the expression ended."],
    ['2 3', "'3' at character 3 has nothing to join to."],
    ['2 @ 3', "'@' has no meaning in an expression."],
    ['lerp(1, 2)', 'There is no operation called lerp.'],
    ['sqrt(1, 2)', 'sqrt takes 1 operand, and was given 2.'],
    ['vec(1)', 'vec takes 2 operands, and was given 1.'],
    ['vec()', 'vec takes 2 operands, and was given 0.'],
    ['1e999 * 2', '1e999 is too large to be a number.'],
    ['(2 + 3 4', "Expected ')' at character 8, and found '4'."],
  ])('%s is refused', (typed, refusal) => {
    expect(refusalOf(typed)).toBe(refusal);
  });

  test('a half-typed expression is refused rather than thrown at', () => {
    // It runs on every keystroke, so every prefix of something valid has to
    // come back as a sentence rather than an exception.
    const typing = 'sqrt(x * 2 + 1)';
    for (let upto = 1; upto <= typing.length; upto += 1) {
      expect(() => parseExpression(typing.slice(0, upto))).not.toThrow();
    }
  });

  test('an arity is the one the operation will be evaluated against', () => {
    // Checked against the implementation's own parameter count, so the parser
    // cannot accept what evaluation would refuse.
    expect(refusalOf('mul(1)')).toMatch(/mul takes 2 operands/);
    expect(() => evaluate(nodeOf('mul(1, 2)'))).not.toThrow();
  });
});
