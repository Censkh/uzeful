import express from "express";
import { uzeContextInternal } from "../../../src";
import { ExpressUzefulApp } from "../../../src/express";

export interface ExpressFixtureEnv {
  greeting: string;
}

export const expressUzeful = new ExpressUzefulApp<ExpressFixtureEnv>({
  getEnv: () => ({ greeting: "Hello" }),
});

export const app = express();
app.get(
  "/greeting/:name",
  expressUzeful.fetch(async () => {
    const { env, rawContext, request } = uzeContextInternal<ExpressFixtureEnv>();
    return Response.json({
      greeting: `${env.greeting}, ${rawContext.request.params.name}!`,
      path: new URL(request.url).pathname,
    });
  }),
);

app.post(
  "/echo",
  expressUzeful.fetch(async () => {
    const { request } = uzeContextInternal<ExpressFixtureEnv>();
    return new Response(await request.text(), {
      headers: { "Content-Type": request.headers.get("Content-Type") ?? "text/plain" },
    });
  }),
);
