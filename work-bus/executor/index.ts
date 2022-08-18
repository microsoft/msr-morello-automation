#!/usr/bin/env node

import { spawn } from "child_process"
import * as fs from 'fs'

import { ServiceBusClient } from "@azure/service-bus"
import * as yargs from "yargs"

import * as lib from "@msr-morello-work-bus/lib"
import * as dispatch from "./dispatch"
import * as t from "./types"

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      MORELLO_HOSTNAME: string;
    }
  }
}

const yargparse = yargs
  .scriptName("executor")
  .config("config", "JSON configuration file")
  .help();

lib.OctoKitUtils.appYargs(yargparse);
lib.AzureServiceBusUtils.busYargs(yargparse);
yargparse.option("busqueuesub",
  { type: "string"
  , demandOption: true
  , describe: "Azure Service Bus job topic subscription"
  });
yargparse.option("buscomplete",
  { type: "string"
  , demandOption: true
  , describe: "Azure Service Bus job complete queue"
  });
yargparse.option("remotecmd",
  { type: "string"
  , demandOption: true
  , describe: "Prefix to run remote shell command a la ssh"
  });
dispatch.dispatchYargs(yargparse);

function withShutdown<T>(act: Promise<T>,
 timeMS: number,
 script: string | undefined) : Promise<T> {
  if (script === undefined) { return act; }
  return lib.TimeUtils.withTimeout(act, timeMS, () => {
    console.error("work-bus executor: idle timeout; powering down board")
    const runboot = spawn(script as string,
      { shell: false
      , stdio: ["ignore", "inherit", "inherit"]
      });
    return new Promise( (resolve) => runboot.on("exit", () => {
      console.error("work-bus executor: board shut down");
      resolve()
    }) );
  });
}

async function waitAndPrepare(sb: ServiceBusClient, argv: yargs.Arguments) {
  /* Subscribe to a queue or a topic subscription, as directed */
  const sbQN = argv.busqueue as string;
  const sbQ = argv.busqueuesub != undefined
    ? sb.createReceiver(sbQN, argv.busqueuesub as string)
    : sb.createReceiver(sbQN)

  console.log(sbQN, argv.busqueuesub)

  try {
    console.error("work-bus executor: waiting for job to become available...");

    const qmsg = await withShutdown(
     lib.AzureServiceBusUtils.awaitOneForever(sbQ),
     360000 /* in six mintues, if we haven't gotten a job... */,
     argv.board_shutdown as string | undefined /* ... shut down the board */);

    const mbody = <lib.QueueDataTypes.EnqueuedJobEvent> qmsg.body;

    console.error("work-bus executor: dispatching prepare...", mbody);

    /*
     * Every three minutes while we're still waiting, prevent the work request
     * from timing out and going to another worker.
     */
    const keepalive = lib.TimeUtils.periodically(180000, () => {
      (async () => {
        console.error("work-bus executor still waiting on prepare");
        await sbQ.renewMessageLock(qmsg);
      })();
    });

    const dispRes = await dispatch.dispatchPrepare(argv, sb, mbody);

    /*
     * Now that we've prepared, acknowledge the work request.  If we don't
     * make it here, the service bus will retry delivery to another listener
     * or will eventually time out.
     */
    keepalive.stop();
    await sbQ.completeMessage(qmsg);

    return dispRes
  } finally {
    await sbQ.close()
  }
}

function makeCompletionPromise(
 sbClient: ServiceBusClient,
 argv: yargs.Arguments,
 completionFrom: string | undefined) {

  /* If there isn't a completion session defined, don't wait on anything */
  if (completionFrom === undefined) {
    return undefined
  }

  return new Promise( async (resolve) => {
    const sbRecvC = await sbClient.acceptSession(
      /* queue */ argv.buscomplete as string,
      /* session */ completionFrom);
    try {
      const cmsg = await lib.AzureServiceBusUtils.awaitOneForever(sbRecvC);

      console.error("work-bus executor: got completion message", cmsg.body);
      await sbRecvC.completeMessage(cmsg);
      resolve(<t.DispatchJobResultOK> {result: "ok"});
    } catch(e) {
      /*
       * This can happen if we're on the way out and get kicked out of
       * the await above; it's probably harmless.
       */
      resolve(<t.DispatchJobResultFail> {result: "fail"});
    } finally {
      await sbRecvC.close();
    }
  });
}

function jobResultToExitCode(r: t.DispatchJobResult) {
  switch(r.result) {
    case "ok": return 0;
    case "fail": return 1;
    case "shutdown": return 42;
  }
}

(async () => {
  const argv = await yargparse.parseAsync(process.argv.slice(2))
  const sbClient = lib.AzureServiceBusUtils.clientFromYargs(argv);

  try {
    const dispRes = await waitAndPrepare(sbClient, argv);
    const pCompMsg = makeCompletionPromise(
      sbClient, argv, dispRes.completionFrom);

    if (pCompMsg !== undefined) {
      console.error("work-bus executor: racing job against completion...");
      const v = <t.DispatchJobResult>
        await Promise.race([pCompMsg, dispRes.promise]);

      console.log("work-bus executor: race finished:",
        [pCompMsg, dispRes.promise]);
      process.exitCode = jobResultToExitCode(v);

      /*
       * Linger until we get the completion message so that it doesn't remain in
       * the service bus.  It's possible that we already have it, if it won the
       * race, above.  On the other hand, don't wait forever for a message that's
       * not coming, if something has gone wrong; just bail.
       */
      await Promise.race([
        pCompMsg,
        new Promise<void>((r) => { setTimeout(r, 60000) })
      ]);
    } else {
      console.error("work-bus executor: job has no completion message");
      process.exitCode = jobResultToExitCode(await dispRes.promise);
    }

    if (dispRes.cleanup !== undefined) {
      await dispRes.cleanup();
    }
  } finally {
    await sbClient.close()
  }
  process.exit()
})()
