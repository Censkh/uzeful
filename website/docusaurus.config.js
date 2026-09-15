const path = require("node:path");
const baseUrl = "/";
const guideUrl = "/context-and-hooks/";
const { themes } = require("prism-react-renderer");
const codeTheme = {
  ...themes.github,
  plain: { ...themes.github.plain, color: "#000000", backgroundColor: "#ffffff" },
};

const config = {
  title: "uzeful",
  tagline: "Request context, state, caching, and lifecycle hooks for Cloudflare Workers, Bun, and Express.",
  favicon: "img/favicon.svg",
  url: "https://uzeful.io",
  baseUrl,
  organizationName: "Censkh",
  projectName: "uzeful",
  onBrokenLinks: "throw",
  trailingSlash: true,

  presets: [
    [
      "classic",
      {
        docs: {
          path: path.resolve(__dirname, "docs"),
          routeBasePath: "/",
          sidebarPath: require.resolve("./sidebars.js"),
          showLastUpdateAuthor: true,
          showLastUpdateTime: true,
          editUrl: "https://github.com/Censkh/uzeful/edit/main/website/docs/",
        },
        blog: false,
        pages: false,
        sitemap: { ignorePatterns: ["/search/**"] },
        theme: {
          customCss: require.resolve("./src/css/custom.css"),
        },
      },
    ],
  ],

  markdown: {
    hooks: {
      onBrokenMarkdownLinks: "throw",
    },
  },

  plugins: [
    [
      "docusaurus-plugin-copy-page-button",
      {
        injectButton: false,
        enabledActions: ["copy", "view"],
        generateMarkdownRoutes: true,
      },
    ],
    [
      "@easyops-cn/docusaurus-search-local",
      {
        hashed: true,
        indexDocs: true,
        docsDir: "docs",
        docsRouteBasePath: "/",
        indexBlog: false,
        highlightSearchTermsOnTargetPage: true,
        language: ["en"],
      },
    ],
  ],

  themeConfig: {
    image: "img/uzeful-social-card.png",
    metadata: [
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "uzeful" },
      { property: "og:locale", content: "en_GB" },
      { property: "og:image:type", content: "image/png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "uzeful — Good hooks. Less plumbing." },
      { name: "twitter:image:alt", content: "uzeful — Good hooks. Less plumbing." },
      { name: "theme-color", content: "#fafafa" },
    ],
    colorMode: { defaultMode: "light", disableSwitch: true, respectPrefersColorScheme: false },
    navbar: {
      title: "uzeful",
      logo: { alt: "", src: "img/logo-mark.svg", width: 36, height: 36 },
      items: [
        {
          type: "docSidebar",
          sidebarId: "docs",
          position: "left",
          label: "Documentation",
        },
        {
          href: guideUrl,
          label: "Explore hooks",
          position: "left",
        },
        {
          href: "https://github.com/Censkh/uzeful",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    prism: {
      theme: codeTheme,
      darkTheme: codeTheme,
      additionalLanguages: ["bash", "diff", "json"],
    },
    footer: {
      style: "light",
      links: [
        {
          title: "Resources",
          items: [
            { label: "Documentation", to: "/" },
            { label: "Explore hooks", href: guideUrl },
            { label: "GitHub", href: "https://github.com/Censkh/uzeful" },
          ],
        },
      ],
      copyright: `<div class="developer-credit"><div>Developed by <a href="https://github.com/Censkh">James Waterhouse</a> of <a href="https://knownquantity.net/">Known Quantity</a><br/><span>Copyright © ${new Date().getFullYear()} uzeful contributors.</span></div><a class="known-quantity" href="https://knownquantity.net/" aria-label="Known Quantity website"><img src="/img/known-quantity.svg" alt="Known Quantity" width="181" height="48" /></a></div>`,
    },
  },
};

module.exports = config;
