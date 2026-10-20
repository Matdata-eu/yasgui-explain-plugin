/**
 * Stardog
 *
 * Stardog explains a query on `GET|POST /{db}/explain` with the same `query`
 * parameter as `/{db}/query`. With `profile=true` the plan carries the actual
 * rows, wall time and memory of each operator; without it only estimates.
 * The response is the plan as text.
 */

import type { Engine, Plan } from '../types';

/** `https://host:5820/mydb/query` becomes `https://host:5820/mydb/explain` */
export function explainUrl(endpoint: string): string {
  const [base, suffix] = splitUrl(endpoint);
  const trimmed = base.replace(/\/+$/, '');
  if (/\/(query|update)$/i.test(trimmed))
    return trimmed.replace(/\/(query|update)$/i, '/explain') + suffix;
  if (/\/explain$/i.test(trimmed)) return trimmed + suffix;
  return `${trimmed}/explain${suffix}`;
}

function splitUrl(url: string): [string, string] {
  const index = url.search(/[?#]/);
  return index < 0 ? [url, ''] : [url.slice(0, index), url.slice(index)];
}

export function parseStardogResponse(body: string): Plan {
  const text = body.trim();
  if (!text) throw new Error('Stardog returned an empty response.');
  if (text.startsWith('{')) {
    try {
      const json = JSON.parse(text);
      if (json && typeof json === 'object' && typeof json.message === 'string') {
        throw new Error(`Stardog reported an error: ${json.message}`);
      }
      if (json && typeof json === 'object' && typeof json.plan === 'string') {
        return { kind: 'text', text: json.plan };
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Stardog reported')) throw error;
    }
  }
  return { kind: 'text', text };
}

export const stardog: Engine = {
  id: 'stardog',
  label: 'Stardog',
  description: 'The profiled plan from Stardog, with rows, wall time and memory of each operator.',
  needsRequestOptions: true,
  buildRequest(query, endpoint) {
    return {
      query,
      accept: 'text/plain, application/json;q=0.5, */*;q=0.1',
      extraArgs: { profile: 'true' },
      endpoint: explainUrl(endpoint),
    };
  },
  parse(body) {
    return parseStardogResponse(body);
  },
};
