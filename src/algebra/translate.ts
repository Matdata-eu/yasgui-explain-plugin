/**
 * From query text to SPARQL algebra, with traqula (the comunica parser and
 * algebra transformer for SPARQL 1.2).
 */

import { Parser } from '@traqula/parser-sparql-1-2';
import { toAlgebra } from '@traqula/algebra-sparql-1-2';

export type Algebra = any;

export interface TranslateOptions {
  /** Base IRI for relative IRIs; a placeholder is used when the query has none */
  baseIRI?: string;
}

/** The base used when the query has no BASE: relative IRIs then print as `<http://base/...>` */
export const DEFAULT_BASE_IRI = 'http://base/';

export class AlgebraError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AlgebraError';
  }
}

let parser: Parser | undefined;

/** Translate a query to its algebra, or throw an AlgebraError with the parser's message */
export function translate(query: string, options: TranslateOptions = {}): Algebra {
  if (!query || !query.trim()) throw new AlgebraError('The query is empty.');
  if (!parser) parser = new Parser();
  let ast: unknown;
  const baseIRI = options.baseIRI || DEFAULT_BASE_IRI;
  try {
    ast = parser.parse(query, { baseIRI });
  } catch (error) {
    throw new AlgebraError(cleanParseMessage(error));
  }
  try {
    // Triple patterns with an explicit `graph` operator, as in the specification
    return toAlgebra(ast as any, { quads: false, baseIRI });
  } catch (error) {
    // Updates are only translated with quads
    try {
      return toAlgebra(ast as any, { quads: true, baseIRI });
    } catch {
      throw new AlgebraError(error instanceof Error ? error.message : String(error));
    }
  }
}

/** The parser's messages list every token it expected; keep the readable head */
export function cleanParseMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const lines = message.split('\n').map((line) => line.trimEnd());
  const kept: string[] = [];
  for (const line of lines) {
    if (/^\s*<\[/.test(line) || /^\s*\[/.test(line)) break; // the token sequences
    kept.push(line);
    if (kept.length >= 4) break;
  }
  return (
    kept
      .join('\n')
      .replace(/::\s*$/, '.')
      .trim() || message
  );
}
