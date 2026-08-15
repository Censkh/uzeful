import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
  docs: [
    "getting-started",
    {
      type: "category",
      label: "Core concepts",
      collapsed: false,
      items: ["context-and-hooks", "caching"],
    },
    {
      type: "category",
      label: "Run anywhere",
      collapsed: false,
      items: ["adapters"],
    },
  ],
};

export default sidebars;
