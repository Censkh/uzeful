import React from "react";
// Tabler Icons v3.46.0 — MIT; see static/icons/tabler/LICENSE.
export default function Icon(props) {
  return (
    <svg
      data-tabler-icon="true"
      xmlns="http://www.w3.org/2000/svg"
      width={21}
      height={21}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      aria-hidden="true"
      {...props}
    >
      <path d="M18 6l-12 12" />
      <path d="M6 6l12 12" />
    </svg>
  );
}
