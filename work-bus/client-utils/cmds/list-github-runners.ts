import { App } from "octokit"
import type { Arguments, Argv } from "yargs"

import { composePaginateRest } from "@octokit/plugin-paginate-rest"

import { OctoKitUtils as oku } from "@msr-morello-work-bus/lib"

exports.command = "list-github-runners"
exports.desc = "List active app installs and associated runners"
exports.builder = oku.appYargs
exports.handler = async function (argv: Arguments) {
  const oa = oku.app(argv)

  await oa.eachInstallation(
    async function ({ octokit: iok, installation: inst }) {
      console.log("For installation id %d", inst.id)

      await oa.eachRepository({ installationId: inst.id},
        async function ({ octokit: rok, repository: repo }) {
          // XXX; surely this can't be the right way to do this
          const runiter = composePaginateRest.iterator(rok,
            "GET /repos/{owner}/{repo}/actions/runners",
            { owner: repo.owner.login, repo: repo.name });

          for await (const { data: runners } of runiter) {
            if (runners.length == 0) {
              console.log(" Repository %s -- No Runners", repo.full_name)
            } else {
              console.log(" Repository %s", repo.full_name)
              runners.forEach((runner) => {
                console.log(
                  "  Runner id=%d name=%s status=%s %s labels=%o",
                  runner.id,
                  runner.name,
                  runner.status,
                  runner.busy ? "busy" : "idle",
                  runner.labels.map((e) => e.name))
              })
            }
          }
      })
    }
  )
}
