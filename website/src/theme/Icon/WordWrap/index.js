import React from "react";
// Tabler Icons v3.46.0 — MIT; see static/icons/tabler/LICENSE.
export default function Icon(props) {
  return (
    <svg
      data-tabler-icon="true"
      xmlns="http://www.w3.org/2000/svg"
      width={24}
      height={24}
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
      <path d="M4 6l16 0" />
      <path d="M4 18l5 0" />
      <path d="M4 12h13a3 3 0 0 1 0 6h-4l2 -2m0 4l-2 -2" />
    </svg>
  );
}
