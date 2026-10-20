import { detectEngine, resolveEngine, ENGINES } from '../../src/engines';
import { parseQleverResponse } from '../../src/engines/qlever';
import { addExplainGraph, findWhereOffset, parseGraphdbResponse } from '../../src/engines/graphdb';
import { explainUrl, parseStardogResponse } from '../../src/engines/stardog';
import { parseBlazegraphResponse } from '../../src/engines/blazegraph';
import { parseNeptuneResponse } from '../../src/engines/neptune';

describe('detectEngine', () => {
  it('recognises engines from the endpoint URL', () => {
    expect(detectEngine('https://qlever.cs.uni-freiburg.de/api/wikidata')).toBe('qlever');
    expect(detectEngine('http://localhost:7200/repositories/test')).toBe('graphdb');
    expect(detectEngine('https://graphdb.example.org/repositories/x')).toBe('graphdb');
    expect(detectEngine('http://localhost:9999/blazegraph/namespace/kb/sparql')).toBe('blazegraph');
    expect(detectEngine('http://localhost:9999/bigdata/sparql')).toBe('blazegraph');
    expect(detectEngine('http://localhost:5820/mydb/query')).toBe('stardog');
    expect(detectEngine('https://stardog.example.org/mydb/query')).toBe('stardog');
    expect(
      detectEngine('https://db-1.cluster-abc.eu-west-1.neptune.amazonaws.com:8182/sparql')
    ).toBe('neptune');
    expect(detectEngine('https://query.wikidata.org/sparql')).toBeUndefined();
    expect(detectEngine('https://dbpedia.org/sparql')).toBeUndefined();
    expect(detectEngine(undefined)).toBeUndefined();
    expect(detectEngine('not a url')).toBeUndefined();
  });

  it('prefers the Server header', () => {
    expect(detectEngine('https://dbpedia.org/sparql', 'QLever')).toBe('qlever');
  });
});

describe('resolveEngine', () => {
  it('uses the stored choice, the forced option, or detection', () => {
    expect(resolveEngine('auto', 'https://qlever.cs.uni-freiburg.de/api/osm')).toEqual({
      engine: ENGINES.qlever,
      source: 'detected',
    });
    expect(resolveEngine('graphdb', 'https://qlever.cs.uni-freiburg.de/api/osm').engine).toBe(
      ENGINES.graphdb
    );
    expect(
      resolveEngine('none', 'https://qlever.cs.uni-freiburg.de/api/osm').engine
    ).toBeUndefined();
    expect(resolveEngine('auto', 'https://dbpedia.org/sparql')).toEqual({
      engine: undefined,
      source: 'none',
    });
    expect(resolveEngine('qlever', 'https://x', null, 'stardog')).toEqual({
      engine: ENGINES.stardog,
      source: 'forced',
    });
  });
});

describe('QLever', () => {
  const response = {
    status: 'OK',
    resultsize: 2,
    runtimeInformation: {
      meta: { time_query_planning: 3, total_time_computing: 40, total_time: 44 },
      query_execution_tree: {
        description: 'JOIN on ?s',
        operation_time: 30,
        total_time: 40,
        result_rows: 2,
        column_names: ['?s', '?o'],
        cache_status: 'computed',
        status: 'fully materialized',
        estimated_size: 5,
        details: {},
        children: [
          {
            description: 'INDEX SCAN ?s <p> ?o',
            operation_time: 0,
            total_time: 10,
            result_rows: 100,
            cache_status: 'cached_not_pinned',
            details: { original_operation_time: 10 },
            children: [],
          },
        ],
      },
    },
  };

  it('parses the execution tree with times, rows and cache status', () => {
    const plan = parseQleverResponse(JSON.stringify(response));
    expect(plan.kind).toBe('tree');
    if (plan.kind !== 'tree') return;
    expect(plan.summary).toEqual([
      'Query planning: 3 ms',
      'Computing: 40 ms',
      'Total: 44 ms',
      'Result size: 2 rows',
    ]);
    expect(plan.root.label).toBe('JOIN on ?s');
    expect(plan.root.timeMs).toBe(30);
    expect(plan.root.totalMs).toBe(40);
    expect(plan.root.rows).toBe(2);
    expect(plan.root.columns).toEqual(['?s', '?o']);
    expect(plan.root.cached).toBe(false);
    expect(plan.root.details).toEqual(['estimated size: 5']);
    const child = plan.root.children[0];
    expect(child.cached).toBe(true);
    expect(child.details).toEqual(['cache: cached not pinned', 'original operation time: 10']);
  });

  it('accepts the older shape where the tree is the runtime information itself', () => {
    const plan = parseQleverResponse(
      JSON.stringify({
        runtimeInformation: {
          description: 'SCAN',
          operation_time: 1,
          was_cached: true,
          children: [],
        },
      })
    );
    if (plan.kind !== 'tree') throw new Error('expected a tree');
    expect(plan.root.label).toBe('SCAN');
    expect(plan.root.cached).toBe(true);
  });

  it('explains what went wrong', () => {
    expect(() => parseQleverResponse('<html>')).toThrow('did not return JSON');
    expect(() => parseQleverResponse('{"head":{"vars":[]}}')).toThrow('no runtime information');
    expect(() => parseQleverResponse('{"status":"ERROR","exception":"boom"}')).toThrow('boom');
  });

  it('asks for a single row and the QLever media type', () => {
    const request = ENGINES.qlever.buildRequest('SELECT * { ?s ?p ?o }', 'https://x');
    expect(request.accept).toBe('application/qlever-results+json');
    expect(request.extraArgs).toEqual({ send: '1' });
  });
});

describe('GraphDB', () => {
  it('adds the explain graph before WHERE', () => {
    expect(addExplainGraph('SELECT * WHERE { ?s ?p ?o }')).toBe(
      'SELECT * FROM <http://www.ontotext.com/explain> WHERE { ?s ?p ?o }'
    );
    expect(
      addExplainGraph('PREFIX ex: <http://e/where> SELECT ?s\nWHERE {\n ?s ex:p "where" }')
    ).toBe(
      'PREFIX ex: <http://e/where> SELECT ?s\nFROM <http://www.ontotext.com/explain> WHERE {\n ?s ex:p "where" }'
    );
    expect(addExplainGraph('# where is it\nSELECT * { ?s ?p ?o }')).toBe(
      '# where is it\nSELECT * FROM <http://www.ontotext.com/explain> { ?s ?p ?o }'
    );
    expect(addExplainGraph('CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }')).toBe(
      'CONSTRUCT { ?s ?p ?o } FROM <http://www.ontotext.com/explain> WHERE { ?s ?p ?o }'
    );
    expect(addExplainGraph('CONSTRUCT { ?s ?p ?o } { ?s ?p ?o }')).toBe(
      'CONSTRUCT { ?s ?p ?o } FROM <http://www.ontotext.com/explain> { ?s ?p ?o }'
    );
    expect(addExplainGraph('SELECT * FROM <http://g> WHERE { ?s ?p ?o }')).toBe(
      'SELECT * FROM <http://g> FROM <http://www.ontotext.com/explain> WHERE { ?s ?p ?o }'
    );
    expect(findWhereOffset('ASK { ?s ?p ?o }')).toBe(4);
    expect(() => addExplainGraph('INSERT DATA { <a> <b> <c> }')).toThrow('WHERE');
  });

  it('returns the text plan, unwrapping a JSON result when needed', () => {
    expect(parseGraphdbResponse('{ plan }', 'text/plain')).toEqual({
      kind: 'text',
      text: '{ plan }',
    });
    const json = JSON.stringify({
      head: { vars: ['plan'] },
      results: { bindings: [{ plan: { value: 'line 1' } }, { plan: { value: 'line 2' } }] },
    });
    expect(parseGraphdbResponse(json, 'application/sparql-results+json')).toEqual({
      kind: 'text',
      text: 'line 1\nline 2',
    });
    expect(() =>
      parseGraphdbResponse('<?xml version="1.0"?><sparql/>', 'application/sparql-results+xml')
    ).toThrow('RDF4J');
  });
});

describe('Stardog', () => {
  it('derives the explain URL from the query URL', () => {
    expect(explainUrl('http://localhost:5820/mydb/query')).toBe(
      'http://localhost:5820/mydb/explain'
    );
    expect(explainUrl('http://localhost:5820/mydb/query/')).toBe(
      'http://localhost:5820/mydb/explain'
    );
    expect(explainUrl('http://localhost:5820/mydb')).toBe('http://localhost:5820/mydb/explain');
    expect(explainUrl('http://localhost:5820/mydb/query?reasoning=true')).toBe(
      'http://localhost:5820/mydb/explain?reasoning=true'
    );
  });

  it('asks for a profiled plan on the explain endpoint', () => {
    const request = ENGINES.stardog.buildRequest(
      'SELECT * { ?s ?p ?o }',
      'http://localhost:5820/mydb/query'
    );
    expect(request.endpoint).toBe('http://localhost:5820/mydb/explain');
    expect(request.extraArgs).toEqual({ profile: 'true' });
  });

  it('returns the text plan and reports JSON errors', () => {
    expect(parseStardogResponse('Slice(offset=0)')).toEqual({
      kind: 'text',
      text: 'Slice(offset=0)',
    });
    expect(() => parseStardogResponse('{"message":"no such db"}')).toThrow('no such db');
  });
});

describe('Blazegraph and Neptune', () => {
  it('keeps the HTML explain page and rejects results', () => {
    expect(parseBlazegraphResponse('<html><body>plan</body></html>', 'text/html')).toEqual({
      kind: 'html',
      html: '<html><body>plan</body></html>',
    });
    expect(() =>
      parseBlazegraphResponse('<?xml version="1.0"?><sparql/>', 'application/sparql-results+xml')
    ).toThrow('results instead');
    expect(ENGINES.blazegraph.buildRequest('q', 'e').extraArgs).toEqual({ explain: 'details' });
  });

  it('keeps the Neptune text table and reports errors', () => {
    expect(parseNeptuneResponse('╔═══╗\n║ ID ║', 'text/plain')).toEqual({
      kind: 'text',
      text: '╔═══╗\n║ ID ║',
    });
    expect(() => parseNeptuneResponse('{"detailedMessage":"bad"}', 'application/json')).toThrow(
      'bad'
    );
    expect(ENGINES.neptune.buildRequest('q', 'e').extraArgs).toEqual({ explain: 'details' });
  });
});
