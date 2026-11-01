/**
 * HUD contrast audit for the playtests: samples every visible piece of text in
 * the game view and judges it with src/world/contrast.mjs (WCAG AA, over both a
 * dark and a bright 3D scene, since the HUD floats over the live world).
 */
import { auditSample } from '../../src/world/contrast.mjs';

/** Collects { label, color, layers, fontSize, fontWeight, overScene } for visible text in the game. */
export function sampleText(page, root = '.world-root') {
  return page.evaluate(rootSelector => {
    const samples = [];
    const scope = document.querySelector(rootSelector);
    if (!scope) return samples;
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      if (!el || seen.has(el) || !node.textContent.trim()) continue;
      seen.add(el);
      if (el.closest('canvas, [aria-hidden="true"], [hidden], :disabled, .sr-only, .visually-hidden')) continue;
      const box = el.getBoundingClientRect();
      if (box.width < 2 || box.height < 2 || box.bottom < 0 || box.top > innerHeight || box.right < 0 || box.left > innerWidth) continue;
      const style = getComputedStyle(el);
      if (style.visibility !== 'visible') continue;
      // Clipped text (screen-reader-only helpers).
      if (style.clip === 'rect(0px, 0px, 0px, 0px)' || style.clipPath === 'inset(50%)') continue;
      let opacity = 1;
      const layers = [];
      let overScene = false;
      for (let at = el; at && at !== document.documentElement; at = at.parentElement) {
        if (at.classList.contains('world-viewport')) { overScene = true; break; }
        const s = getComputedStyle(at);
        opacity *= Number(s.opacity);
        const bg = s.backgroundColor;
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') layers.push(bg);
        // A background image (gradient) can't be judged by colour; assume the author checked it.
        if (s.backgroundImage && s.backgroundImage !== 'none') { layers.length = 0; layers.push('rgb(0, 0, 0)'); break; }
      }
      if (opacity < 0.05) continue;
      if (!overScene) {
        const page = getComputedStyle(document.body).backgroundColor;
        if (page && page !== 'rgba(0, 0, 0, 0)') layers.push(page);
        const html = getComputedStyle(document.documentElement).backgroundColor;
        if (html && html !== 'rgba(0, 0, 0, 0)') layers.push(html);
      }
      // Fold opacity into the text colour's alpha (the panel fades with it, so this is a conservative stand-in).
      const m = /rgba?\(([^)]+)\)/.exec(style.color);
      let color = style.color;
      if (m && opacity < 1) {
        const [r, g, b, a = '1'] = m[1].split(/[\s,/]+/).filter(Boolean);
        color = `rgba(${r}, ${g}, ${b}, ${Number(a) * opacity})`;
      }
      const cls = [...el.classList].slice(0, 2).join('.');
      const text = node.textContent.trim().replace(/\s+/g, ' ').slice(0, 32);
      samples.push({ label: `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''} "${text}"`, color, layers, fontSize: parseFloat(style.fontSize), fontWeight: style.fontWeight, overScene });
    }
    return samples;
  }, root);
}

/** Runs the audit; returns findings with the game state they were seen in. */
export async function auditContrast(page, state, root) {
  const samples = await sampleText(page, root);
  return { checked: samples.length, findings: samples.map(auditSample).filter(Boolean).map(finding => ({ ...finding, state })) };
}

export const formatFinding = f => `${f.label} ${f.ratio}:1 (needs ${f.needed}:1, over a ${f.over}) in ${f.state}`;
