/**
 * Inline Lucide icons (https://lucide.dev, ISC licence)
 *
 * Only the few icons the plugin needs are inlined, so there is no icon font
 * or runtime dependency. They are stroke icons drawn in `currentColor`.
 */

const ICON_PATHS = {
  'list-tree':
    '<path d="M21 12h-8"/><path d="M21 6H8"/><path d="M21 18h-8"/>' +
    '<path d="M3 6v4c0 1.1.9 2 2 2h3"/><path d="M3 10v6c0 1.1.9 2 2 2h3"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  'chevron-right': '<path d="m9 18 6-6-6-6"/>',
  copy:
    '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>' +
    '<path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  'rotate-ccw': '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  'unfold-vertical':
    '<path d="M12 22v-6"/><path d="M12 8V2"/><path d="M4 12H2"/><path d="M10 12H8"/>' +
    '<path d="M16 12h-2"/><path d="M22 12h-2"/><path d="m15 19-3 3-3-3"/><path d="m15 5-3-3-3 3"/>',
  'fold-vertical':
    '<path d="M12 22v-6"/><path d="M12 8V2"/><path d="M4 12H2"/><path d="M10 12H8"/>' +
    '<path d="M16 12h-2"/><path d="M22 12h-2"/><path d="m15 19-3-3-3 3"/><path d="m15 5-3 3-3-3"/>',
} as const;

export type IconName = keyof typeof ICON_PATHS;

/** SVG markup of a Lucide icon (decorative: hidden from assistive technology) */
export function iconSvg(name: IconName, size = 16, strokeWidth = 1.75): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" class="explain-icon explain-icon-${name}" ` +
    `width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
    `stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" ` +
    `aria-hidden="true" focusable="false">${ICON_PATHS[name]}</svg>`
  );
}

/** A Lucide icon as a DOM element */
export function icon(name: IconName, size?: number, strokeWidth?: number): SVGElement {
  const template = document.createElement('template');
  template.innerHTML = iconSvg(name, size, strokeWidth);
  return template.content.firstElementChild as SVGElement;
}
