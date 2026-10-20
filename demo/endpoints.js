/**
 * Public endpoints of the supported engines, to try the plan live. Neptune
 * has no public endpoint: it only runs inside an AWS VPC.
 */
export const endpoints = [
  {
    label: 'QLever · Wikidata',
    engine: 'qlever',
    url: 'https://qlever.dev/api/wikidata',
    query: `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

# The largest cities, with their English label
SELECT ?city ?label ?population WHERE {
  ?city wdt:P31 wd:Q515 ;
        wdt:P1082 ?population ;
        rdfs:label ?label .
  FILTER(LANG(?label) = "en")
}
ORDER BY DESC(?population)
LIMIT 20`,
  },
  {
    label: 'QLever · Olympics',
    engine: 'qlever',
    url: 'https://qlever.cs.uni-freiburg.de/api/olympics',
    query: `PREFIX olympics: <http://wallscope.co.uk/ontology/olympics/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

# Athletes with the most gold medals
SELECT ?athlete ?name (COUNT(?medal) AS ?golds) WHERE {
  ?medal olympics:athlete ?athlete ;
         olympics:medal <http://wallscope.co.uk/resource/olympics/medal/Gold> .
  ?athlete rdfs:label ?name .
}
GROUP BY ?athlete ?name
ORDER BY DESC(?golds)
LIMIT 20`,
  },
  {
    label: 'GraphDB · ERA RINF',
    engine: 'graphdb',
    url: 'https://graph.data.era.europa.eu/repositories/rinf-plus',
    query: `PREFIX era: <http://data.europa.eu/949/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

# Operational points of the European railway infrastructure
SELECT ?op ?name ?type WHERE {
  ?op a era:OperationalPoint ;
      era:opName ?name ;
      era:opType ?type .
}
LIMIT 20`,
  },
  {
    label: 'Blazegraph · Wikidata Query Service',
    engine: 'blazegraph',
    url: 'https://query.wikidata.org/sparql',
    query: `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

# Capitals of the EU member states
SELECT ?country ?countryLabel ?capital ?capitalLabel WHERE {
  ?country wdt:P463 wd:Q458 ;
           wdt:P36 ?capital ;
           rdfs:label ?countryLabel .
  ?capital rdfs:label ?capitalLabel .
  FILTER(LANG(?countryLabel) = "en" && LANG(?capitalLabel) = "en")
}
ORDER BY ?countryLabel`,
  },
  {
    label: 'Stardog · LINDAS',
    engine: 'stardog',
    url: 'https://lindas.admin.ch/query',
    query: `PREFIX schema: <http://schema.org/>
PREFIX cube: <https://cube.link/>

# Data cubes published by the Swiss administration
SELECT ?cube ?name WHERE {
  ?cube a cube:Cube ;
        schema:name ?name .
  FILTER(LANG(?name) = "en")
}
LIMIT 20`,
  },
];
