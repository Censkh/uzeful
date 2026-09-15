import React from "react";
import { translate } from "@docusaurus/Translate";
// Tabler Icons v3.46.0 — MIT; see static/icons/tabler/LICENSE.
export default function Icon(props) {
  return <svg data-tabler-icon="true" xmlns="http://www.w3.org/2000/svg" width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" focusable="false" role="img" aria-label={translate({id: "theme.IconExternalLink.ariaLabel", message: "(opens in new tab)"})} style={{marginLeft: ".3rem", verticalAlign: "-.125em"}} {...props}>
    <path d="M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6" />
  <path d="M11 13l9 -9" />
  <path d="M15 4h5v5" />
  </svg>;
}
