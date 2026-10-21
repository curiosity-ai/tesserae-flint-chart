// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { useEffect, useState } from 'react';
import type { McpUiHostContext } from '@modelcontextprotocol/ext-apps';

/** The tallest the host will draw the card inline, if it says. */
function hostMaxHeight(hostContext?: McpUiHostContext): number | undefined {
  const dims = hostContext?.containerDimensions as { height?: number; maxHeight?: number } | undefined;
  const cap = dims?.maxHeight ?? dims?.height;
  return typeof cap === 'number' && Number.isFinite(cap) && cap > 0 ? cap : undefined;
}

/** How far a scrolling page must shrink below the cap before it stops scrolling, so the gutter cannot flip it back and forth. */
const HYSTERESIS = 16;

/**
 * Whether the page scrolls. Inline, the card is sized to the page, so it never does: a scrollbar would
 * appear while the host catches up with a new height, narrow the content, lay it out again, and change
 * the height again. A host that stops growing the card at a height (VS Code: 75% of its window) says so
 * in `containerDimensions.maxHeight`; a page taller than that scrolls, or its bottom is cut off. In a pane
 * the host sets the height, so the page scrolls past it. A scrolling page keeps its gutter so the
 * scrollbar never narrows it.
 */
export function usePageScroll(hostContext: McpUiHostContext | undefined, paned: boolean): void {
  const cap = paned ? undefined : hostMaxHeight(hostContext);
  const [over, setOver] = useState(false);
  useEffect(() => {
    if (cap === undefined || typeof ResizeObserver === 'undefined') {
      setOver(false);
      return;
    }
    const read = () => {
      const height = document.body.scrollHeight;
      setOver((prev) => (prev ? height > cap - HYSTERESIS : height > cap + 1));
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, [cap]);

  const scrolls = paned || over;
  useEffect(() => {
    document.documentElement.style.overflow = scrolls ? 'hidden auto' : 'hidden';
    document.documentElement.style.scrollbarGutter = scrolls ? 'stable' : '';
    document.body.style.overflow = scrolls ? 'visible' : 'hidden';
  }, [scrolls]);
}
