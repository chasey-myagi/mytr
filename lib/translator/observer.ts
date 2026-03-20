export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function createVisibilityObserver(
  onVisible: (elements: Element[]) => void,
  scrollDebounceMs = 300,
): { observe: (el: Element) => void; disconnect: () => void } {
  const pendingElements: Element[] = [];
  const debouncedFlush = debounce(() => {
    if (pendingElements.length > 0) {
      onVisible([...pendingElements]);
      pendingElements.length = 0;
    }
  }, scrollDebounceMs);

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          pendingElements.push(entry.target);
          observer.unobserve(entry.target);
        }
      }
      if (pendingElements.length > 0) {
        debouncedFlush();
      }
    },
    { rootMargin: '200px' }, // Trigger slightly before entering viewport
  );

  return {
    observe: (el: Element) => observer.observe(el),
    disconnect: () => observer.disconnect(),
  };
}

export function createMutationWatcher(
  onNewContent: (addedNodes: Element[]) => void,
): { disconnect: () => void } {
  const observer = new MutationObserver((mutations) => {
    const added: Element[] = [];
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof Element && !node.classList.contains('mytr-translation')) {
          added.push(node);
        }
      }
    }
    if (added.length > 0) {
      onNewContent(added);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  return { disconnect: () => observer.disconnect() };
}

export function createRouteWatcher(onRouteChange: () => void): () => void {
  const handler = () => onRouteChange();
  window.addEventListener('popstate', handler);
  window.addEventListener('hashchange', handler);

  // Monkey-patch history.pushState and history.replaceState so SPA navigation
  // (which does not fire popstate) is also detected.
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  history.pushState = (...args) => {
    originalPushState(...args);
    handler();
  };

  history.replaceState = (...args) => {
    originalReplaceState(...args);
    handler();
  };

  return () => {
    window.removeEventListener('popstate', handler);
    window.removeEventListener('hashchange', handler);
    // Restore original history methods
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
  };
}
