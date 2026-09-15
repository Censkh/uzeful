import React, { useEffect } from "react";
import MobileSidebar from "@theme-original/Navbar/MobileSidebar";
import { useNavbarMobileSidebar } from "@docusaurus/theme-common/internal";

export default function AccessibleMobileSidebar(props) {
  const { shown, toggle } = useNavbarMobileSidebar();
  useEffect(() => {
    if (!shown) return undefined;
    const sidebar = document.querySelector(".navbar-sidebar");
    const trigger = document.querySelector(".navbar__toggle");
    const controls = () => Array.from(sidebar.querySelectorAll('a[href], button, input, [tabindex="0"]'))
      .filter((element) => !element.closest("[inert]") && element.getBoundingClientRect().width > 0);
    sidebar.setAttribute("role", "dialog");
    sidebar.setAttribute("aria-modal", "true");
    sidebar.setAttribute("aria-label", "Navigation");
    controls()[0]?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        toggle();
        trigger?.focus();
      } else if (event.key === "Tab") {
        const items = controls();
        const first = items[0];
        const last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      sidebar.removeAttribute("role");
      sidebar.removeAttribute("aria-modal");
      sidebar.removeAttribute("aria-label");
      if (sidebar.contains(document.activeElement)) trigger?.focus();
    };
  }, [shown, toggle]);
  return <MobileSidebar {...props} />;
}
