/**
 * Printing RDF/JS terms, expressions and property paths in SPARQL syntax,
 * with IRIs shortened by the prefixes of the query.
 */

export interface Prefixes {
  [prefix: string]: string;
}

const XSD = 'http://www.w3.org/2001/XMLSchema#';
const BARE_DATATYPES = new Set([`${XSD}integer`, `${XSD}decimal`, `${XSD}double`, `${XSD}boolean`]);

/** Shorten an IRI with the longest matching prefix, else write it in angle brackets */
export function printIri(iri: string, prefixes: Prefixes = {}): string {
  let best: [string, string] | undefined;
  for (const [prefix, namespace] of Object.entries(prefixes)) {
    if (!namespace || !iri.startsWith(namespace)) continue;
    if (!best || namespace.length > best[1].length) best = [prefix, namespace];
  }
  if (best) {
    const local = iri.slice(best[1].length);
    if (/^[A-Za-z0-9_\-.:%]*$/.test(local) && !local.endsWith('.')) return `${best[0]}:${local}`;
  }
  return `<${iri}>`;
}

/** An RDF/JS term as SPARQL text */
export function printTerm(term: any, prefixes: Prefixes = {}): string {
  if (term === undefined || term === null) return '';
  if (typeof term === 'string') return term;
  switch (term.termType) {
    case 'Variable':
      return `?${term.value}`;
    case 'NamedNode':
      return printIri(term.value, prefixes);
    case 'BlankNode':
      return `_:${term.value}`;
    case 'DefaultGraph':
      return '';
    case 'Literal': {
      const value = JSON.stringify(String(term.value));
      const language = term.language || term['xml:lang'];
      if (language) return `${value}@${language}`;
      const datatype = term.datatype?.value;
      if (!datatype || datatype === `${XSD}string`) return value;
      if (
        BARE_DATATYPES.has(datatype) &&
        /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$|^(true|false)$/.test(term.value)
      ) {
        return String(term.value);
      }
      return `${value}^^${printIri(datatype, prefixes)}`;
    }
    case 'Quad':
      return printQuad(term, prefixes);
    default:
      if (typeof term.value === 'string') return term.value;
      return JSON.stringify(term);
  }
}

/** A triple or quad pattern as `?s <p> ?o` (a non-default graph is appended as `@ <g>`) */
export function printQuad(quad: any, prefixes: Prefixes = {}): string {
  const parts = [
    printTermOrPath(quad.subject, prefixes),
    printTermOrPath(quad.predicate, prefixes),
    printTermOrPath(quad.object, prefixes),
  ];
  if (quad.graph && quad.graph.termType !== 'DefaultGraph')
    parts.push(`@ ${printTerm(quad.graph, prefixes)}`);
  return parts.join(' ');
}

function printTermOrPath(value: any, prefixes: Prefixes): string {
  if (
    value &&
    typeof value === 'object' &&
    !('termType' in value) &&
    typeof value.type === 'string'
  ) {
    return printPath(value, prefixes);
  }
  return printTerm(value, prefixes);
}

/** A property path in SPARQL syntax */
export function printPath(
  path: any,
  prefixes: Prefixes = {},
  parent: 'alt' | 'seq' | 'unary' | undefined = undefined
): string {
  if (!path || typeof path !== 'object') return String(path);
  if ('termType' in path) return printTerm(path, prefixes);
  const inner = (child: any, as: 'alt' | 'seq' | 'unary') => printPath(child, prefixes, as);
  let text: string;
  switch (path.type) {
    case 'link':
      return printTerm(path.iri, prefixes);
    case 'inv':
      return `^${inner(path.path, 'unary')}`;
    case 'seq':
      text = (path.input || []).map((p: any) => inner(p, 'seq')).join('/');
      break;
    case 'alt':
      text = (path.input || []).map((p: any) => inner(p, 'alt')).join('|');
      break;
    case 'ZeroOrMorePath':
      return `${inner(path.path, 'unary')}*`;
    case 'OneOrMorePath':
      return `${inner(path.path, 'unary')}+`;
    case 'ZeroOrOnePath':
      return `${inner(path.path, 'unary')}?`;
    case 'nps':
      return `!(${(path.iris || []).map((iri: any) => printTerm(iri, prefixes)).join('|')})`;
    default:
      return path.type;
  }
  // A sequence binds tighter than an alternative; a modifier or inverse binds tighter than both
  const needsBrackets = parent === 'unary' || (parent === 'seq' && path.type === 'alt');
  return needsBrackets ? `(${text})` : text;
}

/** An expression in SPARQL-like prefix notation, e.g. `(> ?o 3)` or `(count ?o)` */
export function printExpression(expression: any, prefixes: Prefixes = {}): string {
  if (expression === undefined || expression === null) return '';
  if (typeof expression !== 'object') return String(expression);
  if ('termType' in expression) return printTerm(expression, prefixes);
  switch (expression.subType ?? expression.expressionType) {
    case 'term':
      return printTerm(expression.term, prefixes);
    case 'operator': {
      const args = (expression.args || []).map((arg: any) => printExpression(arg, prefixes));
      return `(${expression.operator} ${args.join(' ')})`.replace(' )', ')');
    }
    case 'named': {
      const args = (expression.args || []).map((arg: any) => printExpression(arg, prefixes));
      return `(${printTerm(expression.name, prefixes)} ${args.join(' ')})`.replace(' )', ')');
    }
    case 'aggregate': {
      const inner = expression.expression ? printExpression(expression.expression, prefixes) : '*';
      const distinct = expression.distinct ? 'distinct ' : '';
      const separator =
        expression.aggregator === 'group_concat' && expression.separator !== undefined
          ? ` ${JSON.stringify(expression.separator)}`
          : '';
      return `(${expression.aggregator} ${distinct}${inner}${separator})`;
    }
    case 'existence':
      return `(${expression.not ? 'notexists' : 'exists'} ...)`;
    case 'wildcard':
      return '*';
    default:
      if (expression.operator) return `(${expression.operator})`;
      return JSON.stringify(expression);
  }
}
