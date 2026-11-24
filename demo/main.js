import ExplainPlugin from '@matdata/yasgui-explain-plugin';
import '../styles/index.css';
import { samples } from './samples.js';
import { endpoints } from './endpoints.js';

const OLYMPICS_QUERY = `PREFIX olympics: <http://wallscope.co.uk/ontology/olympics/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

# Athletes with the most gold medals
SELECT ?athlete ?name (COUNT(?medal) AS ?golds) WHERE {
  ?medal olympics:athlete ?athlete ;
         olympics:medal <http://wallscope.co.uk/resource/olympics/medal/Gold> .
  ?athlete rdfs:label ?name .
}
GROUP BY ?athlete ?name
ORDER BY DESC(?golds)
LIMIT 20`;

const LIVE_HINT =
  'Pick an endpoint, press Run and open the <strong>Explain</strong> view: the plan shows each operation with its rows and time, and the algebra shows the query as the SPARQL specification translates it.';
const SAMPLE_HINT =
  'A plan recorded from the engine, shown without an endpoint. Pick an endpoint to go back to live plans.';

// MatGUI registers its own copy as "Explain"; this page shows the one from this repository
const Yasgui = window.Yasgui;
Yasgui.Yasr.registerPlugin('Explain', ExplainPlugin);

const yasgui = new Yasgui(document.getElementById('yasgui'), {
  requestConfig: { endpoint: endpoints.find((e) => e.label === 'QLever · Olympics')?.url },
  endpointButtons: endpoints.map((endpoint) => ({ endpoint: endpoint.url, label: endpoint.label.split(' · ')[0] })),
  copyEndpointOnNewTab: true,
  // The page is about one view: no "How MatGUI works" tour on the first visit
  quickStartOnFirstVisit: false,
  yasqe: { value: OLYMPICS_QUERY },
  yasr: { defaultPlugin: 'Explain' },
});

const hint = document.getElementById('hint');
const endpointSelect = document.getElementById('endpoint');
const sampleSelect = document.getElementById('sample');

/** Show a recorded plan in the current tab without querying an endpoint */
function loadSample(name) {
  const sample = samples[name];
  const tab = yasgui.getTab();
  tab.getYasqe().setValue(sample.query);
  const yasr = tab.getYasr();
  yasr.plugins.Explain.setOptions({
    engine: sample.engine,
    requestPlan: async () => ({
      status: 200,
      headers: { 'content-type': sample.contentType },
      content: sample.body,
    }),
  });
  yasr.setResponse({
    data: JSON.stringify({ head: { vars: [] }, results: { bindings: [] } }),
    contentType: 'application/sparql-results+json',
    status: 200,
    executionTime: 1,
  });
  yasr.selectPlugin('Explain');
  sampleSelect.value = name;
  endpointSelect.value = '';
  hint.textContent = SAMPLE_HINT;
}

/** Back to live mode: the plan comes from the endpoint of the tab */
function liveMode() {
  yasgui.getTab().getYasr().plugins.Explain.setOptions({ engine: undefined, requestPlan: undefined });
  sampleSelect.value = '';
  hint.innerHTML = LIVE_HINT;
}

/** Point the current tab at a public endpoint, with a query that suits it */
function useEndpoint(endpoint) {
  liveMode();
  const tab = yasgui.getTab();
  tab.setEndpoint(endpoint.url);
  tab.getYasqe().setValue(endpoint.query);
  endpointSelect.value = endpoint.url;
}

const addOption = (select, value, text) => {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = text;
  select.appendChild(option);
};
addOption(endpointSelect, '', 'Choose…');
for (const endpoint of endpoints) addOption(endpointSelect, endpoint.url, endpoint.label);
addOption(sampleSelect, '', 'None (live)');
for (const [name, sample] of Object.entries(samples)) addOption(sampleSelect, name, sample.label);

endpointSelect.addEventListener('change', () => {
  const endpoint = endpoints.find((e) => e.url === endpointSelect.value);
  if (endpoint) useEndpoint(endpoint);
});
sampleSelect.addEventListener('change', () => {
  if (sampleSelect.value) loadSample(sampleSelect.value);
  else liveMode();
});

hint.innerHTML = LIVE_HINT;

// ?sample=qlever opens the page on a recorded plan
const requested = new URLSearchParams(window.location.search).get('sample');
if (requested && samples[requested]) loadSample(requested);

window.yasgui = yasgui;
