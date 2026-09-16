import { Fragment, useId, useRef, useState } from 'react';
import { isOperation } from './../expression';
import { literalOf, shownValueOf } from './propValue';
import {
  definitionOf,
  demoteProp,
  demotionRefusal,
  nodeAt,
  nodeName,
  promoteProp,
  promotionRefusal,
  parameterAt,
  parameterNameRefusal,
  renameParameter,
  retypeParameter,
  setParameterDefault,
  setProp,
} from './sceneDocument';
import type {
  DocNode,
  NodePath,
  Parameter,
  SceneDocument,
} from './sceneDocument';
import type { PropSpec } from './../react/componentMeta';
import type { ReactElement } from 'react';

/**
 * What the editor has selected: a node in a definition's body, or one of the
 * parameters the definition declares.
 *
 * A tag rather than an optional `path`, so that every site deciding what to do
 * with a selection is named by the compiler -- most of them act on a node and
 * have no answer for a parameter, and the right answer differs between them.
 */
export type Selection = NodeSelection | ParameterSelection;

/** A node as the editor selects it: which definition, and where in its body. */
export interface NodeSelection {
  readonly kind: 'node';
  readonly definition: string;
  readonly path: NodePath;
}

/**
 * A parameter as the editor selects it: which definition, and where in its
 * declaration block.
 *
 * By position, like a `NodePath` and for the same reason: a rename is an edit
 * the person is in the middle of, and an address that moved under them while
 * they typed would be worse than one a reorder invalidates.
 */
interface ParameterSelection {
  readonly kind: 'parameter';
  readonly definition: string;
  readonly at: number;
}

/** Degrees per radian. An angle is held in radians and shown in degrees. */
const DEGREES = 180 / Math.PI;

/** A number as a field shows it, without a unit conversion's float noise. */
function formatNumber(value: number): string {
  return String(Number(value.toPrecision(12)));
}

/** A field's text as a number, or `null` while it is not one yet: `-`, `1e`. */
function parseNumber(text: string): number | null {
  const parsed = Number(text);

  return text.trim() !== '' && Number.isFinite(parsed) ? parsed : null;
}

/** What an empty field says when there is no default to show. */
function absenceOf(spec: PropSpec): string {
  return spec.required ? 'required' : 'unset';
}

/**
 * Apply a field's text to its prop, and say whether the text was taken.
 *
 * Empty removes the prop, back to its default -- unless the component cannot be
 * built without it. Anything else has to parse.
 */
function commitText(
  spec: PropSpec,
  text: string,
  parse: (text: string) => unknown,
  onChange: (value: unknown) => void,
): boolean {
  if (text.trim() === '') {
    if (!spec.required) {
      onChange(undefined);
    }

    return !spec.required;
  }

  const value = parse(text);
  if (value === undefined) {
    return false;
  }

  onChange(value);
  return true;
}

interface DraftInputProps {
  readonly shown: string;
  readonly commit: (text: string) => boolean;
  readonly placeholder: string;
  readonly id?: string | undefined;
  readonly 'aria-label'?: string | undefined;
  readonly inputMode?: 'decimal' | undefined;
  readonly list?: string | undefined;
}

/**
 * A text input that commits every keystroke that parses.
 *
 * It keeps what was typed while it has focus, so `-` and `1.` last long enough
 * to become `-2` and `1.5`, and shows the prop's value again once focus leaves
 * -- which is also when a value set from elsewhere appears. Text `commit`
 * refuses marks the field invalid until then.
 */
function DraftInput({
  shown,
  commit,
  ...attributes
}: DraftInputProps): ReactElement {
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);

  return (
    <input
      type="text"
      {...attributes}
      value={draft ?? shown}
      aria-invalid={invalid || undefined}
      onChange={(event) => {
        setDraft(event.target.value);
        setInvalid(!commit(event.target.value));
      }}
      onBlur={() => {
        setDraft(null);
        setInvalid(false);
      }}
    />
  );
}

interface FieldProps {
  readonly spec: PropSpec;
  readonly value: unknown;
  readonly onChange: (value: unknown) => void;
}

/** One number, shown in its kind's units: an angle in degrees. */
function NumberInput({
  id,
  spec,
  value,
  onChange,
}: FieldProps & { readonly id: string }): ReactElement {
  const scale = spec.kind === 'angle' ? DEGREES : 1;
  const parse = (text: string): number | undefined => {
    const parsed = parseNumber(text);

    return parsed === null || (spec.kind === 'length' && parsed < 0)
      ? undefined
      : parsed / scale;
  };

  return (
    <DraftInput
      id={id}
      inputMode="decimal"
      shown={typeof value === 'number' ? formatNumber(value * scale) : ''}
      placeholder={
        typeof spec.default === 'number'
          ? formatNumber(spec.default * scale)
          : absenceOf(spec)
      }
      commit={(text) => commitText(spec, text, parse, onChange)}
    />
  );
}

/**
 * A point or a state as the core reads it: a bare number is `[n, 0]`, and a
 * short array is filled out with zeros.
 */
function pairOf(value: unknown): readonly number[] | undefined {
  if (typeof value === 'number') {
    return [value, 0];
  }

  return Array.isArray(value)
    ? [Number(value[0] ?? 0), Number(value[1] ?? 0)]
    : undefined;
}

/**
 * `[x, y]` or `[q, q̇]`: two numbers, set together.
 *
 * Emptying one half is refused rather than read as removing the prop, which the
 * reset button does for both halves at once.
 */
function PairInputs({ spec, value, onChange }: FieldProps): ReactElement {
  const axes = spec.kind === 'point' ? ['x', 'y'] : ['value', 'rate'];

  // A rotational frame's state is an angle and its rate: both in degrees.
  const scale =
    spec.kind === 'state' && spec.coordinate === 'angle' ? DEGREES : 1;
  const pair = pairOf(value);
  const fallback = pairOf(spec.default);

  return (
    <>
      {axes.map((axis, index) => (
        <Fragment key={axis}>
          <DraftInput
            aria-label={`${spec.label} ${axis}`}
            inputMode="decimal"
            shown={pair ? formatNumber(pair[index]! * scale) : ''}
            placeholder={
              fallback
                ? formatNumber(fallback[index]! * scale)
                : absenceOf(spec)
            }
            commit={(text) => {
              const parsed = parseNumber(text);
              if (parsed === null) {
                return false;
              }

              const next = [...(pair ?? fallback ?? [0, 0])];
              next[index] = parsed / scale;
              onChange(next);
              return true;
            }}
          />
          {scale === DEGREES ? (
            <span className="editor__unit">{index === 0 ? '°' : '°/s'}</span>
          ) : null}
        </Fragment>
      ))}
    </>
  );
}

/** A colour, or a name -- text, taken as typed. */
function TextInput({
  id,
  list,
  spec,
  value,
  onChange,
}: FieldProps & {
  readonly id: string;
  readonly list?: string | undefined;
}): ReactElement {
  return (
    <DraftInput
      id={id}
      list={list}
      shown={typeof value === 'string' ? value : ''}
      placeholder={
        typeof spec.default === 'string' ? spec.default : absenceOf(spec)
      }
      commit={(text) => commitText(spec, text, (typed) => typed, onChange)}
    />
  );
}

/** One prop: its label, the inputs its kind calls for, and a way back. */
function PropField({
  spec,
  value,
  names,
  extra,
  onChange,
}: Omit<FieldProps, 'onChange'> & {
  readonly names: readonly string[];

  /** A control of the field's own, beside the reset: see `Carry`. */
  readonly extra?: ReactElement;

  /** A new value -- `discrete` for a click, which is a step of its own to undo. */
  readonly onChange: (value: unknown, discrete?: boolean) => void;
}): ReactElement {
  const id = useId();
  const reset =
    value !== undefined && !spec.required ? (
      <button
        type="button"
        className="editor__reset"
        aria-label={`Reset ${spec.label}`}
        title={spec.default === undefined ? 'Unset' : 'Reset to default'}
        onClick={() => onChange(undefined, true)}
      >
        ×
      </button>
    ) : null;
  const labelled = (input: ReactElement, unit?: string): ReactElement => (
    <div className="editor__field">
      <label className="editor__label" htmlFor={id}>
        {spec.label}
      </label>
      <div className="editor__inputs">
        {input}
        {unit ? <span className="editor__unit">{unit}</span> : null}
        {reset}
        {extra}
      </div>
    </div>
  );

  switch (spec.kind) {
    case 'flag':
      return (
        <div className="editor__field editor__inputs">
          <label className="editor__check">
            <input
              type="checkbox"
              checked={Boolean(value ?? spec.default)}
              onChange={(event) => onChange(event.target.checked, true)}
            />
            {spec.label}
          </label>
          {reset}
          {extra}
        </div>
      );
    case 'point':
    case 'state':
      return (
        <fieldset className="editor__field">
          <legend className="editor__label">{spec.label}</legend>
          <div className="editor__inputs">
            <PairInputs spec={spec} value={value} onChange={onChange} />
            {reset}
            {extra}
          </div>
        </fieldset>
      );
    case 'number':
    case 'length':
      return labelled(
        <NumberInput id={id} spec={spec} value={value} onChange={onChange} />,
      );
    case 'angle':
      return labelled(
        <NumberInput id={id} spec={spec} value={value} onChange={onChange} />,
        '°',
      );
    case 'color':
    case 'name':
      return labelled(
        <TextInput id={id} spec={spec} value={value} onChange={onChange} />,
      );
    case 'end':
      // Offered, not enforced: an end naming nothing yet is an ordinary state
      // of a rig being written, and the scene pane says so.
      return (
        <>
          {labelled(
            <TextInput
              id={id}
              list={`${id}-names`}
              spec={spec}
              value={value}
              onChange={onChange}
            />,
          )}
          <datalist id={`${id}-names`}>
            {names.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </>
      );
  }
}

/** Every id in these nodes and their children: what a constraint end can name. */
function idsIn(nodes: readonly DocNode[]): string[] {
  return nodes.flatMap(({ props, children }) => [
    ...(props.id?.kind === 'literal' && typeof props.id.value === 'string'
      ? [props.id.value]
      : []),
    ...idsIn(children),
  ]);
}

/** The selected node's props as fields, or why it has none to edit. */
function NodeProps({
  doc,
  selection,
  node,
  visit,
  onChange,
  onOpen,
}: {
  doc: SceneDocument;
  selection: NodeSelection;
  node: DocNode;

  /** How many times the focus has come into the pane: see `PropertiesPane`. */
  visit: { readonly current: number };
  onChange: (doc: SceneDocument, field: string | null) => void;
  onOpen: (name: string) => void;
}): ReactElement {
  // Anchor and frame ids are scene-wide, so every definition's count.
  const names = [
    ...new Set(doc.definitions.flatMap(({ body }) => idsIn(body))),
  ];

  if (node.type.kind === 'defined') {
    const { name } = node.type;
    const { parameters = [] } = definitionOf(doc, name);

    return (
      <>
        <h2 className="editor__selected">{nodeName(node.type)}</h2>
        <p className="editor__hint">
          {parameters.length
            ? `Defined in this scene. What it takes is declared in ${name}.`
            : 'Defined in this scene. It takes no props.'}
        </p>
        {/* An instance's props are the parameters the definition declares, so
            they are edited with the same fields a building block's are --
            which is what a declared surface buys. */}
        <div className="editor__fields">
          {parameters.map((parameter) => {
            const held = node.props[parameter.name];

            // The same split a building block's props get, and for the same
            // reason: a prop holding a reference is not a literal to edit, and
            // the literal editor would let a keystroke replace it. An
            // instance reaches that state through an extraction, which passes
            // the enclosing definition's parameter straight through.
            if (isOperation(held)) {
              return (
                <div className="editor__field" key={parameter.name}>
                  <span className="editor__label">{parameter.name}</span>
                  <span className="editor__reference">
                    {shownValueOf(held)}
                  </span>
                </div>
              );
            }

            return held?.kind === 'parameter' ? (
              <div className="editor__field" key={parameter.name}>
                <span className="editor__label">{parameter.name}</span>
                <div className="editor__inputs">
                  <span className="editor__reference">{held.name}</span>
                  <Carry
                    label={`Replace ${parameter.name} with its value`}
                    glyph="⤵"
                    refusal={demotionRefusal(
                      doc,
                      selection.definition,
                      selection.path,
                      parameter.name,
                    )}
                    onCarry={() =>
                      onChange(
                        demoteProp(
                          doc,
                          selection.definition,
                          selection.path,
                          parameter.name,
                        ),
                        null,
                      )
                    }
                  />
                </div>
              </div>
            ) : (
              <PropField
                key={parameter.name}
                spec={specFor(parameter)}
                value={held?.value}
                names={names}
                onChange={(value, discrete) =>
                  onChange(
                    setProp(
                      doc,
                      selection.definition,
                      selection.path,
                      parameter.name,
                      value === undefined ? undefined : literalOf(value),
                    ),
                    discrete
                      ? null
                      : `${selection.definition}/${selection.path.join('.')}/${parameter.name}#${visit.current}`,
                  )
                }
              />
            );
          })}
        </div>
        <button
          type="button"
          className="editor__open"
          onClick={() => onOpen(name)}
        >
          Open {name}
        </button>
      </>
    );
  }

  if (node.type.kind === 'children') {
    return (
      <>
        <h2 className="editor__selected">{nodeName(node.type)}</h2>
        <p className="editor__hint">
          The children an instance of {selection.definition} is given go here:
          at the origin of the frame this sits in, at the top of the body with
          the instance, or -- among an instance's children -- wherever that
          instance puts its own.
        </p>
      </>
    );
  }

  if (node.type.kind === 'imported') {
    return (
      <>
        <h2 className="editor__selected">{nodeName(node.type)}</h2>
        <p className="editor__hint">
          Imported from its own module, which does not describe its props -- so
          they are shown here, but not edited.
        </p>
        <dl className="editor__readonly">
          {Object.entries(node.props).map(([name, prop]) => (
            <Fragment key={name}>
              <dt>{name}</dt>
              <dd>{shownValueOf(prop)}</dd>
            </Fragment>
          ))}
        </dl>
      </>
    );
  }

  const { meta } = node.type.component;

  return (
    <>
      <h2 className="editor__selected">{nodeName(node.type)}</h2>
      <p className="editor__hint">{meta.description}</p>
      <div className="editor__fields">
        {Object.entries(meta.props).map(([name, spec]) => {
          const held = node.props[name];

          // A prop holding a reference is not a literal to edit, and offering
          // the literal editor would let a keystroke silently replace the
          // reference with whatever was typed. Shown, not edited -- which is
          // the same posture as an imported component's props above.
          // Computed, so neither a literal to edit nor a name to carry
          // back. Shown as the call that built it, which is what the
          // emitted module writes and what a prop box will one day parse.
          if (isOperation(held)) {
            return (
              <div className="editor__field" key={name}>
                <span className="editor__label">{spec.label}</span>
                <span className="editor__reference">{shownValueOf(held)}</span>
              </div>
            );
          }

          return held?.kind === 'parameter' ? (
            <div className="editor__field" key={name}>
              <span className="editor__label">{spec.label}</span>
              <div className="editor__inputs">
                <span className="editor__reference">{held.name}</span>
                <Carry
                  label={`Replace ${spec.label} with its value`}
                  glyph="⤵"
                  refusal={demotionRefusal(
                    doc,
                    selection.definition,
                    selection.path,
                    name,
                  )}
                  onCarry={() =>
                    onChange(
                      demoteProp(
                        doc,
                        selection.definition,
                        selection.path,
                        name,
                      ),
                      null,
                    )
                  }
                />
              </div>
            </div>
          ) : (
            <PropField
              key={name}
              spec={spec}
              value={held?.value}
              names={names}
              extra={
                <Carry
                  label={`Promote ${spec.label} to a prop`}
                  glyph="⤴"
                  refusal={promotionRefusal(
                    doc,
                    selection.definition,
                    selection.path,
                    name,
                  )}
                  onCarry={() =>
                    onChange(
                      promoteProp(
                        doc,
                        selection.definition,
                        selection.path,
                        name,
                      ),
                      null,
                    )
                  }
                />
              }
              onChange={(value, discrete) =>
                onChange(
                  setProp(
                    doc,
                    selection.definition,
                    selection.path,
                    name,
                    value === undefined ? undefined : literalOf(value),
                  ),
                  discrete
                    ? null
                    : `${selection.definition}/${selection.path.join('.')}/${name}#${visit.current}`,
                )
              }
            />
          );
        })}
      </div>
    </>
  );
}

/**
 * What a parameter of each type is edited with.
 *
 * The editor's prop kinds are coarser than the parameter types -- `scalar` and
 * `integer` are both a number field, because nothing here has an integer
 * widget, and a `label` borrows the id field with no ids to complete against.
 * Where the two sets diverge is where a widget is owed rather than where the
 * types are wrong.
 */
const PARAMETER_KINDS: Record<Parameter['type'], PropSpec['kind']> = {
  scalar: 'number',
  integer: 'number',
  angle: 'angle',
  point: 'point',
  label: 'name',
};

/** Each parameter type as a person picks it, in the order offered. */
const PARAMETER_TYPES: readonly (readonly [Parameter['type'], string])[] = [
  ['scalar', 'Scalar'],
  ['integer', 'Integer'],
  ['angle', 'Angle'],
  ['point', 'Point'],
  ['label', 'Label'],
];

/**
 * A declared parameter: its name, its type, and what an instance that leaves
 * it out gets.
 *
 * The name is the one field here that is not a value. Renaming rewrites every
 * prop in the body that refers to it, so it is committed only once it is a
 * name the definition can take, and the field says why when it is not -- the
 * same posture as a prop field whose text does not parse yet.
 */
function ParameterProps({
  doc,
  selection,
  visit,
  onChange,
}: {
  doc: SceneDocument;
  selection: ParameterSelection;
  visit: { current: number };
  onChange: (doc: SceneDocument, field: string | null) => void;
}): ReactElement {
  const { definition, at } = selection;
  const parameter = parameterAt(doc, definition, at);
  const nameId = useId();
  const typeId = useId();
  const refusalId = useId();

  // The text while it is not yet a name: `null` whenever the field shows what
  // the document holds, which is also what a fresh selection starts at.
  const [typed, setTyped] = useState<string | null>(null);
  const shown = typed ?? parameter.name;
  const refusal =
    typed === null ? null : parameterNameRefusal(doc, definition, at, typed);
  const field = (what: string): string =>
    `${definition}/parameter.${at}/${what}#${visit.current}`;

  return (
    <>
      <h2 className="editor__selected">{parameter.name}</h2>
      <p className="editor__hint">
        A value an instance of {definition} passes.
      </p>
      <div className="editor__fields">
        <div className="editor__field">
          <label className="editor__label" htmlFor={nameId}>
            Name
          </label>
          <div className="editor__inputs">
            <input
              id={nameId}
              type="text"
              value={shown}
              aria-invalid={refusal ? true : undefined}
              aria-describedby={refusal ? refusalId : undefined}
              title={refusal ?? undefined}
              onChange={(event) => {
                const next = event.target.value;
                if (parameterNameRefusal(doc, definition, at, next)) {
                  setTyped(next);
                  return;
                }

                setTyped(null);
                onChange(
                  renameParameter(doc, definition, at, next),
                  field('name'),
                );
              }}
            />
          </div>
          {/* Why the name will not do, where it is read rather than hovered:
              a prop field's refusal is visible in the value, and a name's is
              not -- `Array` is refused for a reason nothing else on screen
              states. `ExtractForm` says it the same way, about the same
              field. */}
          {refusal ? (
            <p id={refusalId} className="editor__hint" role="status">
              {refusal}
            </p>
          ) : null}
        </div>
        <div className="editor__field">
          <label className="editor__label" htmlFor={typeId}>
            Type
          </label>
          <div className="editor__inputs">
            <select
              id={typeId}
              value={parameter.type}
              onChange={(event) =>
                onChange(
                  retypeParameter(
                    doc,
                    definition,
                    at,
                    event.target.value as Parameter['type'],
                  ),
                  null,
                )
              }
            >
              {PARAMETER_TYPES.map(([type, label]) => (
                <option key={type} value={type}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <PropField
          // Fresh fields per type, so a point's pair is not left showing what
          // a scalar's one field had in it.
          key={parameter.type}
          spec={{ kind: PARAMETER_KINDS[parameter.type], label: 'Default' }}
          value={parameter.default}
          names={[]}
          onChange={(value, discrete) =>
            onChange(
              setParameterDefault(doc, definition, at, value),
              discrete ? null : field('default'),
            )
          }
        />
      </div>
    </>
  );
}

/**
 * Carry a prop between a value written here and a parameter of the definition
 * this node sits in.
 *
 * Both directions are one button with two labels, because they are one
 * gesture seen from either end: promoting moves the value into the
 * declaration block and leaves a reference, demoting puts the parameter's
 * default back and leaves the declaration. Disabled rather than hidden, with
 * the reason in its title -- a prop that cannot be promoted is a fact about
 * the prop, and hiding the control says nothing.
 */
function Carry({
  label,
  glyph,
  refusal,
  onCarry,
}: {
  label: string;
  glyph: string;
  refusal: string | null;
  onCarry: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      className="editor__carry"
      aria-label={label}
      title={refusal ?? label}
      disabled={refusal !== null}
      onClick={onCarry}
    >
      {glyph}
    </button>
  );
}

/**
 * A declared parameter as a field: what an instance passing one is editing.
 *
 * The label is the parameter's own name rather than a prose one, because the
 * person who declared it chose that name and it is what the emitted source
 * writes.
 */
function specFor(parameter: Parameter): PropSpec {
  return {
    kind: PARAMETER_KINDS[parameter.type],
    label: parameter.name,
    ...(parameter.default === undefined ? {} : { default: parameter.default }),
  };
}

/** The selected node, or `null` once an edit has left the selection empty. */
function selectedNode(
  doc: SceneDocument,
  selection: NodeSelection,
): DocNode | null {
  try {
    return nodeAt(doc, selection.definition, selection.path);
  } catch {
    return null;
  }
}

/**
 * A node another body wrote, reached by inspecting what it built in the scene.
 *
 * Read-only: the node lives in a component, where one node stands behind every
 * instance of it, so editing here would change every instance at once and in a
 * tab that does not show it. The two ways on are the node here that produced
 * it, and the component's own tab.
 */
function ExpandedProps({
  selection,
  node,
  producer,
  onProduce,
  onOpen,
}: {
  selection: NodeSelection;
  node: DocNode;
  producer: NodePath | null;
  onProduce: (path: NodePath) => void;
  onOpen: (name: string) => void;
}): ReactElement {
  const { definition } = selection;

  return (
    <>
      <h2 className="editor__selected">{nodeName(node.type)}</h2>
      <p className="editor__hint">
        Written in {definition}, which this tab does not edit. Its props are
        shown as that component writes them.
      </p>
      <dl className="editor__readonly">
        {Object.entries(node.props).map(([name, prop]) => (
          <Fragment key={name}>
            <dt>{name}</dt>
            <dd>{shownValueOf(prop)}</dd>
          </Fragment>
        ))}
      </dl>
      {producer ? (
        <button
          type="button"
          className="editor__open"
          onClick={() => onProduce(producer)}
        >
          Select what produced it
        </button>
      ) : null}
      <button
        type="button"
        className="editor__open"
        onClick={() => onOpen(definition)}
      >
        Open {definition}
      </button>
    </>
  );
}

/**
 * The selected node: its props edited in place, or -- for a node another body
 * wrote -- shown as that body writes them.
 *
 * Every accepted keystroke is a new document, so the tree, scene and code
 * follow as it is typed. Which widget a prop gets comes from its component's
 * metadata -- a `length` refuses a negative, an `angle` is shown in degrees --
 * never from the value it happens to hold.
 */
export default function PropertiesPane({
  doc,
  focus,
  selection,
  producer,
  onChange,
  onProduce,
  onOpen,
}: {
  doc: SceneDocument;

  /** The body being edited: a selection outside it is shown, not edited. */
  focus: string;
  selection: Selection | null;

  /** The node here that produced the selection: see `Editor`. */
  producer: NodePath | null;

  /**
   * A new document, and the field that made it: see `recorded` in `history`.
   * `null` for a click, which is a step of its own; a typed field is named for
   * one visit to it, so a run of keystrokes there is one step and the next
   * visit starts another.
   */
  onChange: (doc: SceneDocument, field: string | null) => void;

  /** Select a node in the focused body, which the scene never picked. */
  onProduce: (path: NodePath) => void;

  /** Open a component this document defines, in its own tab. */
  onOpen: (name: string) => void;
}): ReactElement {
  const node = selection?.kind === 'node' ? selectedNode(doc, selection) : null;

  // Counts every time the focus comes into the pane, which names each visit
  // to a field. Kept here rather than in a field, so it goes on counting when
  // a node is selected again and its fields are made afresh.
  const visit = useRef(0);

  return (
    <section
      className="editor__props"
      aria-label="Properties"
      onFocus={() => {
        visit.current += 1;
      }}
    >
      <div className="editor__heading">Properties</div>
      {selection?.kind === 'parameter' ? (
        <ParameterProps
          key={`${selection.definition}/parameter.${selection.at}`}
          doc={doc}
          selection={selection}
          visit={visit}
          onChange={onChange}
        />
      ) : selection && node && selection.definition !== focus ? (
        <ExpandedProps
          key={`${selection.definition}/${selection.path.join('.')}`}
          selection={selection}
          node={node}
          producer={producer}
          onProduce={onProduce}
          onOpen={onOpen}
        />
      ) : selection && node ? (
        <NodeProps
          // A fresh set of fields per node, so nothing typed into one is
          // still there when another is selected.
          key={`${selection.definition}/${selection.path.join('.')}`}
          doc={doc}
          selection={selection}
          node={node}
          visit={visit}
          onChange={onChange}
          onOpen={onOpen}
        />
      ) : (
        <p className="editor__hint">Select a node to see its props.</p>
      )}
    </section>
  );
}
