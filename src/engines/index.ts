/**
 * The engines the plugin can ask for an execution plan, and how to tell which
 * one an endpoint runs.
 */

import type { Engine, EngineChoice, EngineId } from '../types';
import { qlever } from './qlever';
import { graphdb } from './graphdb';
import { stardog } from './stardog';
import { blazegraph } from './blazegraph';
import { neptune } from './neptune';

export const ENGINES: Record<EngineId, Engine> = { qlever, graphdb, stardog, blazegraph, neptune };

export const ENGINE_IDS: EngineId[] = ['qlever', 'graphdb', 'stardog', 'blazegraph', 'neptune'];

export function isEngineId(value: unknown): value is EngineId {
  return typeof value === 'string' && value in ENGINES;
}

export function isEngineChoice(value: unknown): value is EngineChoice {
  return value === 'auto' || value === 'none' || isEngineId(value);
}

/**
 * Guess the engine behind an endpoint from its URL and, when the host exposes
 * them, the response headers of the last query. Undefined when nothing matches:
 * the user can then pick the engine by hand.
 */
export function detectEngine(
  endpoint: string | undefined,
  serverHeader?: string | null
): EngineId | undefined {
  const server = (serverHeader || '').toLowerCase();
  if (server.includes('qlever')) return 'qlever';
  if (server.includes('graphdb')) return 'graphdb';
  if (server.includes('stardog')) return 'stardog';
  if (server.includes('blazegraph') || server.includes('bigdata')) return 'blazegraph';

  if (!endpoint) return undefined;
  let url: URL | undefined;
  try {
    url = new URL(endpoint);
  } catch {
    return undefined;
  }
  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();

  if (host.includes('qlever') || path.includes('qlever')) return 'qlever';
  if (host.includes('neptune.amazonaws.com') || host.endsWith('.neptune.amazonaws.com'))
    return 'neptune';
  if (/\/(bigdata|blazegraph)(\/|$)/.test(path)) return 'blazegraph';
  // Well-known public endpoints whose URL does not name the engine
  if (host === 'query.wikidata.org') return 'blazegraph';
  if (host === 'lindas.admin.ch' || host === 'ld.admin.ch') return 'stardog';
  if (host.includes('graphdb') || path.includes('graphdb')) return 'graphdb';
  if (/\/repositories\/[^/]+\/?$/.test(path)) return 'graphdb';
  if (host.includes('stardog') || path.includes('stardog') || url.port === '5820') return 'stardog';
  if (/\/[^/]+\/query\/?$/.test(path)) return 'stardog';
  return undefined;
}

/** How the engine was chosen, for the toolbar */
export interface ResolvedEngine {
  engine: Engine | undefined;
  /** "stored" when the user picked it, "detected" when guessed, "none" when neither */
  source: 'stored' | 'detected' | 'forced' | 'none';
}

export function resolveEngine(
  choice: EngineChoice,
  endpoint: string | undefined,
  serverHeader?: string | null,
  forced?: EngineChoice
): ResolvedEngine {
  const effective = forced && forced !== 'auto' ? forced : choice;
  const source = forced && forced !== 'auto' ? 'forced' : 'stored';
  if (effective === 'none') return { engine: undefined, source };
  if (isEngineId(effective)) return { engine: ENGINES[effective], source };
  const detected = detectEngine(endpoint, serverHeader);
  return detected
    ? { engine: ENGINES[detected], source: 'detected' }
    : { engine: undefined, source: 'none' };
}
