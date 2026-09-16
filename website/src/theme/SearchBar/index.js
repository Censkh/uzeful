import SearchBar from "@theme-original/SearchBar";
import React, { useEffect, useRef } from "react";

export default function AccessibleSearchBar(props) {
  const root = useRef(null);
  useEffect(() => {
    // The autocomplete dependency emits older ARIA markup after loading its index.
    const update = () => {
      root.current.querySelector('button[class*="searchClearButton"]')?.setAttribute("aria-label", "Clear search");
      const input = root.current.querySelector('input[role="combobox"]');
      const list = root.current.querySelector('[role="listbox"]');
      if (!input || !list) return;
      input.setAttribute("aria-controls", list.id);
      list.setAttribute("aria-label", "Search results");
      list.querySelectorAll('a[href], [class*="noResults"]').forEach((item) => {
        if (item.closest('[role="option"]')) return;
        item.setAttribute("role", "option");
        item.setAttribute("aria-selected", "false");
        if (!item.matches("a")) item.setAttribute("aria-disabled", "true");
      });
    };
    const observer = new MutationObserver(update);
    observer.observe(root.current, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-owns", "aria-expanded"],
    });
    update();
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={root}>
      <SearchBar {...props} />
    </div>
  );
}
