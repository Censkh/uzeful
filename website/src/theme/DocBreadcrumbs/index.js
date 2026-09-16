import CopyPageButton from "docusaurus-plugin-copy-page-button/react";
import React from "react";

export default function DocToolbar() {
  return (
    <div className="doc-toolbar">
      <CopyPageButton enabledActions={["copy", "view"]} generateMarkdownRoutes />
    </div>
  );
}
