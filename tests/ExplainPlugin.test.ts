import ExplainPlugin from '../src/ExplainPlugin';
import type { PlanRequest, Yasr } from '../src/types';

const QLEVER = 'https://qlever.cs.uni-freiburg.de/api/olympics';

function makeYasr(
  options: {
    endpoint?: string;
    query?: string;
    executeQuery?: Yasr['executeQuery'];
    hostApi?: Yasr['hostApi'];
  } = {}
): Yasr {
  const endpoint = options.endpoint ?? QLEVER;
  const query = options.query ?? 'SELECT * WHERE { ?s ?p ?o } LIMIT 5';
  return {
    results: { res: { headers: new Headers() } },
    resultsEl: document.createElement('div'),
    plugins: {},
    config: {
      getPlainQueryLinkToEndpoint: () => `${endpoint}?query=${encodeURIComponent(query)}`,
    },
    getPrefixes: () => ({}),
    executeQuery: options.executeQuery,
    hostApi: options.hostApi,
  };
}

const qleverBody = JSON.stringify({
  runtimeInformation: {
    query_execution_tree: {
      description: 'INDEX SCAN ?s ?p ?o',
      operation_time: 12,
      total_time: 12,
      result_rows: 5,
      cache_status: 'computed',
      children: [],
    },
  },
});

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe('ExplainPlugin', () => {
  beforeEach(() => window.localStorage.clear());

  it('draws the algebra and asks the detected engine for the plan through the host', async () => {
    const executeQuery = jest.fn(async (_query: string, _options?: unknown) => ({
      status: 200,
      headers: { 'content-type': 'application/qlever-results+json' },
      content: qleverBody,
    }));
    const yasr = makeYasr({ executeQuery });
    const plugin = new ExplainPlugin(yasr);
    yasr.plugins = { Explain: plugin };
    expect(plugin.canHandleResults()).toBe(true);
    plugin.draw();
    await flush();

    expect(executeQuery).toHaveBeenCalledTimes(1);
    expect(executeQuery.mock.calls[0][0]).toBe('SELECT * WHERE { ?s ?p ?o } LIMIT 5');
    expect(executeQuery.mock.calls[0][1]).toMatchObject({
      acceptHeader: 'application/qlever-results+json',
    });

    const root = yasr.resultsEl.querySelector('.yasgui-explain-plugin')!;
    expect(root).not.toBeNull();
    const sections = root.querySelectorAll('.explain-section');
    expect(sections).toHaveLength(2);
    expect(sections[0].querySelector('.explain-section-status')!.textContent).toBe(
      'QLever · 1 operations'
    );
    expect(sections[0].querySelector('.explain-label')!.textContent).toBe('INDEX SCAN ?s ?p ?o');
    expect(sections[0].querySelector('.explain-rows')!.textContent).toBe('5 rows');
    expect(sections[0].querySelector('.explain-time')!.textContent).toBe('12.0 ms');
    expect(sections[1].querySelector('.explain-section-status')!.textContent).toBe('3 operations');
    expect(sections[1].querySelector('.explain-operator')!.textContent).toBe('slice');

    const select = root.querySelector('select')!;
    expect(select.value).toBe('auto');
    expect(select.options[0].textContent).toBe('Detect (QLever)');

    const download = plugin.download('results.json')!;
    expect(download.filename).toBe('results-explain.txt');
    expect(download.getData()).toContain('# Execution plan (QLever)');
    expect(download.getData()).toContain('(slice 0 5');
  });

  it('shows the algebra only, with a hint, when no engine is recognised', async () => {
    const executeQuery = jest.fn();
    const yasr = makeYasr({ endpoint: 'https://dbpedia.org/sparql', executeQuery });
    const plugin = new ExplainPlugin(yasr);
    plugin.draw();
    await flush();
    expect(executeQuery).not.toHaveBeenCalled();
    const text = yasr.resultsEl.querySelector('.explain-section .explain-message')!.textContent!;
    expect(text).toContain('No engine recognised');
    expect(yasr.resultsEl.querySelector('.explain-algebra')).not.toBeNull();
  });

  it('remembers the engine the user picks for the endpoint', async () => {
    const executeQuery = jest.fn(async (_query: string, _options?: unknown) => ({
      status: 200,
      content: 'plan text',
      headers: { 'content-type': 'text/plain' },
    }));
    const yasr = makeYasr({ endpoint: 'https://dbpedia.org/sparql', executeQuery });
    const plugin = new ExplainPlugin(yasr);
    plugin.draw();
    await flush();
    const select = yasr.resultsEl.querySelector('select')!;
    select.value = 'graphdb';
    select.dispatchEvent(new Event('change'));
    await flush();
    expect(executeQuery).toHaveBeenCalledTimes(1);
    expect(executeQuery.mock.calls[0][0]).toContain('FROM <http://www.ontotext.com/explain>');
    expect(yasr.resultsEl.querySelector('.explain-text')!.textContent).toBe('plan text');
    expect(JSON.parse(window.localStorage.getItem('yasgui-explain-plugin:engines')!)).toEqual({
      'https://dbpedia.org/sparql': 'graphdb',
    });

    // A fresh plugin on the same endpoint uses the stored choice
    const yasr2 = makeYasr({ endpoint: 'https://dbpedia.org/sparql', executeQuery });
    new ExplainPlugin(yasr2).draw();
    await flush();
    expect(executeQuery).toHaveBeenCalledTimes(2);
  });

  it('sends the request itself when the host cannot pass extra parameters', async () => {
    const fetchMock = jest.fn(async (_input: unknown, _init?: unknown) => ({
      status: 200,
      headers: { get: (name: string) => (name === 'content-type' ? 'text/html' : null) },
      text: async () => '<html>plan</html>',
    }));
    (window as any).fetch = fetchMock;
    const executeQuery = jest.fn();
    const yasr = makeYasr({
      endpoint: 'http://localhost:9999/blazegraph/sparql',
      executeQuery,
      hostApi: { version: 1, toolbar: false },
    });
    new ExplainPlugin(yasr).draw();
    await flush();
    expect(executeQuery).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://localhost:9999/blazegraph/sparql');
    expect(String(init.body)).toContain('explain=details');
    expect(yasr.resultsEl.querySelector('iframe.explain-frame')).not.toBeNull();
  });

  it('passes extra parameters and the endpoint through a host that supports them', async () => {
    const executeQuery = jest.fn(async (_query: string, _options?: unknown) => ({
      status: 200,
      content: 'Slice(offset=0)',
      headers: { 'content-type': 'text/plain' },
    }));
    const yasr = makeYasr({
      endpoint: 'http://localhost:5820/db/query',
      executeQuery,
      hostApi: { version: 2, queryRequest: true },
    });
    new ExplainPlugin(yasr).draw();
    await flush();
    expect(executeQuery.mock.calls[0][1]).toMatchObject({
      extraArgs: { profile: 'true' },
      endpoint: 'http://localhost:5820/db/explain',
    });
  });

  it('uses a custom request function and reports engine errors', async () => {
    const requestPlan = jest.fn(async (_request: PlanRequest) => ({
      status: 500,
      content: 'boom',
      headers: {},
    }));
    const yasr = makeYasr();
    const plugin = new ExplainPlugin(yasr, { requestPlan });
    plugin.draw();
    await flush();
    expect(requestPlan).toHaveBeenCalledTimes(1);
    const status = yasr.resultsEl.querySelector('.explain-section-status--error')!;
    expect(status.textContent).toBe('QLever: failed');
    expect(yasr.resultsEl.querySelector('.explain-message--error')!.textContent).toContain(
      'HTTP 500'
    );
  });

  it('reports syntax errors in the algebra section', async () => {
    const yasr = makeYasr({
      endpoint: 'https://dbpedia.org/sparql',
      query: 'SELECT * WHERE { ?s ?p }',
    });
    new ExplainPlugin(yasr).draw();
    await flush();
    const sections = yasr.resultsEl.querySelectorAll('.explain-section');
    expect(sections[1].querySelector('.explain-section-status')!.textContent).toBe('syntax error');
    expect(sections[1].querySelector('.explain-message--error')!.textContent).toContain(
      'Parse error'
    );
  });
});
