import { useEffect, useInsertionEffect, useMemo, useState } from 'react';
import type { Board } from '../../../packages/flint-mcp/ui/src/BoardView';
import mcpStyles from '../../../packages/flint-mcp/ui/src/styles.css?inline';

/** The MCP view's stylesheet, scoped to `scope` so it does not restyle the site, for as long as the view is on screen. */
export function useMcpStyles(scope: string) {
  useInsertionEffect(() => {
    const style = document.createElement('style');
    style.dataset.mcpScope = scope;
    style.textContent = mcpStyles
      .replace(/:root\b/g, `.${scope}`)
      .replace(/html,\s*body\s*\{/g, `.${scope} {`)
      .replace(/^#root\s*\{[^}]*\}/m, '')
      .replace(/^(\*|select|input\[type="[a-z]+"\])(?=[\s,:{])/gm, `.${scope} $1`);
    document.head.append(style);
    return () => style.remove();
  }, [scope]);
}

const PAGE_PROPS = ['overflow', 'background'] as const;

function pageStyles() {
  return [document.documentElement, document.body].map((root) => PAGE_PROPS.map((prop) => root.style.getPropertyValue(prop)));
}

/**
 * Keeps the page's own scrolling and background while MCP cards are mounted below the caller: the board
 * card assumes it is the whole page and sets both on `html` and `body`. Call it above the cards, so the
 * page is read before their first effects run.
 */
export function useHostPage() {
  const [saved] = useState(pageStyles);
  useEffect(() => {
    const roots = [document.documentElement, document.body];
    const restore = () => roots.forEach((root, at) => PAGE_PROPS.forEach((prop, i) => {
      if (root.style.getPropertyValue(prop) !== saved[at][i]) root.style.setProperty(prop, saved[at][i]);
    }));
    restore();
    const observer = new MutationObserver(restore);
    roots.forEach((root) => observer.observe(root, { attributes: true, attributeFilter: ['style'] }));
    return () => {
      observer.disconnect();
      restore();
    };
  }, [saved]);
}

type ModelContext = { content: { type: string; text: string }[] };

/** A host for the single-chart card: it reports model context and has no server tools. */
export function useMockApp(onContext?: (text: string) => void) {
  return useMemo(() => ({
    sendMessage: async () => undefined,
    updateModelContext: async ({ content }: ModelContext) => {
      onContext?.(content.map((part) => part.text).join('\n'));
    },
    getHostCapabilities: () => ({}),
    downloadFile: async () => ({}),
  }), [onContext]);
}

/** A host for the board card: the card keeps the reader's theme and arrangement itself, and sends its context. */
export function useMockBoardApp(onContext?: (text: string) => void) {
  return useMockApp(onContext);
}
