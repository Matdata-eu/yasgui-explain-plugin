/**
 * Amazon Neptune
 *
 * Neptune explains a query with the `explain` request parameter
 * (`explain=details` adds the estimates and the time per operator). The
 * response is a text table, one row per operator.
 */

import type { Engine, Plan } from '../types';

export function parseNeptuneResponse(body: string, contentType: string | undefined): Plan {
  const text = body.trim();
  if (!text) throw new Error('Neptune returned an empty response.');
  if (/html/i.test(contentType || '') || /^<!doctype html|^<html/i.test(text)) {
    return { kind: 'html', html: body };
  }
  if (text.startsWith('{')) {
    try {
      const json = JSON.parse(text);
      if (json && typeof json === 'object' && (json.detailedMessage || json.message)) {
        throw new Error(`Neptune reported an error: ${json.detailedMessage || json.message}`);
      }
      if (json?.results?.bindings) {
        throw new Error(
          'The endpoint returned results instead of an explain table. Is this a Neptune instance?'
        );
      }
    } catch (error) {
      if (error instanceof Error && !(error instanceof SyntaxError)) throw error;
    }
  }
  return { kind: 'text', text };
}

export const neptune: Engine = {
  id: 'neptune',
  label: 'Neptune',
  description: 'The explain table of Amazon Neptune, one row per operator with its time.',
  needsRequestOptions: true,
  buildRequest(query) {
    return { query, accept: 'text/plain, */*;q=0.1', extraArgs: { explain: 'details' } };
  },
  parse(body, contentType) {
    return parseNeptuneResponse(body, contentType);
  },
};
