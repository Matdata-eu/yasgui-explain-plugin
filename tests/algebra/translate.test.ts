import { translate, AlgebraError } from '../../src/algebra/translate';
import { toSExpression, toTree } from '../../src/algebra/print';

const prefixes = { ex: 'http://example.org/', rdfs: 'http://www.w3.org/2000/01/rdf-schema#' };

describe('translate', () => {
  it('translates a SELECT with modifiers to the algebra of the specification', () => {
    const algebra = translate(`PREFIX ex: <http://example.org/>
      SELECT ?s (COUNT(?o) AS ?n) WHERE {
        ?s ex:p ?o . OPTIONAL { ?s ex:q ?x } FILTER(?o > 3)
      } GROUP BY ?s ORDER BY DESC(?n) LIMIT 10 OFFSET 2`);
    expect(algebra.type).toBe('slice');
    expect(algebra.input.type).toBe('project');
    const text = toSExpression(algebra, prefixes);
    expect(text).toContain('(slice 2 10');
    expect(text).toContain('(project (?s ?n)');
    expect(text).toContain('(order ((desc ?n))');
    expect(text).toContain('(group (?s) ((?var0 (count ?o)))');
    expect(text).toContain('(filter (> ?o 3)');
    expect(text).toContain('(leftjoin');
    expect(text).toContain('(triple ?s ex:p ?o)');
  });

  it('keeps unions, graphs, services, paths and values', () => {
    const algebra = translate(`PREFIX ex: <http://example.org/>
      SELECT * WHERE {
        { ?s ex:a ?o } UNION { GRAPH ?g { ?s ex:b+/^ex:c ?o } }
        SERVICE SILENT <http://remote/sparql> { ?o ex:d ?e }
        VALUES ?s { ex:x UNDEF }
      }`);
    const text = toSExpression(algebra, prefixes);
    expect(text).toContain('(union');
    expect(text).toContain('(graph ?g');
    // A sequence path is split into its steps by the translation
    expect(text).toContain('(path ?s ex:b+ ?var0)');
    expect(text).toContain('(triple ?o ex:c ?var0)');
    expect(text).toContain('(service silent <http://remote/sparql>');
    expect(text).toContain('(table (vars ?s)');
    expect(text).toContain('(row [?s ex:x])');
    expect(text).toContain('(row)');
  });

  it('handles CONSTRUCT, ASK, DESCRIBE and updates', () => {
    expect(
      toSExpression(translate('CONSTRUCT { ?s <http://e/p> ?o } WHERE { ?s <http://e/p> ?o }'))
    ).toContain('(construct');
    expect(toSExpression(translate('ASK { ?s ?p ?o }'))).toContain('(ask');
    expect(toSExpression(translate('DESCRIBE <http://e/a>'))).toContain('(describe (<http://e/a>)');
    const update = toSExpression(
      translate('INSERT { ?s <http://e/p> ?o } WHERE { ?s <http://e/q> ?o }')
    );
    expect(update).toContain('(modify');
    expect(update).toContain('(insert (triple ?s <http://e/p> ?o))');
  });

  it('builds a tree with operators, arguments and details', () => {
    const tree = toTree(
      translate(
        'PREFIX ex: <http://example.org/> SELECT ?s WHERE { ?s ex:p ?o FILTER(BOUND(?o)) } LIMIT 5'
      ),
      prefixes
    );
    expect(tree.operator).toBe('slice');
    expect(tree.args).toBe('limit 5');
    const project = tree.children[0];
    expect(project.operator).toBe('project');
    expect(project.args).toBe('?s');
    const filter = project.children[0];
    expect(filter.operator).toBe('filter');
    expect(filter.args).toBe('(bound ?o)');
    expect(filter.children[0].operator).toBe('bgp');
    expect(filter.children[0].details).toEqual(['?s ex:p ?o']);
  });

  it('resolves relative IRIs against a placeholder base', () => {
    const text = toSExpression(translate('SELECT * WHERE { ?s <p> ?o }'));
    expect(text).toContain('<http://base/p>');
  });

  it('reports syntax errors with a readable message', () => {
    expect(() => translate('SELECT * WHERE { ?s ?p }')).toThrow(AlgebraError);
    try {
      translate('SELECT * WHERE { ?s ?p }');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('Parse error');
      expect(message).not.toContain('[Var1]');
    }
    expect(() => translate('   ')).toThrow('The query is empty.');
  });
});
