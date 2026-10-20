import ExplainPlugin from './ExplainPlugin';

declare global {
  interface Window {
    Yasgui?: {
      Yasr?: {
        registerPlugin: (name: string, plugin: any) => void;
      };
    };
  }
}

// Auto-register plugin if Yasgui is available (UMD global)
if (typeof window !== 'undefined' && window.Yasgui && window.Yasgui.Yasr) {
  window.Yasgui.Yasr.registerPlugin('Explain', ExplainPlugin);
}

export default ExplainPlugin;
export { ExplainPlugin };
export { translate, AlgebraError } from './algebra/translate';
export { toSExpression, toTree } from './algebra/print';
export { ENGINES, ENGINE_IDS, detectEngine } from './engines';
export type { ExplainPluginOptions, EngineId, EngineChoice, Plan, PlanNode, Engine } from './types';
