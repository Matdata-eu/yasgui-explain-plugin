import { printExpression, printIri, printPath, printTerm } from '../../src/algebra/terms';

const prefixes = { ex: 'http://example.org/', xsd: 'http://www.w3.org/2001/XMLSchema#' };

describe('printIri', () => {
  it('uses the longest matching prefix', () => {
    expect(
      printIri('http://example.org/a/b', {
        ex: 'http://example.org/',
        exa: 'http://example.org/a/',
      })
    ).toBe('exa:b');
  });

  it('falls back to angle brackets when the local name is not a valid prefixed name', () => {
    expect(printIri('http://example.org/a b', prefixes)).toBe('<http://example.org/a b>');
    expect(printIri('http://other.org/x', prefixes)).toBe('<http://other.org/x>');
  });
});

describe('printTerm', () => {
  it('prints variables, blank nodes and literals', () => {
    expect(printTerm({ termType: 'Variable', value: 's' })).toBe('?s');
    expect(printTerm({ termType: 'BlankNode', value: 'b0' })).toBe('_:b0');
    expect(printTerm({ termType: 'Literal', value: 'hi', language: 'en' })).toBe('"hi"@en');
    expect(
      printTerm({ termType: 'Literal', value: '3', datatype: { value: `${prefixes.xsd}integer` } })
    ).toBe('3');
    expect(
      printTerm({ termType: 'Literal', value: 'x', datatype: { value: `${prefixes.xsd}string` } })
    ).toBe('"x"');
    expect(
      printTerm(
        { termType: 'Literal', value: '2020-01-01', datatype: { value: `${prefixes.xsd}date` } },
        prefixes
      )
    ).toBe('"2020-01-01"^^xsd:date');
  });
});

describe('printPath', () => {
  it('prints sequences, alternatives, inverses and modifiers', () => {
    const link = (iri: string) => ({ type: 'link', iri: { termType: 'NamedNode', value: iri } });
    expect(
      printPath(
        {
          type: 'alt',
          input: [
            {
              type: 'seq',
              input: [
                { type: 'OneOrMorePath', path: link('http://example.org/a') },
                { type: 'inv', path: link('http://example.org/b') },
              ],
            },
            { type: 'nps', iris: [{ termType: 'NamedNode', value: 'http://example.org/c' }] },
          ],
        },
        prefixes
      )
    ).toBe('ex:a+/^ex:b|!(ex:c)');
  });
});

describe('printExpression', () => {
  it('prints operators, functions and aggregates in prefix notation', () => {
    const term = (value: string) => ({ subType: 'term', term: { termType: 'Variable', value } });
    expect(
      printExpression({ subType: 'operator', operator: '>', args: [term('o'), term('p')] })
    ).toBe('(> ?o ?p)');
    expect(
      printExpression({
        subType: 'aggregate',
        aggregator: 'count',
        distinct: true,
        expression: term('o'),
      })
    ).toBe('(count distinct ?o)');
    expect(printExpression({ subType: 'existence', not: true, input: {} })).toBe('(notexists ...)');
    expect(
      printExpression(
        {
          subType: 'named',
          name: { termType: 'NamedNode', value: 'http://example.org/f' },
          args: [term('o')],
        },
        prefixes
      )
    ).toBe('(ex:f ?o)');
  });
});
