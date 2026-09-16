import Head from "@docusaurus/Head";
import SearchPage from "@theme-original/SearchPage";
import React from "react";

export default function SearchPageWrapper(props) {
  return (
    <>
      <SearchPage {...props} />
      <Head>
        <meta name="robots" content="noindex, follow" />
      </Head>
    </>
  );
}
