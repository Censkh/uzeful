import React, { useEffect } from "react";
import CodeBlock from "@theme/CodeBlock";
import IconArrowDown from "@theme/Icon/ArrowDown";
import { useDoc } from "@docusaurus/plugin-content-docs/client";
import DocItemLayout from "@theme-original/DocItem/Layout";

export default function DocItemLayoutWrapper(props) {
  const { metadata } = useDoc();
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      const trigger = document.querySelector('[data-copy-page-button-trigger][aria-expanded="true"]');
      if (trigger) {
        event.preventDefault();
        trigger.click();
        trigger.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
  return (
    <>
      {metadata.id === "getting-started" && (
        <header className="landing-hero uzeful-hero" aria-labelledby="hero-title">
          <div className="landing-intro">
            <img className="hero-emblem" src="/img/logo-mark.svg" alt="" width="56" height="56" />
            <h1 id="hero-title">Good hooks.<br /><span>Less plumbing.</span></h1>
            <p className="landing-description">Give every request its own context. Share dependencies, state, and lifecycle hooks across your backend.</p>
            <div className="landing-actions">
              <a className="button button--primary" href="#install">Get started <IconArrowDown /></a>
              <a className="button button--secondary" href="/context-and-hooks/">Explore hooks</a>
            </div>
          </div>
          <section className="context-preview" aria-label="Request context example">
            <h2>One request. Your dependencies.</h2>
            <dl><div><dt>request</dt><dd>Fetch Request</dd></div><div><dt>env</dt><dd>Your typed bindings</dd></div><div><dt>state</dt><dd>Scoped to this request</dd></div></dl>
            <CodeBlock language="typescript">{`function uzeDatabase() {
  const { env } = uzeContext();
  return env.DB;
}`}</CodeBlock>
          </section>
        </header>
      )}
      <DocItemLayout {...props} />
    </>
  );
}
