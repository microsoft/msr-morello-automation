import { App } from "@octokit/app"
import { Octokit } from "octokit"
import { composePaginateRest } from "@octokit/plugin-paginate-rest"
import type { Arguments, Argv } from "yargs"

export function appYargs(yargs: Argv) {
  return yargs
  .option("github_key", {
    type: "string",
    demandOption: true,
    describe: "GitHub App private key, PEM format",
  })
  .option("github_appid", {
    type: "number",
    demandOption: true,
    describe: "GitHub App id",
  })
}

export function app(argv: Arguments) {
  return new App({
    appId: argv.github_appid as number,
    privateKey: argv.github_key as string,

    /*
     * Override the constructor used for subordinate octokit instances;
     * ordinarily, this would be @octokit/core's octokit, which wouldn't
     * have, among other things, the .rest plugin applied.
     */
    Octokit: Octokit
  });
}
