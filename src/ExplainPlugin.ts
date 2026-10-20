/**
 * YASGUI Explain plugin
 *
 * A YASR result view with two parts:
 * - the execution plan of the query, asked from the endpoint's engine with one
 *   background request after the query ran (QLever, GraphDB, Stardog,
 *   Blazegraph, Neptune), and
 * - the SPARQL algebra of the query, computed in the browser for any endpoint.
 */

import type {
  Engine,
  EngineChoice,
  ExplainPluginOptions,
  Plan,
  PlanRequest,
  PlanResponse,
  Yasr,
} from './types';
import { ENGINES, ENGINE_IDS, isEngineChoice, resolveEngine, type ResolvedEngine } from './engines';
import { getEngineChoice, setEngineChoice } from './settings';
import { getHostToolbar, hasHostExecuteQuery, hasHostRequestOptions, readQueryLink } from './host';
import { translate, AlgebraError, type Algebra } from './algebra/translate';
import { toSExpression, toTree, type AlgebraNode } from './algebra/print';
import type { Prefixes } from './algebra/terms';
import { icon } from './icons';
import {
  button,
  copyButton,
  countNodes,
  message,
  planTreeToText,
  renderAlgebraTree,
  renderPlan,
  section,
  type TreeHandle,
} from './render';

const DEFAULT_PREFIXES: Prefixes = {
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  owl: 'http://www.w3.org/2002/07/owl#',
};

interface PlanState {
  engine: Engine;
  key: string;
  status: 'loading' | 'done' | 'error';
  plan?: Plan;
  error?: string;
}

export class ExplainPlugin {
  priority = 1;
  label = 'Explain';
  helpReference = 'https://github.com/Matdata-eu/yasgui-explain-plugin#readme';

  private yasr: Yasr;
  private options: ExplainPluginOptions;
  private container: HTMLElement | null = null;
  private hostToolbarNodes: Element[] = [];
  private abortController: AbortController | null = null;
  /** Plans already fetched, by engine, endpoint and query */
  private planCache = new Map<string, Plan>();
  private planState: PlanState | null = null;
  private planSection: ReturnType<typeof section> | null = null;
  private algebra: Algebra | undefined;
  private algebraError: string | undefined;
  private algebraText: string | undefined;
  private query: string | undefined;
  private endpoint: string | undefined;

  constructor(yasr: Yasr, options: ExplainPluginOptions = {}) {
    this.yasr = yasr;
    this.options = options;
  }

  /** Change options after construction; the next draw uses them */
  setOptions(options: Partial<ExplainPluginOptions>): void {
    this.options = { ...this.options, ...options };
  }

  static get label(): string {
    return 'Explain';
  }

  static get priority(): number {
    return 1;
  }

  getIcon(): Element | undefined {
    const el = icon('list-tree', 18);
    el.setAttribute('aria-label', 'Explain view');
    return el;
  }

  /** The view is useful for any response, including failed ones: the algebra never needs results */
  canHandleResults(): boolean {
    return !!this.yasr.results;
  }

  private getPluginName(): string {
    const plugins = this.yasr.plugins || {};
    for (const [name, plugin] of Object.entries(plugins)) if (plugin === this) return name;
    return 'Explain';
  }

  private getOptions(): ExplainPluginOptions {
    const dynamic = this.yasr.config?.plugins?.[this.getPluginName()]?.dynamicConfig;
    return {
      ...this.options,
      ...(dynamic && typeof dynamic === 'object' ? (dynamic as ExplainPluginOptions) : {}),
    };
  }

  /** The prefixes of the query (and of the host), with the usual RDF ones as a fallback */
  private getPrefixes(): Prefixes {
    let known: Prefixes = {};
    try {
      if (typeof this.yasr.getPrefixes === 'function') known = this.yasr.getPrefixes() || {};
      else {
        const prefixes = this.yasr.config?.prefixes;
        if (typeof prefixes === 'function') known = prefixes() || {};
        else if (prefixes && typeof prefixes === 'object') known = prefixes;
      }
    } catch {
      // no prefixes then
    }
    return { ...DEFAULT_PREFIXES, ...known };
  }

  private readQueryAndEndpoint(options: ExplainPluginOptions): void {
    const link = readQueryLink(this.yasr);
    this.query = (options.getQuery ? options.getQuery() : undefined) ?? link.query;
    this.endpoint = (options.getEndpoint ? options.getEndpoint() : undefined) ?? link.endpoint;
  }

  private serverHeader(): string | null {
    try {
      const headers = this.yasr.results?.res?.headers ?? this.yasr.results?.getHeaders?.();
      if (headers && typeof headers.get === 'function') return headers.get('server');
      if (headers && typeof headers === 'object') return headers.server ?? headers.Server ?? null;
    } catch {
      // headers not exposed
    }
    return null;
  }

  private resolveEngine(options: ExplainPluginOptions): ResolvedEngine {
    const stored = getEngineChoice(this.endpoint);
    return resolveEngine(stored, this.endpoint, this.serverHeader(), options.engine);
  }

  draw(): void {
    this.cleanup();
    const options = this.getOptions();
    this.readQueryAndEndpoint(options);

    const wrapper = document.createElement('div');
    wrapper.className = 'yasgui-explain-plugin';
    this.container = wrapper;

    const resolved = this.resolveEngine(options);
    this.drawToolbar(wrapper, options, resolved);

    // Execution plan
    this.planSection = section('Execution plan');
    wrapper.appendChild(this.planSection.root);
    this.drawPlanSection(options, resolved);

    // Algebra
    wrapper.appendChild(this.drawAlgebraSection(options));

    this.yasr.resultsEl.appendChild(wrapper);
  }

  private drawToolbar(
    wrapper: HTMLElement,
    options: ExplainPluginOptions,
    resolved: ResolvedEngine
  ): void {
    const slot = getHostToolbar(this.yasr);
    const host = !!slot;
    const nodes: Element[] = [];

    const engineLabel = document.createElement('label');
    engineLabel.className = host ? 'yasr_toolbarSelect' : 'explain-field';
    const engineText = document.createElement('span');
    engineText.textContent = 'Engine';
    const select = document.createElement('select');
    select.className = host ? '' : 'explain-select';
    select.setAttribute('aria-label', 'Engine of the endpoint');
    const addOption = (value: EngineChoice, text: string) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      select.appendChild(option);
    };
    const detected =
      resolved.source === 'detected' && resolved.engine ? ` (${resolved.engine.label})` : '';
    addOption('auto', `Detect${detected}`);
    for (const id of options.engines || ENGINE_IDS)
      if (ENGINES[id]) addOption(id, ENGINES[id].label);
    addOption('none', 'No plan');
    const stored =
      options.engine && options.engine !== 'auto' ? options.engine : getEngineChoice(this.endpoint);
    select.value = isEngineChoice(stored) ? stored : 'auto';
    select.disabled = !!options.engine && options.engine !== 'auto';
    select.addEventListener('change', () => {
      const choice = select.value;
      if (!isEngineChoice(choice)) return;
      setEngineChoice(this.endpoint, choice);
      this.draw();
    });
    engineLabel.append(engineText, select);
    nodes.push(engineLabel);

    const refresh = button(
      'Refresh plan',
      'rotate-ccw',
      () => {
        if (this.planState) this.planCache.delete(this.planState.key);
        this.draw();
      },
      'Ask the engine for the plan again'
    );
    if (host) refresh.className = 'yasr_toolbarButton';
    refresh.disabled = !resolved.engine;
    nodes.push(refresh);

    if (slot) {
      for (const node of nodes) slot.appendChild(node);
      this.hostToolbarNodes = nodes;
    } else {
      const toolbar = document.createElement('div');
      toolbar.className = 'explain-toolbar';
      for (const node of nodes) toolbar.appendChild(node);
      wrapper.appendChild(toolbar);
    }
  }

  private drawPlanSection(options: ExplainPluginOptions, resolved: ResolvedEngine): void {
    const planSection = this.planSection;
    if (!planSection) return;
    planSection.body.replaceChildren();
    planSection.actions.replaceChildren();
    this.planState = null;

    if (!resolved.engine) {
      planSection.setStatus('');
      planSection.body.appendChild(
        message(
          resolved.source === 'none'
            ? 'No engine recognised for this endpoint. Pick it in the Engine list when it is QLever, GraphDB, Stardog, Blazegraph or Neptune; other engines publish no plan over the SPARQL protocol.'
            : 'No plan is asked for this endpoint. Pick an engine in the Engine list to fetch one.'
        )
      );
      return;
    }
    if (!this.query || !this.endpoint) {
      planSection.setStatus('');
      planSection.body.appendChild(
        message('The plugin cannot read the query and the endpoint of this tab.')
      );
      return;
    }
    const engine = resolved.engine;
    const key = `${engine.id}\n${this.endpoint}\n${this.query}`;
    planSection.setStatus(engine.label);
    const cached = this.planCache.get(key);
    if (cached) {
      this.showPlan({ engine, key, status: 'done', plan: cached });
      return;
    }
    if (options.autoFetch === false) {
      this.planState = { engine, key, status: 'error' };
      planSection.body.appendChild(
        message(`Press "Refresh plan" to ask ${engine.label} for the plan.`)
      );
      return;
    }
    void this.fetchPlan(engine, key);
  }

  private async fetchPlan(engine: Engine, key: string): Promise<void> {
    const planSection = this.planSection;
    if (!planSection || !this.query || !this.endpoint) return;
    this.abortController?.abort();
    const controller = new AbortController();
    this.abortController = controller;
    this.planState = { engine, key, status: 'loading' };
    planSection.body.replaceChildren(message(`Asking ${engine.label} for the plan…`, 'info'));
    let request: PlanRequest;
    try {
      request = engine.buildRequest(this.query, this.endpoint);
    } catch (error) {
      this.showPlan({
        engine,
        key,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    try {
      const response = await this.runRequest(engine, request, controller.signal);
      if (controller.signal.aborted) return;
      const { body, contentType, status } = await readResponse(response);
      if (status !== undefined && status >= 400) {
        const where = request.endpoint ? ` from ${request.endpoint}` : '';
        const hint =
          status === 404 && request.endpoint
            ? ' The server does not expose this explain URL; a proxy in front of the endpoint may only forward queries.'
            : '';
        throw new Error(
          `HTTP ${status}${where}${body ? `: ${body.slice(0, 500)}` : ''}.${hint}`.replace(
            '..',
            '.'
          )
        );
      }
      const plan = engine.parse(body, contentType);
      this.planCache.set(key, plan);
      if (controller.signal.aborted) return;
      this.showPlan({ engine, key, status: 'done', plan });
    } catch (error) {
      if (controller.signal.aborted) return;
      const text = error instanceof Error ? error.message : String(error);
      this.showPlan({ engine, key, status: 'error', error: text });
    } finally {
      if (this.abortController === controller) this.abortController = null;
    }
  }

  /** Send the plan request through the host (with the tab's settings) or, failing that, directly */
  private async runRequest(
    engine: Engine,
    request: PlanRequest,
    signal: AbortSignal
  ): Promise<PlanResponse> {
    const custom = this.getOptions().requestPlan;
    if (custom) return custom(request, signal);
    // The host runs the request with the tab's authentication and settings. Hosts without
    // `queryRequest` drop `extraArgs` and `endpoint`: fine when the engine only prefers them.
    if (
      hasHostExecuteQuery(this.yasr) &&
      (!engine.needsRequestOptions || hasHostRequestOptions(this.yasr))
    ) {
      return this.yasr.executeQuery!(request.query, {
        acceptHeader: request.accept,
        signal,
        extraArgs: request.extraArgs,
        endpoint: request.endpoint,
      });
    }
    // Plain fetch: no authentication or custom headers of the tab
    const url = request.endpoint || this.endpoint!;
    const params = new URLSearchParams();
    params.set('query', request.query);
    for (const [name, value] of Object.entries(request.extraArgs || {})) params.set(name, value);
    const response = await fetch(url, {
      method: 'POST',
      headers: { Accept: request.accept, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal,
      mode: 'cors',
    });
    const content = await response.text();
    return { status: response.status, headers: response.headers, content };
  }

  private showPlan(state: PlanState): void {
    const planSection = this.planSection;
    if (!planSection) return;
    this.planState = state;
    planSection.body.replaceChildren();
    planSection.actions.replaceChildren();
    if (state.status === 'error' || !state.plan) {
      planSection.setStatus(`${state.engine.label}: failed`, 'error');
      planSection.body.appendChild(message(state.error || 'No plan.', 'error'));
      planSection.body.appendChild(message(state.engine.description));
      return;
    }
    const rendered = renderPlan(state.plan);
    const count = state.plan.kind === 'tree' ? countNodes(state.plan.root) : undefined;
    planSection.setStatus(
      count !== undefined ? `${state.engine.label} · ${count} operations` : state.engine.label
    );
    if (rendered.tree) this.addTreeActions(planSection.actions, rendered.tree);
    if (rendered.text !== undefined && state.plan.kind !== 'html') {
      planSection.actions.appendChild(copyButton(() => rendered.text || ''));
    }
    planSection.body.appendChild(rendered.root);
  }

  private addTreeActions(actions: HTMLElement, tree: TreeHandle): void {
    actions.appendChild(button('Expand all', 'unfold-vertical', () => tree.expandAll()));
    actions.appendChild(button('Collapse all', 'fold-vertical', () => tree.collapseAll()));
  }

  private drawAlgebraSection(options: ExplainPluginOptions): HTMLElement {
    const algebraSection = section('Algebra');
    this.algebra = undefined;
    this.algebraError = undefined;
    this.algebraText = undefined;
    if (!this.query) {
      algebraSection.body.appendChild(message('The plugin cannot read the query of this tab.'));
      return algebraSection.root;
    }
    const prefixes = this.getPrefixes();
    let tree: AlgebraNode;
    try {
      this.algebra = translate(this.query, { baseIRI: options.baseIRI });
      tree = toTree(this.algebra, prefixes);
      this.algebraText = toSExpression(this.algebra, prefixes);
    } catch (error) {
      this.algebraError = error instanceof AlgebraError ? error.message : String(error);
      algebraSection.setStatus('syntax error', 'error');
      algebraSection.body.appendChild(message(this.algebraError, 'error'));
      return algebraSection.root;
    }
    algebraSection.setStatus(`${countNodes(tree)} operations`);
    const handle = renderAlgebraTree(tree);
    this.addTreeActions(algebraSection.actions, handle);
    algebraSection.actions.appendChild(copyButton(() => this.algebraText || '', 'Copy'));
    algebraSection.body.appendChild(handle.root);
    return algebraSection.root;
  }

  /** YASR's download button saves the plan and the algebra as text */
  download(filename?: string) {
    const parts: string[] = [];
    if (this.planState?.plan) {
      parts.push(`# Execution plan (${this.planState.engine.label})`, '');
      const plan = this.planState.plan;
      parts.push(
        plan.kind === 'tree'
          ? planTreeToText(plan.root, plan.summary)
          : plan.kind === 'text'
            ? plan.text
            : plan.html
      );
      parts.push('');
    }
    if (this.algebraText) parts.push('# Algebra', '', this.algebraText, '');
    if (parts.length === 0) return undefined;
    const base = (filename || 'query').replace(/\.[a-z0-9]+$/i, '');
    return {
      getData: () => parts.join('\n'),
      contentType: 'text/plain',
      filename: `${base}-explain.txt`,
      title: 'Download the plan and the algebra',
    };
  }

  private cleanup(): void {
    this.abortController?.abort();
    this.abortController = null;
    for (const node of this.hostToolbarNodes) node.remove();
    this.hostToolbarNodes = [];
    this.container?.remove();
    this.container = null;
    this.planSection = null;
  }

  destroy(): void {
    this.cleanup();
    this.planCache.clear();
  }
}

async function readResponse(
  response: PlanResponse
): Promise<{ body: string; contentType: string | undefined; status: number | undefined }> {
  let body: string | undefined =
    typeof response?.content === 'string' ? response.content : undefined;
  if (body === undefined && typeof response?.data === 'string') body = response.data;
  if (body === undefined && typeof response?.text === 'function') body = await response.text();
  if (body === undefined && response && typeof response === 'object' && !('status' in response))
    body = JSON.stringify(response);
  let contentType: string | undefined;
  const headers: any = response?.headers;
  if (headers && typeof headers.get === 'function')
    contentType = headers.get('content-type') || undefined;
  else if (headers && typeof headers === 'object')
    contentType = headers['content-type'] || headers['Content-Type'];
  return { body: body ?? '', contentType, status: response?.status };
}

export default ExplainPlugin;
