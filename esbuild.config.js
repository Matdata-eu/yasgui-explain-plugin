const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const postcss = require('postcss');
const postcssImport = require('postcss-import');
const cssnano = require('cssnano');

const distDir = path.join(__dirname, 'dist');

const common = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  sourcemap: true,
  target: ['es2018'],
  external: [],
};

// Build configuration
const buildConfigs = [
  // ES Module (for bundlers like webpack, vite, rollup)
  { ...common, format: 'esm', minify: false, outfile: 'dist/yasgui-plan-plugin.esm.js' },
  // CommonJS (for Node.js)
  { ...common, format: 'cjs', minify: false, outfile: 'dist/yasgui-plan-plugin.cjs.js' },
  // IIFE (for browsers via unpkg.com and script tags); the global is the plugin class
  {
    ...common,
    format: 'iife',
    minify: true,
    globalName: 'YasguiPlanPlugin',
    footer: { js: 'YasguiPlanPlugin = YasguiPlanPlugin.default;' },
    outfile: 'dist/yasgui-plan-plugin.min.js',
  },
];

async function buildCss() {
  const source = fs.readFileSync('styles/index.css', 'utf8');
  const plain = await postcss([postcssImport()]).process(source, { from: 'styles/index.css' });
  const minified = await postcss([postcssImport(), cssnano()]).process(source, { from: 'styles/index.css' });
  fs.writeFileSync(path.join(distDir, 'yasgui-plan-plugin.css'), plain.css);
  fs.writeFileSync(path.join(distDir, 'yasgui-plan-plugin.min.css'), minified.css);
}

async function build() {
  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(distDir, { recursive: true });
  await Promise.all(buildConfigs.map((config) => esbuild.build(config)));
  await buildCss();
  // TypeScript declarations
  execSync('npx tsc --emitDeclarationOnly --declaration --outDir dist', { stdio: 'inherit' });

  console.log('✅ Build complete:');
  console.log('   - dist/yasgui-plan-plugin.esm.js (ES Module for bundlers)');
  console.log('   - dist/yasgui-plan-plugin.cjs.js (CommonJS for Node.js)');
  console.log('   - dist/yasgui-plan-plugin.min.js (IIFE for browsers/unpkg)');
  console.log('   - dist/yasgui-plan-plugin.css / .min.css (styles)');
  console.log('   - dist/index.d.ts (TypeScript declarations)');
}

build().catch((err) => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});
