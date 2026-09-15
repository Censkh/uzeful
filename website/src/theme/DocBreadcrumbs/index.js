import React from "react";
import CopyPageButton from "docusaurus-plugin-copy-page-button/react";

export default function DocToolbar() {
  return (
    <div className="doc-toolbar">
      <CopyPageButton enabledActions={["copy", "view"]} generateMarkdownRoutes />
    </div>
  );
}
