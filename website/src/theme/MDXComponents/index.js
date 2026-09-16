import MDXComponents from "@theme-original/MDXComponents";
import React from "react";

export default {
  ...MDXComponents,
  table: (props) => (
    // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must be able to scroll wide tables.
    <section className="table-scroll" tabIndex={0} aria-label="Scrollable table">
      <table {...props} />
    </section>
  ),
};
