/**
 * QLever (https://github.com/ad-freiburg/qlever)
 *
 * With `Accept: application/qlever-results+json`, QLever returns its results
 * together with `runtimeInformation`: the tree of operations it executed, with
 * the time and the number of rows of each. The plugin re-sends the query with
 * that Accept header once the user's query has completed: QLever answers from
 * its result cache, and cached operations keep their original times in their
 * details.
 */

import type { Engine, Plan, PlanNode } from '../types';

const ACCEPT = 'application/qlever-results+json';

/** A node of QLever's `query_execution_tree` (newer) or `runtimeInformation` (older) */
interface QleverNode {
  description?: string;
  operation_time?: number;
  total_time?: number;
  result_rows?: number;
  result_cols?: number;
  column_names?: string[];
  cache_status?: string;
  was_cached?: boolean;
  status?: string;
  estimated_size?: number;
  estimated_operation_cost?: number;
  estimated_column_multiplicities?: number[];
  details?: Record<string, unknown>;
  children?: QleverNode[];
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}

function formatDetail(key: string, value: unknown): string {
  if (value && typeof value === 'object') return `${key}: ${JSON.stringify(value)}`;
  return `${key}: ${String(value)}`;
}

/** Convert one QLever node (and its children) to a plan node */
export function toPlanNode(node: QleverNode): PlanNode {
  const cached =
    node.was_cached === true ||
    (typeof node.cache_status === 'string' &&
      node.cache_status !== 'computed' &&
      node.cache_status !== 'not_cached');
  const details: string[] = [];
  if (typeof node.cache_status === 'string' && node.cache_status !== 'computed') {
    details.push(`cache: ${node.cache_status.replace(/_/g, ' ')}`);
  }
  if (isNumber(node.estimated_size))
    details.push(`estimated size: ${formatNumber(node.estimated_size)}`);
  if (isNumber(node.estimated_operation_cost)) {
    details.push(`estimated cost: ${formatNumber(node.estimated_operation_cost)}`);
  }
  if (
    Array.isArray(node.estimated_column_multiplicities) &&
    node.estimated_column_multiplicities.length
  ) {
    details.push(`estimated multiplicities: ${node.estimated_column_multiplicities.join(', ')}`);
  }
  if (node.details && typeof node.details === 'object') {
    for (const [key, value] of Object.entries(node.details)) {
      if (value === undefined || value === null || value === '') continue;
      details.push(formatDetail(key.replace(/_/g, ' '), value));
    }
  }
  return {
    label: (node.description || 'operation').replace(/\s+/g, ' ').trim(),
    details,
    rows: isNumber(node.result_rows) ? node.result_rows : undefined,
    columns: Array.isArray(node.column_names) ? node.column_names.map(String) : undefined,
    timeMs: isNumber(node.operation_time) ? node.operation_time : undefined,
    totalMs: isNumber(node.total_time) ? node.total_time : undefined,
    cached,
    status: typeof node.status === 'string' ? node.status : undefined,
    children: Array.isArray(node.children) ? node.children.map(toPlanNode) : [],
  };
}

function formatMs(value: unknown): string | undefined {
  if (isNumber(value)) return `${formatNumber(value)} ms`;
  if (typeof value === 'string') return value;
  return undefined;
}

/** Parse a `application/qlever-results+json` response into a plan */
export function parseQleverResponse(body: string): Plan {
  let json: any;
  try {
    json = JSON.parse(body);
  } catch {
    throw new Error('QLever did not return JSON. Is this endpoint a QLever instance?');
  }
  if (json && typeof json === 'object' && json.status === 'ERROR') {
    throw new Error(`QLever reported an error: ${json.exception || json.error || 'unknown error'}`);
  }
  const info = json?.runtimeInformation;
  if (!info || typeof info !== 'object') {
    throw new Error(
      'The response carries no runtime information. Is this endpoint a QLever instance?'
    );
  }
  const tree: QleverNode | undefined =
    info.query_execution_tree ?? (info.description ? info : undefined);
  if (!tree) throw new Error('The runtime information holds no query execution tree.');

  const summary: string[] = [];
  const meta = info.meta;
  if (meta && typeof meta === 'object') {
    const planning = formatMs(meta.time_query_planning);
    if (planning) summary.push(`Query planning: ${planning}`);
    const computing = formatMs(meta.total_time_computing);
    if (computing) summary.push(`Computing: ${computing}`);
    const total = formatMs(meta.total_time);
    if (total) summary.push(`Total: ${total}`);
  }
  if (json.time && typeof json.time === 'object' && summary.length === 0) {
    const total = formatMs(json.time.total);
    if (total) summary.push(`Total: ${total}`);
    const compute = formatMs(json.time.computeResult);
    if (compute) summary.push(`Computing: ${compute}`);
  }
  if (isNumber(json.resultsize)) summary.push(`Result size: ${formatNumber(json.resultsize)} rows`);
  if (Array.isArray(json.warnings) && json.warnings.length) {
    summary.push(`Warnings: ${json.warnings.map(String).join(' | ')}`);
  }
  return { kind: 'tree', root: toPlanNode(tree), summary };
}

export const qlever: Engine = {
  id: 'qlever',
  label: 'QLever',
  description: 'The operations QLever executed, with the time and rows of each.',
  needsRequestOptions: false,
  buildRequest(query) {
    // `send` caps the rows QLever sends back: the plan is what we are after
    return { query, accept: ACCEPT, extraArgs: { send: '1' } };
  },
  parse(body) {
    return parseQleverResponse(body);
  },
};
