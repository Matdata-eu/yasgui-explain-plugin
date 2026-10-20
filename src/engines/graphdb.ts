/**
 * Ontotext GraphDB
 *
 * GraphDB explains a query when it reads from the pseudo graph
 * `onto:explain` (http://www.ontotext.com/explain): the response is then the
 * plan as text, with the chosen order of the triple patterns and the estimated
 * collection sizes, instead of the results. RDF4J shares the `/repositories/`
 * URL layout but has no explain, so the request fails there.
 */

import type { Engine, Plan } from '../types';

export const EXPLAIN_GRAPH = 'http://www.ontotext.com/explain';

/**
 * Add `FROM <onto:explain>` to a query. The clause goes right before the
 * WHERE keyword (or the group graph pattern when WHERE is omitted), skipping
 * comments, strings and IRIs so the words inside them are left alone.
 */
export function addExplainGraph(query: string): string {
  const insertAt = findWhereOffset(query);
  if (insertAt < 0)
    throw new Error('Could not find the WHERE clause of the query to add the explain graph to.');
  const clause = `FROM <${EXPLAIN_GRAPH}>`;
  const before = query.slice(0, insertAt);
  const needsSpace = before.length > 0 && !/\s$/.test(before);
  return `${before}${needsSpace ? ' ' : ''}${clause} ${query.slice(insertAt)}`;
}

/** Offset of the first WHERE keyword or, without one, of the first `{` after the query form */
export function findWhereOffset(query: string): number {
  let i = 0;
  const n = query.length;
  let sawForm = false; // SELECT / CONSTRUCT / DESCRIBE / ASK seen
  let depth = 0; // brace depth, so a CONSTRUCT template is skipped
  let firstBrace = -1;
  let skipGroups = 0; // top-level brace groups that belong to the form (the CONSTRUCT template)
  while (i < n) {
    const ch = query[i];
    if (ch === '#') {
      while (i < n && query[i] !== '\n') i++;
      continue;
    }
    if (ch === '<') {
      // IRI: no spaces inside, ends at the next '>'
      const end = query.indexOf('>', i + 1);
      if (end > 0 && !/\s/.test(query.slice(i + 1, end))) {
        i = end + 1;
        continue;
      }
    }
    if (ch === '"' || ch === "'") {
      i = skipString(query, i);
      continue;
    }
    if (ch === '{') {
      if (sawForm && depth === 0 && firstBrace < 0) {
        if (skipGroups > 0) skipGroups--;
        else firstBrace = i;
      }
      depth++;
      i++;
      continue;
    }
    if (ch === '}') {
      depth--;
      i++;
      continue;
    }
    if (/[A-Za-z]/.test(ch)) {
      let j = i;
      while (j < n && /[A-Za-z_]/.test(query[j])) j++;
      const word = query.slice(i, j).toUpperCase();
      if (depth === 0) {
        if (word === 'SELECT' || word === 'CONSTRUCT' || word === 'DESCRIBE' || word === 'ASK') {
          sawForm = true;
          firstBrace = -1;
          skipGroups = word === 'CONSTRUCT' ? 1 : 0;
        } else if (word === 'WHERE' && sawForm) {
          return i;
        }
      }
      i = j;
      continue;
    }
    i++;
  }
  return firstBrace;
}

function skipString(text: string, start: number): number {
  const quote = text[start];
  const long = text.startsWith(quote.repeat(3), start);
  const delimiter = long ? quote.repeat(3) : quote;
  let i = start + delimiter.length;
  while (i < text.length) {
    if (text[i] === '\\') {
      i += 2;
      continue;
    }
    if (text.startsWith(delimiter, i)) return i + delimiter.length;
    if (!long && text[i] === '\n') return i;
    i++;
  }
  return text.length;
}

/** The plan is text, but some clients get it wrapped in a SPARQL result: unwrap it */
export function parseGraphdbResponse(body: string, contentType: string | undefined): Plan {
  const text = body.trim();
  if (!text) throw new Error('GraphDB returned an empty response.');
  if (/json/i.test(contentType || '') || text.startsWith('{')) {
    try {
      const json = JSON.parse(text);
      const bindings = json?.results?.bindings;
      if (Array.isArray(bindings)) {
        const lines: string[] = [];
        for (const binding of bindings) {
          for (const term of Object.values(binding as Record<string, { value?: string }>)) {
            if (term && typeof term.value === 'string') lines.push(term.value);
          }
        }
        if (lines.length === 0) {
          throw new Error(
            'GraphDB returned results instead of a plan. The onto:explain pseudo graph needs GraphDB; RDF4J does not support it.'
          );
        }
        return { kind: 'text', text: lines.join('\n') };
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('GraphDB returned')) throw error;
      // not JSON after all: fall through to the text plan
    }
  }
  if (/^<\?xml|^<sparql/i.test(text)) {
    throw new Error(
      'GraphDB returned results instead of a plan. The onto:explain pseudo graph needs GraphDB; RDF4J does not support it.'
    );
  }
  return { kind: 'text', text };
}

export const graphdb: Engine = {
  id: 'graphdb',
  label: 'GraphDB',
  description:
    'The plan GraphDB chose, with the order of the patterns and estimated sizes (no timings).',
  needsRequestOptions: false,
  buildRequest(query) {
    return {
      query: addExplainGraph(query),
      accept: 'text/plain, application/sparql-results+json;q=0.9, */*;q=0.1',
    };
  },
  parse(body, contentType) {
    return parseGraphdbResponse(body, contentType);
  },
};
