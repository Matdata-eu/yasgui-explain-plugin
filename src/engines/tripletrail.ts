/**
 * TripleTrail
 *
 * TripleTrail explains a query on `GET|POST /{ds}/explain`, beside the
 * dataset's `/{ds}/sparql` and `/{ds}/query`, with the same `query`
 * parameter. It runs the query and answers JSON: the row count, the plan it
 * ran under `plan.plan` (each step with its `name`, `number of results`,
 * `duration in seconds` and `children`), the planning time under
 * `plan["planning duration in seconds"]`, and the decisions of its spatial
 * index under `spatial`. A caller who may read only some graphs gets the row
 * count alone, with `restricted: true`.
 */

import type { Engine, Plan, PlanNode } from '../types';

/** `https://host/ds/sparql` (or `/query`, `/update`) becomes `https://host/ds/explain` */
export function explainUrl(endpoint: string): string {
  const index = endpoint.search(/[?#]/);
  const [base, suffix] =
    index < 0 ? [endpoint, ''] : [endpoint.slice(0, index), endpoint.slice(index)];
  const trimmed = base.replace(/\/+$/, '');
  if (/\/(sparql|query|update)$/i.test(trimmed))
    return trimmed.replace(/\/(sparql|query|update)$/i, '/explain') + suffix;
  if (/\/explain$/i.test(trimmed)) return trimmed + suffix;
  return `${trimmed}/explain${suffix}`;
}

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const ms = (seconds: unknown) => (isNumber(seconds) ? seconds * 1000 : undefined);

function toNode(step: any): PlanNode {
  return {
    label: String(step?.name || 'step')
      .replace(/\s+/g, ' ')
      .trim(),
    rows: isNumber(step?.['number of results']) ? step['number of results'] : undefined,
    timeMs: ms(step?.['duration in seconds']),
    children: Array.isArray(step?.children) ? step.children.map(toNode) : [],
  };
}

export function parseTripleTrailResponse(body: string): Plan {
  const text = body.trim();
  if (!text) throw new Error('TripleTrail returned an empty response.');
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('TripleTrail did not return JSON. Is this endpoint a TripleTrail server?');
  }
  if (!json || typeof json !== 'object' || json.head || json.results || 'boolean' in json)
    throw new Error(
      'The endpoint returned results instead of a plan. Is this endpoint a TripleTrail server?'
    );
  const summary: string[] = [];
  if (isNumber(json.rows)) summary.push(`Result size: ${json.rows.toLocaleString('en-US')} rows`);
  const planning = ms(json.plan?.['planning duration in seconds']);
  if (planning !== undefined) summary.push(`Query planning: ${planning.toFixed(2)} ms`);
  const spatial = json.spatial && typeof json.spatial === 'object' ? json.spatial : {};
  if (spatial.filters || spatial.joins) {
    const lookup = isNumber(spatial.lookup_ms)
      ? `, index lookup ${spatial.lookup_ms.toFixed(1)} ms`
      : '';
    summary.push(
      `Spatial: ${spatial.filters || 0} filters, ${spatial.joins || 0} joins, ${spatial.candidates || 0} candidates${lookup}`
    );
  }
  if (Array.isArray(spatial.decisions))
    for (const decision of spatial.decisions) summary.push(`Spatial rewrite: ${String(decision)}`);
  const root = json.plan && (json.plan.plan || (json.plan.name ? json.plan : undefined));
  if (root && typeof root === 'object') return { kind: 'tree', root: toNode(root), summary };
  if (json.restricted)
    summary.push(
      'The plan is left out: you may read only some of the graphs, and the plan is chosen from all of them.'
    );
  return { kind: 'text', text: summary.join('\n') || 'No plan.' };
}

export const tripletrail: Engine = {
  id: 'tripletrail',
  label: 'TripleTrail',
  description: 'The plan TripleTrail ran, with the rows and time of each step.',
  needsRequestOptions: true,
  buildRequest(query, endpoint) {
    return { query, accept: 'application/json', endpoint: explainUrl(endpoint) };
  },
  parse(body) {
    return parseTripleTrailResponse(body);
  },
};
