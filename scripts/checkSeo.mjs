// Run after npm run docs:build: node scripts/checkSeo.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const build = path.resolve("website/build");
const imageUrl = "https://uzeful.io/img/uzeful-social-card.png";
const image = fs.readFileSync(path.join(build, "img/uzeful-social-card.png"));
assert.equal(image.subarray(1, 4).toString(), "PNG");
assert.equal(image.readUInt32BE(16), 1200);
assert.equal(image.readUInt32BE(20), 630);
assert.ok(image.length < 5_000_000);
assert.ok(fs.readFileSync("README.md", "utf8").includes("(website/static/img/uzeful-social-card.png)"));

function readHead(file) {
  const head = fs.readFileSync(file, "utf8").split("</head>")[0];
  const metadata = {};
  const canonicals = [];
  for (const [tag] of head.matchAll(/<(?:meta|link)\b[^>]*>/g)) {
    const attrs = Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]));
    if (attrs.rel === "canonical") canonicals.push(attrs.href);
    // Open Graph uses property; crawler directives and Twitter use name.
    const key = attrs.property?.startsWith("og:") ? attrs.property : attrs.name;
    if (key) {
      assert.ok(!(key in metadata), `${file}: duplicate ${key}`);
      metadata[key] = attrs.content;
    }
  }
  return { metadata, canonicals, title: head.match(/<title[^>]*>(.*?)<\/title>/)?.[1] };
}

let checked = 0;
for (const sitemap of ["sitemap.xml"]) {
  const xml = fs.readFileSync(path.join(build, sitemap), "utf8");
  const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
  assert.ok(urls.length);
  assert.ok(!urls.some((url) => url.includes("/search/")));
  assert.ok(!urls.some((url) => url.includes("/404.html")));
  for (const url of urls) {
    const pathname = new URL(url).pathname;
    const file = path.join(build, pathname, pathname.endsWith("/") ? "index.html" : "");
    const { metadata, canonicals, title } = readHead(file);
    const expected = url;
    assert.deepEqual(canonicals, [expected], `${file}: canonical`);
    assert.equal(metadata["og:url"], expected);
    for (const key of ["description", "og:title", "og:description", "og:image:alt", "twitter:image:alt"]) {
      assert.ok(metadata[key]?.trim(), `${file}: missing ${key}`);
    }
    assert.ok(title?.trim(), `${file}: missing title`);
    assert.equal(metadata["og:type"], "website");
    assert.equal(metadata["og:image"], imageUrl);
    assert.equal(metadata["twitter:image"], imageUrl);
    assert.equal(metadata["twitter:card"], "summary_large_image");
    assert.equal(metadata["og:image:width"], "1200");
    assert.equal(metadata["og:image:height"], "630");
    assert.ok(!metadata.robots?.includes("noindex"), `${file}: unexpectedly noindex`);
    checked++;
  }
}
assert.match(readHead(path.join(build, "search/index.html")).metadata.robots, /noindex/);
const robots = fs.readFileSync(path.join(build, "robots.txt"), "utf8");
assert.ok(robots.includes("Sitemap: https://uzeful.io/sitemap.xml"));
console.log(`SEO checked: ${checked} pages, sitemap, crawler rules, PNG dimensions and README image.`);
