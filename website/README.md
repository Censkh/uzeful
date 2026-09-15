# uzeful documentation

A documentation site with a monochrome shell, colored syntax highlighting, JetBrains fonts, Tabler icons, 14px minimum text, local search, and a server-rendered Copy page button.

From this directory, run `bun install --frozen-lockfile`, then `bun run start` for http://127.0.0.1:3010. Use `bun run build` for production output in `build/`.

The landing page is the getting-started guide. No TypeDoc is used. The custom domain is `https://uzeful.io/`; `bun run deploy` publishes through the configured Cloudflare account.

From the package root, `node scripts/checkSeo.mjs` checks the production metadata and social image. To regenerate the PNG, run `node scripts/renderSocialCard.mjs /absolute/path/to/playwright/index.mjs` with Playwright available.
