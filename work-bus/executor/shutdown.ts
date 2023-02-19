import type { Arguments, Argv } from "yargs"

import * as lib from "@msr-morello-work-bus/lib"

import { DispatchResult, DispatchJobResultShutdown } from "./types"

async function act(
 argv : Arguments,
 sbClient: lib.AzureServiceBusUtils.ServiceBusClient,
 msg : lib.QueueDataTypes.ShutdownQueuedEvent)
{
  const sbSendQ = sbClient.createSender(argv.buscomplete as string);

  await sbSendQ.sendMessages(<lib.AzureServiceBusUtils.ServiceBusMessage>
    { sessionId: `shutdown-${msg.id}`
    , messageId: `shutdown-${msg.id}`
    , body: { type: "shutdown-reply"
            , host: process.env["MORELLO_HOSTNAME"] as string
            }
    });

  await sbSendQ.close();
  return <DispatchJobResultShutdown> { result: "shutdown" };
}

export async function prepare(
 argv : Arguments,
 sbClient: lib.AzureServiceBusUtils.ServiceBusClient,
 msg : lib.QueueDataTypes.ShutdownQueuedEvent)
 : Promise<DispatchResult> {

  console.error("Got shutdown request; acknowledging and bailing")
  return { completionFrom: undefined, promise: act(argv, sbClient, msg) }
}
