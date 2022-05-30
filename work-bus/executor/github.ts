import type { Octokit } from "octokit"
import { restEndpointMethods } from "@octokit/plugin-rest-endpoint-methods"
import type { Arguments, Argv } from "yargs"
import { spawn } from "child_process"
import * as fs from "fs"

import * as lib from "@msr-morello-work-bus/lib"

import { DispatchResult } from "./types"

export function prepareYargs(yargs : Argv) {
  return yargs.option("github_prepare", {
    type: "string",
    demandOption: true,
    describe: "Program to generate runner settings.json",
  })
  .option("github_run", {
    type: "string",
    demandOption: true,
    describe: "Remote program to run the runner",
  })
}

async function removeSettings() {
  await new Promise ((resolve) => { fs.unlink("settings.json", resolve) });
}

async function makeSettings(
 prepare : string,
 id : string,
 labels : string[],
 repo_url : string,
 token : string)
 : Promise<number> {

  console.error("work-bus executor github: token in hand; preparing",
    id, labels, repo_url)
  await removeSettings();

  const runprep = spawn(prepare,
    ["configure", id, labels.join(/* with commas */), repo_url, token],
    { shell: false
    , timeout: 30000
    , stdio: ["ignore", "inherit", "inherit"]
    });
  return await new Promise( (resolve) => runprep.on("exit", resolve) )
}

async function bootBoard(boot : string, label2: string): Promise<number> {
  console.error("work-bus executor github: booting board")

  const runboot = spawn(boot, [label2],
    { shell: false
    , timeout: 30000
    , stdio: ["ignore", "inherit", "inherit"]
    });
  return await new Promise( (resolve) => runboot.on("exit", resolve) )
}

export async function prepare(
 argv : Arguments,
 _: any /* ServiceBusClient */,
 msg : lib.QueueDataTypes.GitHubWorkflowJobQueuedEvent)
 : Promise<DispatchResult> {

  console.error("work-bus executor github: event for", msg.owner, msg.repo)

  // Boot the board
  const bootBoardP = bootBoard(
    argv.board_prepare as string,
    msg.labels[2])

  if (await bootBoardP != 0) {
    throw new Error("Failed to boot board");
  }

  // Get a registration token from github
  const oa = lib.OctoKitUtils.app(argv)
  const oai = await oa.getInstallationOctokit(msg.installation)
  const tresp = await oai.rest.actions.createRegistrationTokenForRepo(
    { owner: msg.owner, repo: msg.repo})

  /*
   * Compute a name for our ephemeral runner.  Do this here rather than in the
   * prepare script so that we can also use it for completion messages, below.
   *
   * We include the message ID just so we can more easily correlate messages,
   * especially when queued and completed messages are cross-threaded across
   * runners.
   */
  const runnerName =
    ("ephemeral").concat("-",
      process.env["MORELLO_HOSTNAME"] as string, "-",
      Date.now().toString(), "-",
      msg.id.toString());

  // Spawn the local runner to register with github
  const registerRunnerP = makeSettings(
    argv.github_prepare as string,
    runnerName, msg.labels, msg.repo_html_url, tresp.data.token)

  if (await registerRunnerP != 0) {
    throw new Error("Failed to register runner");
  }

  /* TODO
   * We'd very much like to do those in parallel, but we occasionally see
   * loader.efi fall on its face, which then leaves a stale ephemeral runner
   * behind.  So, just await each in turn.
   *
     // Wait for both of those to complete, bailing if either fails.
     {
       const vs = await Promise.all([registerRunnerP, bootBoardP]);
       if (vs[0] != 0) { throw new Error("Failed to register runner"); }
       if (vs[1] != 0) { throw new Error("Failed to boot board"); }
     }
   */

  /*
   * Send the settings file over to the remote host, into /tmp, since /root
   * is read-only.  Our --github_run script also knows this.
   */
  {
    console.error("work-bus executor github: transferring settings.json");
    const sf = fs.openSync("settings.json", "r");
    const runxfer = spawn(argv.remotecmd as string,
      ["cat > /tmp/settings.json"],
      { shell: false
      , timeout: 30000
      , stdio: [sf, "inherit", "inherit"]
      });
    await new Promise( (resolve) => runxfer.on("exit", resolve) );
    await fs.closeSync(sf);
    // Leave settings.json here for cleanup, below
  }

  const runp = new Promise<number>( (resolve) => {
    const run = spawn(argv.remotecmd as string, [argv.github_run as string],
      { shell: false
      , stdio: "inherit"
      });
    run.on("exit", (v:number) => {
      console.log("work-bus executor github: runner task exited", v);
      resolve(v)
    });
  });

  async function cleanup(): Promise<void> {
    /*
     * Ask the action runner to remove itself.  This may fail if the runner
     * on the board has already completed its job, but it shouldn't hurt to
     * ask twice.
     */
    const run = spawn(argv.github_prepare as string, ["remove"],
      { shell: false
      , timeout: 30000
      , stdio: ["ignore", "inherit", "inherit"]
      });
    await new Promise<void>((resolve) =>
      run.on("exit", (v:number) => {
        console.log("work-bus executor github: runner removed", v);
        resolve()
      }));

    /*
     * It's quite likely that settings.json is gone by now, but just in case,
     * remove it explicitly.
     */
    await removeSettings();
  }

  return { completionFrom: `github-${runnerName}`
         , promise: runp
         , cleanup: cleanup
         };
}
