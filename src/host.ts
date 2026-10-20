/**
 * Feature detection for the YASR host API
 *
 * Newer YASR versions (MatGUI) offer a toolbar slot and pass extra request
 * options to background queries. Older ones don't: the plugin then draws its
 * own toolbar and, when a request needs options the host can't pass, sends
 * the request itself without the tab's authentication.
 */

import type { Yasr } from './types';

/** The host's plugin toolbar slot, or null when the host has none */
export function getHostToolbar(yasr: Yasr | null | undefined): HTMLDivElement | null {
  if (!yasr?.hostApi?.toolbar || typeof yasr.getPluginToolbar !== 'function') return null;
  try {
    const slot = yasr.getPluginToolbar();
    return slot instanceof HTMLElement ? (slot as HTMLDivElement) : null;
  } catch (error) {
    console.warn('yasgui-plan-plugin: could not get the plugin toolbar', error);
    return null;
  }
}

/** True when `yasr.executeQuery` passes `extraArgs` and `endpoint` to the request */
export function hasHostRequestOptions(yasr: Yasr | null | undefined): boolean {
  return !!yasr?.hostApi?.queryRequest && typeof yasr.executeQuery === 'function';
}

/** True when the host runs background queries with the tab's settings */
export function hasHostExecuteQuery(yasr: Yasr | null | undefined): boolean {
  return typeof yasr?.executeQuery === 'function';
}

/**
 * The current query and endpoint, read from the host's plain query link
 * (`endpoint?query=...&default-graph-uri=...`).
 */
export function readQueryLink(yasr: Yasr | null | undefined): {
  query?: string;
  endpoint?: string;
} {
  const getLink = yasr?.config?.getPlainQueryLinkToEndpoint;
  if (typeof getLink !== 'function') return {};
  let link: string | undefined;
  try {
    link = getLink();
  } catch (error) {
    console.warn('yasgui-plan-plugin: could not read the query link', error);
    return {};
  }
  if (!link) return {};
  const queryIndex = link.indexOf('?');
  if (queryIndex < 0) return { endpoint: link };
  const endpoint = link.slice(0, queryIndex);
  const params = new URLSearchParams(link.slice(queryIndex + 1));
  const query = params.get('query') ?? params.get('update') ?? undefined;
  return { query: query ?? undefined, endpoint };
}
