import type * as Preset from "@docusaurus/preset-classic";
import type { Config } from "@docusaurus/types";

const config: Config = {
  title: "Uzeful",
  tagline: "A calm, typed foundation for backend applications.",
  favicon: "img/favicon.svg",
  url: "https://uzeful.io",
  baseUrl: "/",
  organizationName: "Censkh",
  projectName: "uzeful",
  onBrokenLinks: "throw",
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: "warn",
    },
  },
  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },
  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.ts",
          editUrl: "https://github.com/Censkh/uzeful/tree/main/packages/uzeful-docs/",
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],
  themeConfig: {
    image: "img/uzeful-social-card.svg",
    navbar: {
      title: "uzeful",
      logo: {
        alt: "Uzeful",
        src: "img/logo-mark.svg",
      },
      items: [
        { type: "docSidebar", sidebarId: "docs", position: "left", label: "Documentation" },
        { to: "/docs/getting-started", position: "left", label: "Guides" },
        {
          href: "https://github.com/Censkh/uzeful",
          position: "right",
          label: "GitHub ↗",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Learn",
          items: [
            { label: "Getting started", to: "/docs/getting-started" },
            { label: "Caching", to: "/docs/caching" },
            { label: "Adapters", to: "/docs/adapters" },
          ],
        },
        {
          title: "Community",
          items: [{ label: "GitHub", href: "https://github.com/Censkh/uzeful" }],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Uzeful. Built with Docusaurus.`,
    },
    prism: {
      theme: { plain: { color: "#dce4f0", backgroundColor: "#101827" }, styles: [] },
      darkTheme: { plain: { color: "#dce4f0", backgroundColor: "#101827" }, styles: [] },
      additionalLanguages: ["typescript"],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
