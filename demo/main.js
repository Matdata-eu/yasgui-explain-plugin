import '@matdata/yasgui/build/yasgui.min.css';
import Yasgui from '@matdata/yasgui';
import ExplainPlugin from '@matdata/yasgui-explain-plugin';
import '../styles/index.css';
import './style.css';
import { samples } from './samples.js';

// Register the plugin to Yasr (MatGUI's own build already includes it)
Yasgui.Yasr.registerPlugin('Explain', ExplainPlugin);

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

const yasgui = new Yasgui(document.getElementById('yasgui'), {
  requestConfig: { endpoint: 'https://qlever.cs.uni-freiburg.de/api/olympics' },
  copyEndpointOnNewTab: true,
  yasqe: { value: OLYMPICS_QUERY },
  yasr: {
    pluginOrder: ['Table', 'response', 'Explain'],
  },
});

/** Show a recorded plan in the current tab without querying an endpoint */
function loadSample(name) {
  const sample = samples[name];
  const tab = yasgui.getTab();
  tab.getYasqe().setValue(sample.query);
  const yasr = tab.getYasr();
  const plugin = yasr.plugins.Explain;
  plugin.setOptions({
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
}

/** Back to live mode: the plan comes from the endpoint of the tab */
function liveMode() {
  const plugin = yasgui.getTab().getYasr().plugins.Explain;
  plugin.setOptions({ engine: undefined, requestPlan: undefined });
}

const buttons = document.getElementById('samples');
for (const [name, sample] of Object.entries(samples)) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = sample.label;
  button.addEventListener('click', () => loadSample(name));
  buttons.appendChild(button);
}
const live = document.createElement('button');
live.type = 'button';
live.textContent = 'Live endpoint';
live.addEventListener('click', liveMode);
buttons.appendChild(live);

// ?sample=qlever opens the page on a recorded plan
const requested = new URLSearchParams(window.location.search).get('sample');
if (requested && samples[requested]) loadSample(requested);

window.yasgui = yasgui;
