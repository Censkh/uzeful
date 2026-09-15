import React from "react";
import MDXComponents from "@theme-original/MDXComponents";

export default {
  ...MDXComponents,
  table: (props) => (
    <div className="table-scroll" tabIndex={0} role="region" aria-label="Scrollable table">
      <table {...props} />
    </div>
  ),
};
