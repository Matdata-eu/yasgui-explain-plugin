/**
 * Two views of an algebra expression: a tree for the screen, and the
 * s-expression text (the notation of ARQ and the SPARQL specification
 * examples) for copying into issues and documentation.
 */

import { printExpression, printPath, printQuad, printTerm, type Prefixes } from './terms';

/** One node of the algebra tree shown on screen */
export interface AlgebraNode {
  /** The operator, e.g. "project" */
  operator: string;
  /** Its arguments on the same line, e.g. "?s ?n" */
  args?: string;
  /** Lines below the operator, e.g. the triples of a bgp */
  details?: string[];
  children: AlgebraNode[];
}

function list(items: any[] | undefined, print: (item: any) => string): string {
  return `(${(items || []).map(print).join(' ')})`;
}

function variables(items: any[] | undefined, prefixes: Prefixes): string {
  return (items || []).map((item) => printTerm(item, prefixes)).join(' ');
}

/** Build the screen tree of an algebra expression */
export function toTree(algebra: any, prefixes: Prefixes = {}): AlgebraNode {
  const node = (
    operator: string,
    args?: string,
    children: any[] = [],
    details?: string[]
  ): AlgebraNode => ({
    operator,
    args: args || undefined,
    details: details && details.length ? details : undefined,
    children: children.filter(Boolean).map((child) => toTree(child, prefixes)),
  });
  if (!algebra || typeof algebra !== 'object') return node(String(algebra));
  const inputs: any[] = Array.isArray(algebra.input)
    ? algebra.input
    : algebra.input
      ? [algebra.input]
      : [];
  switch (algebra.type) {
    case 'bgp':
      return node(
        'bgp',
        undefined,
        [],
        (algebra.patterns || []).map((p: any) => printQuad(p, prefixes))
      );
    case 'path':
      return node(
        'path',
        undefined,
        [],
        [printQuad({ ...algebra, predicate: algebra.predicate }, prefixes)]
      );
    case 'join':
    case 'union':
    case 'minus':
    case 'distinct':
    case 'reduced':
    case 'ask':
      return node(algebra.type, undefined, inputs);
    case 'leftjoin':
      return node(
        'leftjoin',
        algebra.expression ? printExpression(algebra.expression, prefixes) : undefined,
        inputs
      );
    case 'filter':
      return node('filter', printExpression(algebra.expression, prefixes), inputs);
    case 'extend':
      return node(
        'extend',
        `${printTerm(algebra.variable, prefixes)} := ${printExpression(algebra.expression, prefixes)}`,
        inputs
      );
    case 'project':
      return node('project', variables(algebra.variables, prefixes), inputs);
    case 'orderby':
      return node(
        'orderby',
        (algebra.expressions || []).map((e: any) => printExpression(e, prefixes)).join(' '),
        inputs
      );
    case 'slice': {
      const parts: string[] = [];
      if (algebra.start) parts.push(`offset ${algebra.start}`);
      if (algebra.length !== undefined) parts.push(`limit ${algebra.length}`);
      return node('slice', parts.join(' '), inputs);
    }
    case 'group': {
      const aggregates = (algebra.aggregates || []).map(
        (a: any) => `${printTerm(a.variable, prefixes)} := ${printExpression(a, prefixes)}`
      );
      return node('group', variables(algebra.variables, prefixes), inputs, aggregates);
    }
    case 'graph':
      return node('graph', printTerm(algebra.name, prefixes), inputs);
    case 'service':
      return node(
        'service',
        `${algebra.silent ? 'silent ' : ''}${printTerm(algebra.name, prefixes)}`,
        inputs
      );
    case 'values': {
      const vars = (algebra.variables || []).map((v: any) => printTerm(v, prefixes));
      const rows = (algebra.bindings || []).map(
        (row: any) =>
          `[${vars
            .map((v: string) => {
              const term = row[v.slice(1)];
              return term === undefined ? 'UNDEF' : printTerm(term, prefixes);
            })
            .join(' ')}]`
      );
      return node('values', vars.join(' '), [], rows);
    }
    case 'from': {
      const details: string[] = [];
      for (const g of algebra.default || []) details.push(`from ${printTerm(g, prefixes)}`);
      for (const g of algebra.named || []) details.push(`from named ${printTerm(g, prefixes)}`);
      return node('dataset', undefined, inputs, details);
    }
    case 'construct':
      return node(
        'construct',
        undefined,
        inputs,
        (algebra.template || []).map((q: any) => printQuad(q, prefixes))
      );
    case 'describe':
      return node('describe', variables(algebra.terms, prefixes), inputs);
    case 'deleteinsert': {
      const details: string[] = [];
      for (const q of algebra.delete || []) details.push(`delete ${printQuad(q, prefixes)}`);
      for (const q of algebra.insert || []) details.push(`insert ${printQuad(q, prefixes)}`);
      return node('modify', undefined, algebra.where ? [algebra.where] : [], details);
    }
    case 'compositeupdate':
      return node('update', undefined, algebra.updates || []);
    case 'load':
      return node(
        'load',
        `${algebra.silent ? 'silent ' : ''}${printTerm(algebra.source, prefixes)}` +
          (algebra.destination ? ` into ${printTerm(algebra.destination, prefixes)}` : '')
      );
    case 'clear':
    case 'drop':
    case 'create':
      return node(
        algebra.type,
        `${algebra.silent ? 'silent ' : ''}${typeof algebra.source === 'string' ? algebra.source : printTerm(algebra.source, prefixes)}`
      );
    case 'add':
    case 'move':
    case 'copy':
      return node(
        algebra.type,
        `${algebra.silent ? 'silent ' : ''}${printGraphRef(algebra.source, prefixes)} to ${printGraphRef(algebra.destination, prefixes)}`
      );
    case 'nop':
      return node('nop');
    default: {
      const details: string[] = [];
      for (const [key, value] of Object.entries(algebra)) {
        if (key === 'type' || key === 'input' || key === 'loc' || key === 'RTT') continue;
        details.push(`${key}: ${describeValue(value, prefixes)}`);
      }
      return node(String(algebra.type || 'unknown'), undefined, inputs, details);
    }
  }
}

function printGraphRef(value: any, prefixes: Prefixes): string {
  if (typeof value === 'string') return value;
  return printTerm(value, prefixes);
}

function describeValue(value: any, prefixes: Prefixes): string {
  if (Array.isArray(value)) return value.map((v) => describeValue(v, prefixes)).join(', ');
  if (value && typeof value === 'object') {
    if ('termType' in value) return printTerm(value, prefixes);
    if (value.subType || value.expressionType) return printExpression(value, prefixes);
    if (typeof value.type === 'string' && /path|link|inv|seq|alt|nps/i.test(value.type))
      return printPath(value, prefixes);
    return JSON.stringify(value);
  }
  return String(value);
}

/** The s-expression of an algebra expression, in the style of ARQ's `qparse --print=op` */
export function toSExpression(algebra: any, prefixes: Prefixes = {}): string {
  const lines: string[] = [];
  write(algebra, prefixes, 0, lines);
  return lines.join('\n');
}

function write(algebra: any, prefixes: Prefixes, depth: number, lines: string[]): void {
  const pad = '  '.repeat(depth);
  const push = (text: string) => lines.push(pad + text);
  if (!algebra || typeof algebra !== 'object') {
    push(String(algebra));
    return;
  }
  const inputs: any[] = Array.isArray(algebra.input)
    ? algebra.input
    : algebra.input
      ? [algebra.input]
      : [];
  const open = (head: string, children: any[] = inputs) => {
    if (children.length === 0) {
      push(`(${head})`);
      return;
    }
    push(`(${head}`);
    for (const child of children) write(child, prefixes, depth + 1, lines);
    lines[lines.length - 1] += ')';
  };
  const expr = (e: any) => printExpression(e, prefixes);
  switch (algebra.type) {
    case 'bgp':
      if (!algebra.patterns?.length) {
        push('(bgp)');
        return;
      }
      push('(bgp');
      for (const pattern of algebra.patterns)
        lines.push(`${pad}  (triple ${printQuad(pattern, prefixes)})`);
      lines[lines.length - 1] += ')';
      return;
    case 'path':
      push(`(path ${printQuad(algebra, prefixes)})`);
      return;
    case 'join':
    case 'union':
    case 'minus':
    case 'distinct':
    case 'reduced':
    case 'ask':
      open(algebra.type);
      return;
    case 'leftjoin':
      open(algebra.expression ? `leftjoin ${expr(algebra.expression)}` : 'leftjoin');
      return;
    case 'filter':
      open(`filter ${expr(algebra.expression)}`);
      return;
    case 'extend':
      open(`extend ((${printTerm(algebra.variable, prefixes)} ${expr(algebra.expression)}))`);
      return;
    case 'project':
      open(`project ${list(algebra.variables, (v) => printTerm(v, prefixes))}`);
      return;
    case 'orderby':
      open(`order ${list(algebra.expressions, expr)}`);
      return;
    case 'slice':
      open(`slice ${algebra.start ?? 0} ${algebra.length === undefined ? '_' : algebra.length}`);
      return;
    case 'group':
      open(
        `group ${list(algebra.variables, (v) => printTerm(v, prefixes))} ${list(
          algebra.aggregates,
          (a) => `(${printTerm(a.variable, prefixes)} ${expr(a)})`
        )}`
      );
      return;
    case 'graph':
      open(`graph ${printTerm(algebra.name, prefixes)}`);
      return;
    case 'service':
      open(`service ${algebra.silent ? 'silent ' : ''}${printTerm(algebra.name, prefixes)}`);
      return;
    case 'values': {
      const vars = (algebra.variables || []).map((v: any) => printTerm(v, prefixes));
      push(`(table (vars ${vars.join(' ')})`);
      for (const row of algebra.bindings || []) {
        const cells = vars
          .map((v: string) => {
            const term = row[v.slice(1)];
            return term === undefined ? undefined : `[${v} ${printTerm(term, prefixes)}]`;
          })
          .filter(Boolean);
        lines.push(`${pad}  (row ${cells.join(' ')})`.replace('(row )', '(row)'));
      }
      lines[lines.length - 1] += ')';
      return;
    }
    case 'from': {
      const graphs = [
        ...(algebra.default || []).map((g: any) => printTerm(g, prefixes)),
        ...(algebra.named || []).map((g: any) => `(named ${printTerm(g, prefixes)})`),
      ];
      open(`dataset (${graphs.join(' ')})`);
      return;
    }
    case 'construct':
      push('(construct');
      for (const pattern of algebra.template || [])
        lines.push(`${pad}  (triple ${printQuad(pattern, prefixes)})`);
      for (const child of inputs) write(child, prefixes, depth + 1, lines);
      lines[lines.length - 1] += ')';
      return;
    case 'describe':
      open(`describe ${list(algebra.terms, (t) => printTerm(t, prefixes))}`);
      return;
    case 'deleteinsert':
      push('(modify');
      for (const q of algebra.delete || [])
        lines.push(`${pad}  (delete (triple ${printQuad(q, prefixes)}))`);
      for (const q of algebra.insert || [])
        lines.push(`${pad}  (insert (triple ${printQuad(q, prefixes)}))`);
      if (algebra.where) write(algebra.where, prefixes, depth + 1, lines);
      lines[lines.length - 1] += ')';
      return;
    case 'compositeupdate':
      open('update', algebra.updates || []);
      return;
    default: {
      const tree = toTree(algebra, prefixes);
      open([tree.operator, tree.args, ...(tree.details || [])].filter(Boolean).join(' '));
    }
  }
}
