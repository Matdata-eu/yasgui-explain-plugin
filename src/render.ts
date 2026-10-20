/**
 * DOM rendering of the Explain view: sections, the execution plan (as a tree,
 * as text or as a sandboxed page) and the algebra tree.
 */

import type { Plan, PlanNode } from './types';
import type { AlgebraNode } from './algebra/print';
import { icon, type IconName } from './icons';

/** A `<button>` with an icon and a label */
export function button(
  label: string,
  iconName: IconName | undefined,
  onClick: () => void,
  title?: string
): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'explain-button';
  if (iconName) el.appendChild(icon(iconName, 14));
  const text = document.createElement('span');
  text.textContent = label;
  el.appendChild(text);
  if (title) el.title = title;
  el.addEventListener('click', onClick);
  return el;
}

/** Copy text to the clipboard; falls back to a hidden textarea where the API is missing */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/** A "Copy" button that shows "Copied" for a moment */
export function copyButton(getText: () => string, label = 'Copy'): HTMLButtonElement {
  const el = button(label, 'copy', async () => {
    const ok = await copyText(getText());
    const span = el.querySelector('span');
    if (span) {
      span.textContent = ok ? 'Copied' : 'Copy failed';
      setTimeout(() => (span.textContent = label), 1500);
    }
  });
  return el;
}

export interface Section {
  root: HTMLElement;
  body: HTMLElement;
  actions: HTMLElement;
  setStatus(text: string, kind?: 'muted' | 'error'): void;
}

/** A titled, collapsible block with an action bar */
export function section(title: string, collapsed = false): Section {
  const root = document.createElement('section');
  root.className = 'explain-section';
  const header = document.createElement('div');
  header.className = 'explain-section-header';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'explain-section-toggle';
  toggle.setAttribute('aria-expanded', String(!collapsed));
  toggle.appendChild(icon('chevron-down', 16));
  const heading = document.createElement('span');
  heading.className = 'explain-section-title';
  heading.textContent = title;
  toggle.appendChild(heading);
  const status = document.createElement('span');
  status.className = 'explain-section-status';
  const actions = document.createElement('div');
  actions.className = 'explain-section-actions';
  header.append(toggle, status, actions);
  const body = document.createElement('div');
  body.className = 'explain-section-body';
  root.append(header, body);
  root.classList.toggle('explain-section--collapsed', collapsed);
  toggle.addEventListener('click', () => {
    const isCollapsed = root.classList.toggle('explain-section--collapsed');
    toggle.setAttribute('aria-expanded', String(!isCollapsed));
  });
  return {
    root,
    body,
    actions,
    setStatus(text, kind = 'muted') {
      status.textContent = text;
      status.className = `explain-section-status explain-section-status--${kind}`;
    },
  };
}

export function message(text: string, kind: 'muted' | 'error' | 'info' = 'muted'): HTMLElement {
  const el = document.createElement('div');
  el.className = `explain-message explain-message--${kind}`;
  el.textContent = text;
  return el;
}

function formatMs(ms: number): string {
  if (ms >= 10000) return `${(ms / 1000).toFixed(1)} s`;
  if (ms >= 100) return `${Math.round(ms)} ms`;
  if (ms >= 10) return `${ms.toFixed(1)} ms`;
  return `${ms.toFixed(2)} ms`;
}

function formatRows(rows: number): string {
  return rows.toLocaleString('en-US');
}

/** The largest own time in a plan tree, used to scale the time bars */
function maxOwnTime(node: PlanNode): number {
  let max = node.timeMs ?? 0;
  for (const child of node.children) max = Math.max(max, maxOwnTime(child));
  return max;
}

function countNodes(node: PlanNode | AlgebraNode): number {
  return 1 + node.children.reduce((sum, child) => sum + countNodes(child as any), 0);
}

export interface TreeHandle {
  root: HTMLElement;
  expandAll(): void;
  collapseAll(): void;
}

/** Render an execution plan tree: one row per operation with rows, time and a time bar */
export function renderPlanTree(root: PlanNode, summary?: string[]): TreeHandle {
  const container = document.createElement('div');
  container.className = 'explain-plan';
  if (summary && summary.length) {
    const summaryEl = document.createElement('div');
    summaryEl.className = 'explain-summary';
    for (const line of summary) {
      const item = document.createElement('span');
      item.textContent = line;
      summaryEl.appendChild(item);
    }
    container.appendChild(summaryEl);
  }
  const max = maxOwnTime(root);
  const hasTimes = max > 0;
  const tree = document.createElement('div');
  tree.className = 'explain-tree';
  tree.setAttribute('role', 'tree');
  const rows: HTMLElement[] = [];
  const slowest = hasTimes ? findSlowest(root, max) : undefined;

  const build = (node: PlanNode, depth: number, parent: HTMLElement) => {
    const item = document.createElement('div');
    item.className = 'explain-node';
    item.setAttribute('role', 'treeitem');
    if (node.cached) item.classList.add('explain-node--cached');
    if (node === slowest) item.classList.add('explain-node--slowest');
    if (node.status && /not started|lazily|skipped/i.test(node.status))
      item.classList.add('explain-node--inactive');

    const row = document.createElement('div');
    row.className = 'explain-row';
    row.style.setProperty('--explain-depth', String(depth));

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'explain-toggle';
    if (node.children.length) {
      toggle.appendChild(icon('chevron-down', 14));
      toggle.setAttribute('aria-label', 'Collapse');
      toggle.addEventListener('click', () => {
        const collapsed = item.classList.toggle('explain-node--collapsed');
        toggle.setAttribute('aria-label', collapsed ? 'Expand' : 'Collapse');
        item.setAttribute('aria-expanded', String(!collapsed));
      });
      item.setAttribute('aria-expanded', 'true');
    } else {
      toggle.classList.add('explain-toggle--leaf');
      toggle.tabIndex = -1;
    }
    row.appendChild(toggle);

    const main = document.createElement('div');
    main.className = 'explain-row-main';
    const label = document.createElement('div');
    label.className = 'explain-label';
    label.textContent = node.label;
    if (node.cached) {
      const badge = document.createElement('span');
      badge.className = 'explain-badge';
      badge.textContent = 'cached';
      label.appendChild(badge);
    }
    if (node.status && !/^(completed|fully materialized)$/i.test(node.status)) {
      const badge = document.createElement('span');
      badge.className = 'explain-badge explain-badge--status';
      badge.textContent = node.status;
      label.appendChild(badge);
    }
    main.appendChild(label);
    const metaLines: string[] = [];
    if (node.columns && node.columns.length) metaLines.push(node.columns.join(' '));
    if (node.details && node.details.length) metaLines.push(...node.details);
    if (metaLines.length) {
      const meta = document.createElement('div');
      meta.className = 'explain-meta';
      for (const line of metaLines) {
        const span = document.createElement('span');
        span.textContent = line;
        meta.appendChild(span);
      }
      main.appendChild(meta);
    }
    row.appendChild(main);

    const stats = document.createElement('div');
    stats.className = 'explain-stats';
    const rowsEl = document.createElement('span');
    rowsEl.className = 'explain-rows';
    rowsEl.textContent = node.rows !== undefined ? `${formatRows(node.rows)} rows` : '';
    const timeEl = document.createElement('span');
    timeEl.className = 'explain-time';
    if (node.timeMs !== undefined) {
      timeEl.textContent = formatMs(node.timeMs);
      if (node.totalMs !== undefined && node.totalMs !== node.timeMs) {
        timeEl.title = `This operation: ${formatMs(node.timeMs)}. With its children: ${formatMs(node.totalMs)}.`;
      }
    }
    const bar = document.createElement('span');
    bar.className = 'explain-bar';
    if (hasTimes && node.timeMs !== undefined) {
      const fill = document.createElement('span');
      fill.className = 'explain-bar-fill';
      fill.style.width = `${Math.max(1, Math.round((node.timeMs / max) * 100))}%`;
      bar.appendChild(fill);
    }
    stats.append(rowsEl, timeEl, bar);
    row.appendChild(stats);
    item.appendChild(row);
    rows.push(item);

    if (node.children.length) {
      const children = document.createElement('div');
      children.className = 'explain-children';
      children.setAttribute('role', 'group');
      for (const child of node.children) build(child, depth + 1, children);
      item.appendChild(children);
    }
    parent.appendChild(item);
  };
  build(root, 0, tree);
  container.appendChild(tree);
  if (!hasTimes) container.classList.add('explain-plan--no-times');
  return {
    root: container,
    expandAll: () => rows.forEach((row) => row.classList.remove('explain-node--collapsed')),
    collapseAll: () =>
      rows.forEach((row) => {
        if (row.querySelector(':scope > .explain-children'))
          row.classList.add('explain-node--collapsed');
      }),
  };
}

function findSlowest(node: PlanNode, max: number): PlanNode | undefined {
  if (node.timeMs === max && !node.cached) return node;
  for (const child of node.children) {
    const found = findSlowest(child, max);
    if (found) return found;
  }
  return node.timeMs === max ? node : undefined;
}

/** Render a text plan in a scrollable monospace block */
export function renderText(text: string): HTMLElement {
  const pre = document.createElement('pre');
  pre.className = 'explain-text';
  pre.textContent = text;
  return pre;
}

/** Render an HTML plan page in a sandboxed frame: no scripts, no navigation, same look as the engine's page */
export function renderHtml(html: string): HTMLElement {
  const frame = document.createElement('iframe');
  frame.className = 'explain-frame';
  frame.setAttribute('sandbox', '');
  frame.setAttribute('referrerpolicy', 'no-referrer');
  frame.title = 'Execution plan';
  frame.srcdoc = html;
  return frame;
}

/** Render the algebra tree */
export function renderAlgebraTree(root: AlgebraNode): TreeHandle {
  const tree = document.createElement('div');
  tree.className = 'explain-tree explain-algebra';
  tree.setAttribute('role', 'tree');
  const items: HTMLElement[] = [];
  const build = (node: AlgebraNode, depth: number, parent: HTMLElement) => {
    const item = document.createElement('div');
    item.className = 'explain-node';
    item.setAttribute('role', 'treeitem');
    const row = document.createElement('div');
    row.className = 'explain-row';
    row.style.setProperty('--explain-depth', String(depth));
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'explain-toggle';
    if (node.children.length) {
      toggle.appendChild(icon('chevron-down', 14));
      toggle.setAttribute('aria-label', 'Collapse');
      toggle.addEventListener('click', () => {
        const collapsed = item.classList.toggle('explain-node--collapsed');
        toggle.setAttribute('aria-label', collapsed ? 'Expand' : 'Collapse');
        item.setAttribute('aria-expanded', String(!collapsed));
      });
      item.setAttribute('aria-expanded', 'true');
    } else {
      toggle.classList.add('explain-toggle--leaf');
      toggle.tabIndex = -1;
    }
    row.appendChild(toggle);
    const main = document.createElement('div');
    main.className = 'explain-row-main';
    const label = document.createElement('div');
    label.className = 'explain-label';
    const op = document.createElement('span');
    op.className = 'explain-operator';
    op.textContent = node.operator;
    label.appendChild(op);
    if (node.args) {
      const args = document.createElement('span');
      args.className = 'explain-args';
      args.textContent = node.args;
      label.appendChild(args);
    }
    main.appendChild(label);
    if (node.details && node.details.length) {
      const details = document.createElement('div');
      details.className = 'explain-meta explain-meta--code';
      for (const line of node.details) {
        const span = document.createElement('span');
        span.textContent = line;
        details.appendChild(span);
      }
      main.appendChild(details);
    }
    row.appendChild(main);
    item.appendChild(row);
    items.push(item);
    if (node.children.length) {
      const children = document.createElement('div');
      children.className = 'explain-children';
      children.setAttribute('role', 'group');
      for (const child of node.children) build(child, depth + 1, children);
      item.appendChild(children);
    }
    parent.appendChild(item);
  };
  build(root, 0, tree);
  return {
    root: tree,
    expandAll: () => items.forEach((item) => item.classList.remove('explain-node--collapsed')),
    collapseAll: () =>
      items.forEach((item) => {
        if (item.querySelector(':scope > .explain-children'))
          item.classList.add('explain-node--collapsed');
      }),
  };
}

/** Render a plan of any kind */
export function renderPlan(plan: Plan): { root: HTMLElement; tree?: TreeHandle; text?: string } {
  switch (plan.kind) {
    case 'tree': {
      const tree = renderPlanTree(plan.root, plan.summary);
      return { root: tree.root, tree, text: planTreeToText(plan.root, plan.summary) };
    }
    case 'text':
      return { root: renderText(plan.text), text: plan.text };
    case 'html':
      return { root: renderHtml(plan.html), text: plan.html };
  }
}

/** A plan tree as indented text, for the clipboard and the download */
export function planTreeToText(root: PlanNode, summary?: string[]): string {
  const lines: string[] = [];
  if (summary && summary.length) lines.push(...summary, '');
  const walk = (node: PlanNode, depth: number) => {
    const stats: string[] = [];
    if (node.rows !== undefined) stats.push(`${formatRows(node.rows)} rows`);
    if (node.timeMs !== undefined) stats.push(formatMs(node.timeMs));
    if (node.cached) stats.push('cached');
    if (node.status && !/^(completed|fully materialized)$/i.test(node.status))
      stats.push(node.status);
    lines.push(
      `${'  '.repeat(depth)}${node.label}${stats.length ? `  [${stats.join(', ')}]` : ''}`
    );
    for (const detail of node.details || []) lines.push(`${'  '.repeat(depth + 1)}${detail}`);
    for (const child of node.children) walk(child, depth + 1);
  };
  walk(root, 0);
  return lines.join('\n');
}

export { countNodes };
