/**
 * The widget's colours come from the tenant's branding (--w-primary / --w-accent,
 * set in the console's Branding studio). A colour written into the markup
 * would ignore that setting for every tenant, so none may be hardcoded.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (name: string) => readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), 'utf8');
const widget = read('ChatWidget.tsx');
const css = read('widget.css');

describe('widget brand colour', () => {
  it('has no hardcoded pink anywhere in the live widget', () => {
    for (const src of [widget, css]) expect(src).not.toMatch(/pink|hotpink|#ff69b4/i);
  });

  it('teaser borders, user bubbles, the loading bar and the mic follow the brand colour', () => {
    for (const cls of ['widget-teaser', 'widget-msg-user', 'widget-msg-assistant', 'widget-thinking-bar', 'widget-mic']) {
      expect(widget, cls).toContain(cls);
      const rule = css.slice(css.indexOf(`.${cls}`), css.indexOf('}', css.indexOf(`.${cls}`)));
      expect(rule, cls).toMatch(/var\(--w-primary/);
    }
  });
});
