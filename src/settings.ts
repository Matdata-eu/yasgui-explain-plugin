/**
 * The engine chosen per endpoint, remembered in localStorage so the choice
 * survives new tabs and reloads. Storage can be unavailable (private windows,
 * blocked site data): every access is guarded.
 */

import type { EngineChoice } from './types';
import { isEngineChoice } from './engines';

const STORAGE_KEY = 'yasgui-plan-plugin:engines';

function readAll(): Record<string, EngineChoice> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const result: Record<string, EngineChoice> = {};
    for (const [endpoint, choice] of Object.entries(parsed)) {
      if (isEngineChoice(choice)) result[endpoint] = choice;
    }
    return result;
  } catch {
    return {};
  }
}

/** The stored engine choice of an endpoint, "auto" when none was stored */
export function getEngineChoice(endpoint: string | undefined): EngineChoice {
  if (!endpoint) return 'auto';
  return readAll()[normalize(endpoint)] ?? 'auto';
}

/** Remember the engine choice of an endpoint ("auto" forgets it) */
export function setEngineChoice(endpoint: string | undefined, choice: EngineChoice): void {
  if (!endpoint) return;
  try {
    const all = readAll();
    if (choice === 'auto') delete all[normalize(endpoint)];
    else all[normalize(endpoint)] = choice;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // storage unavailable: the choice lasts for this view only
  }
}

function normalize(endpoint: string): string {
  return endpoint.trim().replace(/\/+$/, '');
}
