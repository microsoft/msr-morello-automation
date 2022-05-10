import * as yargs from "yargs"
import * as lib from "@msr-morello-work-bus/lib"
import { ServiceBusClient } from "@azure/service-bus"

import { DispatchResult } from "./types"
import * as egh from "./github"
import * as esh from "./shutdown"

export function dispatchYargs(yargs: yargs.Argv) {
  yargs.option("board_prepare", {
    type: "string",
    demandOption: true,
    describe: "Program to ready the runner's execution environment"
  })
  .option("board_shutdown", {
    type: "string",
    demandOption: false,
    describe: "Program to power down board if idling too long"
  })
  egh.prepareYargs(yargs)
}

export function dispatchPrepare(argv: yargs.Arguments,
 sb: ServiceBusClient,
 event: lib.QueueDataTypes.EnqueuedJobEvent)
 : Promise<DispatchResult> {

  switch (event.type) {
  case "github-workflow": return egh.prepare(argv, sb, event);
  case "shutdown": return esh.prepare(argv, sb, event);
  }
}
