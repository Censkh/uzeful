import Link from "@docusaurus/Link";
import Layout from "@theme/Layout";
import type { ReactNode } from "react";

const features = [
  {
    number: "01",
    title: "Context without ceremony",
    body: "Expose typed request context through ordinary functions. No decorators, globals, or framework lock-in.",
  },
  {
    number: "02",
    title: "Adapters that stay thin",
    body: "Use the same application model in Cloudflare Workers and Express while keeping platform details at the boundary.",
  },
  {
    number: "03",
    title: "Caching with intent",
    body: "Choose edge-local or replicated storage explicitly, then keep cache state close to the hook that owns it.",
  },
];

function Arrow(): ReactNode {
  return <span aria-hidden="true">→</span>;
}

export default function Home(): ReactNode {
  return (
    <Layout title="Typed backend foundations" description="A calm, typed foundation for backend applications.">
      <main>
        <section className="hero-section">
          <div className="hero-grid" />
          <div className="container hero-content">
            <div className="eyebrow">
              <span className="status-dot" />
              Backend infrastructure, made composed
            </div>
            <h1>
              Build the backend
              <br />
              <em>you want to use.</em>
            </h1>
            <p className="hero-copy">
              Uzeful gives your application a predictable request context, composable hooks, and portable
              adapters—without asking you to adopt a new world.
            </p>
            <div className="hero-actions">
              <Link className="button button--primary button--lg" to="/docs/getting-started">
                Start building {Arrow()}
              </Link>
              <a className="button button--secondary button--lg" href="https://github.com/Censkh/uzeful">
                View on GitHub <span aria-hidden="true">↗</span>
              </a>
            </div>
            <div className="install-command">
              <span className="command-prompt">$</span>
              <code>npm install uzeful</code>
              <button
                type="button"
                aria-label="Copy install command"
                onClick={() => navigator.clipboard.writeText("npm install uzeful")}
              >
                Copy
              </button>
            </div>
          </div>
        </section>

        <section className="container intro-section">
          <div className="section-label">The foundation</div>
          <div className="intro-layout">
            <h2>
              Small surface area.
              <br />
              Serious leverage.
            </h2>
            <p>
              Uzeful handles the connective tissue around your handlers so your domain code stays focused, typed, and
              easy to test.
            </p>
          </div>
          <div className="feature-grid">
            {features.map((feature) => (
              <article className="feature-card" key={feature.number}>
                <span>{feature.number}</span>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="container code-section">
          <div className="code-copy">
            <div className="section-label">One application, multiple runtimes</div>
            <h2>Put your handlers first.</h2>
            <p>
              Wrap a handler once. Access the request context from focused hooks wherever your application needs it.
            </p>
            <Link to="/docs/context-and-hooks" className="text-link">
              Explore hooks {Arrow()}
            </Link>
          </div>
          <pre className="code-window">
            <div className="window-top">
              <span />
              <span />
              <span />
              <b>src/app.ts</b>
            </div>
            <code>
              <i>import</i> {"{ UzefulApp }"} <i>from</i> <u>"uzeful"</u>;<br />
              <br />
              <i>const</i> uzeful = <i>new</i> <strong>UzefulApp</strong>();
              <br />
              <br />
              <i>export const</i> uzeDatabase = <i>async</i> () =&gt; {"{"}
              <br /> <i>const</i> {"{ env }"} = uzeful.hooks.<strong>uzeContext</strong>()();
              <br /> <i>return</i> env.DB;
              <br />
              {"}"};<br />
              <br />
              <i>export const</i> handler = <i>async</i> () =&gt; {"{"}
              <br /> <i>const</i> db = <i>await</i> <strong>uzeDatabase</strong>();
              <br /> <i>return</i> Response.json({"{ ok: true }"});
              <br />
              {"};"}
            </code>
          </pre>
        </section>

        <section className="container runtime-section">
          <div>
            <div className="section-label">Portable by design</div>
            <h2>Deploy where the work is.</h2>
          </div>
          <div className="runtime-list">
            <Link to="/docs/adapters" className="runtime-item">
              <span className="runtime-icon cloudflare">☁</span>
              <div>
                <b>Cloudflare Workers</b>
                <p>Fetch, scheduled work, and queues.</p>
              </div>
              {Arrow()}
            </Link>
            <Link to="/docs/adapters" className="runtime-item">
              <span className="runtime-icon express">E</span>
              <div>
                <b>Express</b>
                <p>Use it as regular middleware.</p>
              </div>
              {Arrow()}
            </Link>
          </div>
        </section>
      </main>
    </Layout>
  );
}
