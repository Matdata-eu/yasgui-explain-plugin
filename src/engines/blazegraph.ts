/**
 * Blazegraph
 *
 * With the `explain` request parameter, Blazegraph answers with an HTML page
 * instead of the results: the query, its abstract syntax tree, the operator
 * plan and, with `explain=details`, a table of statistics per operator. The
 * plugin shows that page in a sandboxed frame.
 */

import type { Engine, Plan } from '../types';

export function parseBlazegraphResponse(body: string, contentType: string | undefined): Plan {
  const text = body.trim();
  if (!text) throw new Error('Blazegraph returned an empty response.');
  if (/html/i.test(contentType || '') || /^<!doctype html|^<html/i.test(text)) {
    return { kind: 'html', html: body };
  }
  if (/^<\?xml|^<sparql|^\{/.test(text)) {
    throw new Error(
      'The endpoint returned results instead of an explain page. Is this a Blazegraph instance?'
    );
  }
  return { kind: 'text', text };
}

export const blazegraph: Engine = {
  id: 'blazegraph',
  label: 'Blazegraph',
  description:
    'The explain page of Blazegraph: abstract syntax tree, operator plan and statistics.',
  needsRequestOptions: true,
  buildRequest(query) {
    return { query, accept: 'text/html, */*;q=0.1', extraArgs: { explain: 'details' } };
  },
  parse(body, contentType) {
    return parseBlazegraphResponse(body, contentType);
  },
};
