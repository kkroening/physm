import { operationNamed, operationOf } from './../expression';
import { literalOf, parameterOf } from './propValue';
import type { Operation } from './../expression';
import type { PropValue } from './propValue';

/**
 * What a person types into a prop box, as the node set stores it.
 *
 * [0016's expressions design](../../../docs/issues/0016/04-expressions.md)
 * keeps the two apart on purpose: "someone typing into a prop box still writes
 * `halfLength * 2` ... The editor parses it to the same graph either way; only
 * the *printed* form is the constructor." So infix is the surface and calls
 * are the storage, and this is the one direction that has to exist -- the
 * other is `expressionSource`.
 *
 * That sentence goes on to offer `sqrt(x**2 + y**2)`, which this grammar
 * refuses: there is no `**` token and no `pow` among the operations, and
 * whether the language should have either is `docs/issues/0025.md`.
 *
 * **A refusal rather than a throw**, because this runs on every keystroke in a
 * field that has to keep working while the text is half-typed. It reads like
 * the length field's: a sentence saying what was wrong and where, which the
 * field shows beside itself.
 */

/** What a name is: the same shape a parameter is declared under. */
const NAME = /^[A-Za-z_$][A-Za-z0-9_$]*/;

/** A number, including a decimal point and an exponent. */
const NUMBER = /^\d+(\.\d+)?([eE][+-]?\d+)?/;

/** Either a node, or why the text could not become one. */
export type Parsed = { node: PropValue } | { refusal: string };

/**
 * What the parser works in: an operand, which is a plain value or a node.
 *
 * Plain, not wrapped. An operation's operands are whatever was handed to the
 * constructor, so `mul(x, 2)` holds the number two -- and a parser that
 * wrapped it would store a shape no constructor produces, which `evaluate`
 * refuses and the emitter writes out as an object literal. The wrapping
 * happens once, at the end, and only when the whole text is a value.
 */
type Held = { operand: unknown } | { refusal: string };

/** One token of the text: a number, a name, or a piece of punctuation. */
interface Token {
  readonly text: string;
  readonly at: number;
  readonly kind: 'number' | 'name' | 'punctuation';
}

/** The tokens of `text`, or the first character that cannot start one. */
function tokensOf(text: string): Token[] | { refusal: string } {
  const tokens: Token[] = [];
  let at = 0;
  while (at < text.length) {
    const rest = text.slice(at);
    const space = /^\s+/.exec(rest);
    if (space) {
      at += space[0].length;
      continue;
    }

    const number = NUMBER.exec(rest);
    const name = NAME.exec(rest);
    const found = number ?? name;
    if (found) {
      tokens.push({
        text: found[0],
        at,
        kind: number ? 'number' : 'name',
      });
      at += found[0].length;
      continue;
    }

    if (!'+-*/(),'.includes(rest[0]!)) {
      return { refusal: `'${rest[0]}' has no meaning in an expression.` };
    }

    tokens.push({ text: rest[0]!, at, kind: 'punctuation' });
    at += 1;
  }

  return tokens;
}

/** Which operation an infix symbol builds. */
const INFIX: Record<string, Operation> = {
  '+': 'add',
  '-': 'sub',
  '*': 'mul',
  '/': 'div',
};

/**
 * The text as a node, or a sentence saying why not.
 *
 * Text that says a plain value comes back as one: `4` is a literal and
 * `halfLength` is a reference, because neither is a computation and storing
 * one as an operation over itself would make every prop an expression. That is
 * the same rule the emitter follows in reverse -- "literals stay literals".
 */
export default function parseExpression(text: string): Parsed {
  const tokens = tokensOf(text);
  if ('refusal' in tokens) {
    return tokens;
  }

  if (!tokens.length) {
    return { refusal: 'An expression needs something in it.' };
  }

  let at = 0;
  const peek = (): Token | undefined => tokens[at];
  const take = (): Token | undefined => tokens[at++];

  /** A refusal naming what was found where, or what was missing at the end. */
  const unexpected = (wanted: string): { refusal: string } => {
    const token = peek();

    // With the position, because a refusal that cannot be located in a long
    // expression is half a sentence -- and the character is what a person
    // counts, so it is one-based.
    return {
      refusal: token
        ? `Expected ${wanted} at character ${token.at + 1}, and found ` +
          `'${token.text}'.`
        : `Expected ${wanted}, and the expression ended.`,
    };
  };

  const expression = (): Held => {
    let left = term();
    for (;;) {
      const token = peek();
      if (!token || (token.text !== '+' && token.text !== '-')) {
        return left;
      }

      if ('refusal' in left) {
        return left;
      }

      take();
      const right = term();
      if ('refusal' in right) {
        return right;
      }

      left = {
        operand: operationOf(INFIX[token.text]!, [left.operand, right.operand]),
      };
    }
  };

  const term = (): Held => {
    let left = unary();
    for (;;) {
      const token = peek();
      if (!token || (token.text !== '*' && token.text !== '/')) {
        return left;
      }

      if ('refusal' in left) {
        return left;
      }

      take();
      const right = unary();
      if ('refusal' in right) {
        return right;
      }

      left = {
        operand: operationOf(INFIX[token.text]!, [left.operand, right.operand]),
      };
    }
  };

  const unary = (): Held => {
    if (peek()?.text !== '-') {
      return primary();
    }

    take();
    const held = unary();
    if ('refusal' in held) {
      return held;
    }

    // A minus sign on a number is part of the number, not a computation over
    // it: someone typing `-1` has written a value, and storing `neg(1)` would
    // make the prop an expression and draw it as a graph.
    return {
      operand:
        typeof held.operand === 'number'
          ? -held.operand
          : operationOf('neg', [held.operand]),
    };
  };

  const primary = (): Held => {
    const token = take();
    if (!token) {
      return unexpected('a value');
    }

    if (token.kind === 'number') {
      const value = Number(token.text);

      // `parseNumber` guards this on the value path, so without it the two
      // commit paths of one field would disagree about whether a number has
      // to be finite -- and the one reaching the document is this one.
      return Number.isFinite(value)
        ? { operand: value }
        : { refusal: `${token.text} is too large to be a number.` };
    }

    if (token.text === '(') {
      const held = expression();
      if ('refusal' in held) {
        return held;
      }

      if (peek()?.text !== ')') {
        return unexpected("')'");
      }

      take();

      return held;
    }

    if (token.kind !== 'name') {
      return {
        refusal:
          `Expected a value at character ${token.at + 1}, and found ` +
          `'${token.text}'.`,
      };
    }

    if (peek()?.text !== '(') {
      return { operand: parameterOf(token.text) };
    }

    const operation = operationNamed(token.text);
    if (!operation) {
      return { refusal: `There is no operation called ${token.text}.` };
    }

    // No property admits a signal yet, so the refusal is unconditional. Once a
    // `PropSpec` says which kind it takes, this narrows to the ones that say
    // structural -- and it stays *here*, at the point of typing, rather than
    // becoming a scene that fails to build.
    if (operation.signal) {
      return {
        refusal:
          `${token.text} cannot go in a property: it reads where the scene ` +
          'has got to, and a property is worked out when the scene is built ' +
          'rather than while it runs.',
      };
    }

    take();
    const operands: unknown[] = [];
    if (peek()?.text !== ')') {
      for (;;) {
        const held = expression();
        if ('refusal' in held) {
          return held;
        }

        operands.push(held.operand);
        if (peek()?.text !== ',') {
          break;
        }

        take();
      }
    }

    if (peek()?.text !== ')') {
      return unexpected("')'");
    }

    take();

    return operands.length === operation.arity
      ? { operand: operationOf(token.text as Operation, operands) }
      : {
          refusal:
            `${token.text} takes ${operation.arity} ` +
            `${operation.arity === 1 ? 'operand' : 'operands'}, and was given ` +
            `${operands.length}.`,
        };
  };

  const parsed = expression();
  if ('refusal' in parsed) {
    return parsed;
  }

  if (at !== tokens.length) {
    return {
      refusal:
        `'${tokens[at]!.text}' at character ${tokens[at]!.at + 1} has nothing ` +
        'to join to.',
    };
  }

  // Only here does an operand become a prop value: a bare number is a literal
  // and everything else already is one.
  const { operand } = parsed;

  return {
    node:
      typeof operand === 'number' ? literalOf(operand) : (operand as PropValue),
  };
}
