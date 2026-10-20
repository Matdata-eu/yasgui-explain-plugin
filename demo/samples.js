/**
 * Recorded plans, so the demo works without an endpoint. The shapes follow
 * what the engines return; the numbers are illustrative.
 */

const olympicsQuery = `PREFIX olympics: <http://wallscope.co.uk/ontology/olympics/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT ?athlete ?name (COUNT(?medal) AS ?golds) WHERE {
  ?medal olympics:athlete ?athlete ;
         olympics:medal <http://wallscope.co.uk/resource/olympics/medal/Gold> .
  ?athlete rdfs:label ?name .
}
GROUP BY ?athlete ?name
ORDER BY DESC(?golds)
LIMIT 20`;

const qleverResponse = {
  query: olympicsQuery,
  status: 'OK',
  resultsize: 20,
  warnings: [],
  selected: ['?athlete', '?name', '?golds'],
  res: [],
  runtimeInformation: {
    meta: { time_query_planning: 2, total_time_computing: 184, total_time: 189 },
    query_execution_tree: {
      description: 'LIMIT 20 OFFSET 0',
      operation_time: 0,
      total_time: 184,
      result_rows: 20,
      result_cols: 3,
      column_names: ['?athlete', '?name', '?golds'],
      cache_status: 'computed',
      status: 'fully materialized',
      estimated_size: 20,
      estimated_operation_cost: 180000,
      details: {},
      children: [
        {
          description: 'OrderBy on DESC(?golds)',
          operation_time: 31,
          total_time: 184,
          result_rows: 68543,
          result_cols: 3,
          column_names: ['?athlete', '?name', '?golds'],
          cache_status: 'computed',
          status: 'fully materialized',
          estimated_size: 68543,
          estimated_operation_cost: 179980,
          details: {},
          children: [
            {
              description: 'GroupBy on ?athlete ?name with COUNT(?medal) AS ?golds',
              operation_time: 42,
              total_time: 153,
              result_rows: 68543,
              result_cols: 3,
              column_names: ['?athlete', '?name', '?golds'],
              cache_status: 'computed',
              status: 'fully materialized',
              estimated_size: 68543,
              estimated_operation_cost: 110000,
              details: {},
              children: [
                {
                  description: 'JOIN on ?athlete',
                  operation_time: 87,
                  total_time: 111,
                  result_rows: 213925,
                  result_cols: 3,
                  column_names: ['?athlete', '?medal', '?name'],
                  cache_status: 'computed',
                  status: 'fully materialized',
                  estimated_size: 200000,
                  estimated_operation_cost: 70000,
                  details: {},
                  children: [
                    {
                      description: 'JOIN on ?medal',
                      operation_time: 0,
                      total_time: 18,
                      result_rows: 13295,
                      result_cols: 2,
                      column_names: ['?medal', '?athlete'],
                      cache_status: 'cached_not_pinned',
                      status: 'fully materialized',
                      estimated_size: 13000,
                      estimated_operation_cost: 20000,
                      details: { original_operation_time: 11, original_total_time: 18 },
                      children: [
                        {
                          description:
                            'INDEX SCAN ?medal olympics:medal <http://wallscope.co.uk/resource/olympics/medal/Gold>',
                          operation_time: 0,
                          total_time: 3,
                          result_rows: 13295,
                          result_cols: 1,
                          column_names: ['?medal'],
                          cache_status: 'ancestor_cached',
                          status: 'fully materialized',
                          estimated_size: 13295,
                          estimated_operation_cost: 13295,
                          details: { original_operation_time: 3, original_total_time: 3 },
                          children: [],
                        },
                        {
                          description: 'INDEX SCAN ?medal olympics:athlete ?athlete',
                          operation_time: 0,
                          total_time: 4,
                          result_rows: 271116,
                          result_cols: 2,
                          column_names: ['?medal', '?athlete'],
                          cache_status: 'ancestor_cached',
                          status: 'fully materialized',
                          estimated_size: 271116,
                          estimated_operation_cost: 271116,
                          details: { original_operation_time: 4, original_total_time: 4 },
                          children: [],
                        },
                      ],
                    },
                    {
                      description: 'INDEX SCAN ?athlete rdfs:label ?name',
                      operation_time: 6,
                      total_time: 6,
                      result_rows: 135571,
                      result_cols: 2,
                      column_names: ['?athlete', '?name'],
                      cache_status: 'computed',
                      status: 'fully materialized',
                      estimated_size: 135571,
                      estimated_operation_cost: 135571,
                      details: {},
                      children: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  },
  time: { total: '189ms', computeResult: '184ms' },
};

const graphdbQuery = `PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX schema: <https://schema.org/>

SELECT ?person ?name WHERE {
  ?person a schema:Person ;
          schema:name ?name ;
          schema:birthPlace ?place .
  ?place schema:name "Ghent" .
}
LIMIT 50`;

const graphdbPlan = `# Note: The following plan is the ESTIMATED execution plan for the query
{
    # ----- Begin optimization group 1 -----

    ?place <https://schema.org/name> "Ghent" . # Cost: 1.0, Cardinality: 3.0
    ?person <https://schema.org/birthPlace> ?place . # Cost: 820.0, Cardinality: 820.0
    ?person <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://schema.org/Person> . # Cost: 820.0, Cardinality: 812.0
    ?person <https://schema.org/name> ?name . # Cost: 812.0, Cardinality: 812.0

    # ----- End optimization group 1 -----
}
# Cost: 2453.0, Cardinality: 812.0
# Execution plan took 1 ms`;

const stardogQuery = `PREFIX : <http://example.org/>

SELECT ?s ?label WHERE {
  ?s a :Product ;
     :label ?label ;
     :price ?price .
  FILTER(?price > 100)
}
ORDER BY ?label
LIMIT 10`;

const stardogPlan = `prefix : <http://example.org/>

From local
Slice(offset=0, limit=10) [#10], results: 10, wall time: 0 ms (0.0%), memory: 0 B
\`─ OrderBy(?label) [#1.2K], results: 1234, wall time: 12 ms (14.5%), memory: 192 KB
   \`─ Projection(?s, ?label) [#1.2K], results: 1234, wall time: 1 ms (1.2%), memory: 0 B
      \`─ Filter(?price > 100) [#1.2K], results: 1234, wall time: 9 ms (10.8%), memory: 0 B
         \`─ NaryJoin(?s) [#4.9K], results: 4927, wall time: 58 ms (69.9%), memory: 1.1 MB
            +─ Scan[POSC](?s, rdf:type, :Product) [#4.9K], results: 4927, wall time: 1 ms (1.2%), memory: 0 B
            +─ Scan[PSOC](?s, :label, ?label) [#5.0K], results: 4927, wall time: 1 ms (1.2%), memory: 0 B
            \`─ Scan[PSOC](?s, :price, ?price) [#5.0K], results: 4927, wall time: 1 ms (1.2%), memory: 0 B`;

export const samples = {
  qlever: {
    label: 'QLever plan',
    engine: 'qlever',
    query: olympicsQuery,
    contentType: 'application/qlever-results+json',
    body: JSON.stringify(qleverResponse),
  },
  graphdb: {
    label: 'GraphDB plan',
    engine: 'graphdb',
    query: graphdbQuery,
    contentType: 'text/plain',
    body: graphdbPlan,
  },
  stardog: {
    label: 'Stardog profile',
    engine: 'stardog',
    query: stardogQuery,
    contentType: 'text/plain',
    body: stardogPlan,
  },
};
