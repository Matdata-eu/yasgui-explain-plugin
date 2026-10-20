/**
 * Shared types for the YASGUI Explain plugin
 */

/** Options for a background request run through `yasr.executeQuery` */
export interface PluginQueryOptions {
  /** Custom Accept header for the request */
  acceptHeader?: string;
  /** Abort signal for cancelling an in-flight request */
  signal?: AbortSignal;
  /**
   * Extra request parameters, sent next to `query` (MatGUI host API 2 and later).
   * Older hosts ignore them: check `yasr.hostApi.queryRequest` first.
   */
  extraArgs?: Record<string, string | string[]>;
  /** Send the request to this URL instead of the tab's endpoint (MatGUI host API 2 and later) */
  endpoint?: string;
}

/**
 * Features a YASR host offers to plugins (MatGUI yasr host API).
 * Absent on older YASR versions: plugins feature-detect it, never a version string.
 */
export interface YasrHostApi {
  version: number;
  /** `yasr.describe()` opens the shared describe panel */
  describe?: boolean;
  /** `yasr.getPluginToolbar()` returns the shared toolbar slot */
  toolbar?: boolean;
  /** `yasr.executeQuery()` honours `extraArgs` and `endpoint` */
  queryRequest?: boolean;
}

/** The parts of a YASR instance the plugin uses */
export interface Yasr {
  results: any;
  resultsEl: HTMLElement;
  plugins?: Record<string, unknown>;
  config?: {
    plugins?: Record<string, { dynamicConfig?: unknown } | undefined>;
    /** A link to the endpoint carrying the current query as `query` parameter (MatGUI) */
    getPlainQueryLinkToEndpoint?: () => string | undefined;
    prefixes?: Record<string, string> | (() => Record<string, string>);
  };
  getPrefixes?: () => Record<string, string>;
  storePluginConfig?: (pluginName: string, conf: unknown) => void;
  executeQuery?: (query: string, options?: PluginQueryOptions) => Promise<any>;
  hostApi?: YasrHostApi;
  getPluginToolbar?: () => HTMLDivElement;
}

/** The identifiers of the engines the plugin can ask for a plan */
export type EngineId = 'qlever' | 'graphdb' | 'stardog' | 'blazegraph' | 'neptune';

/** The engine setting of an endpoint: detect it, one of the engines, or no plan at all */
export type EngineChoice = 'auto' | EngineId | 'none';

/** One operation of an execution plan tree */
export interface PlanNode {
  /** What the operation does, e.g. "Join on ?s" or "IndexScan ?s <p> ?o" */
  label: string;
  /** Extra lines about the operation (estimates, cache, details) */
  details?: string[];
  /** Rows the operation produced */
  rows?: number;
  /** Columns of the result */
  columns?: string[];
  /** Time spent in this operation alone, in milliseconds */
  timeMs?: number;
  /** Time spent in this operation and its children, in milliseconds */
  totalMs?: number;
  /** The result came from the engine's cache */
  cached?: boolean;
  /** Status reported by the engine, e.g. "completed" or "not started" */
  status?: string;
  children: PlanNode[];
}

/** An execution plan as returned by an engine */
export type Plan =
  | {
      kind: 'tree';
      root: PlanNode;
      /** Summary lines shown above the tree (planning time, total time, ...) */
      summary?: string[];
    }
  | { kind: 'text'; text: string }
  | { kind: 'html'; html: string };

/** A request for a plan, run against the tab's endpoint with its settings */
export interface PlanRequest {
  /** The query to send; usually the user's query, sometimes rewritten (GraphDB) */
  query: string;
  /** Accept header */
  accept: string;
  /** Extra parameters sent next to the query */
  extraArgs?: Record<string, string>;
  /** Send to this URL instead of the endpoint */
  endpoint?: string;
}

/** The raw response of a plan request, in the shape yasqe returns */
export interface PlanResponse {
  status?: number;
  headers?: { get(name: string): string | null } | Record<string, string>;
  content?: string;
  data?: string;
  text?: () => Promise<string>;
}

/** Everything the plugin knows about one engine */
export interface Engine {
  id: EngineId;
  label: string;
  /** One line telling the user what the engine returns */
  description: string;
  /** Whether the request needs `extraArgs` or `endpoint` support from the host */
  needsRequestOptions: boolean;
  /** Build the request that returns the plan of `query` on `endpoint` */
  buildRequest(query: string, endpoint: string): PlanRequest;
  /** Turn the response into a plan, or throw an Error that says what went wrong */
  parse(body: string, contentType: string | undefined): Plan;
}

/** Options accepted by the plugin constructor and by `yasr.config.plugins.Explain.dynamicConfig` */
export interface ExplainPluginOptions {
  /** Read the current query text; by default it is taken from the host's query link */
  getQuery?: () => string | undefined;
  /** Read the endpoint URL; by default it is taken from the host's query link */
  getEndpoint?: () => string | undefined;
  /** Fetch the engine plan as soon as the view is drawn (default true) */
  autoFetch?: boolean;
  /** Engines to offer, in order; default all */
  engines?: EngineId[];
  /** Force an engine for every endpoint (skips detection and the stored choice) */
  engine?: EngineChoice;
  /** Base IRI used to resolve relative IRIs when computing the algebra */
  baseIRI?: string;
  /**
   * Send a plan request yourself instead of the host or a plain fetch, for
   * example to add headers or to serve recorded responses in a demo.
   */
  requestPlan?: (request: PlanRequest, signal: AbortSignal) => Promise<PlanResponse>;
}
