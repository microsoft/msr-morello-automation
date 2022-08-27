import { ServiceBusClient, ServiceBusMessage } from "@azure/service-bus"
import type { Arguments, Argv } from "yargs"
import { v4 as uuidv4 } from "uuid"

import * as lib from "@msr-morello-work-bus/lib"

exports.command = "shutdown"
exports.desc = "Shutdown an executor and report which"
exports.builder = function (yargs: Argv) {
  /*
   * This command needs both the submission queue (-busqueue) as well as the
   * completion queue (-buscomplete).
   */

  lib.AzureServiceBusUtils.busYargs(yargs);
  return yargs
    .option("buscomplete",
      { type: "string"
      , demandOption: true
      , describe: "Azure Service Bus job complete queue"
      })
    .option("subject",
      { type: "string"
      , demandOption: true
      , default: "msr-morello"
      , describe: "Subject of the shutdown request message"
      });
}
exports.handler = async function (argv: Arguments) {
  console.error("[+] Dialing service bus...")
  const sbClient = lib.AzureServiceBusUtils.clientFromYargs(argv);

  const id = uuidv4();

  console.error("[+] Sending service bus message...")
  const sbSendQ = sbClient.createSender(argv.busqueue as string);

  await sbSendQ.sendMessages(
    <ServiceBusMessage>
    { subject: argv.subject as string
    , messageId: `shutdown-${id}`
    , body: { type: "shutdown", id: id }
    });
  console.error("[+] Shutdown request sent", argv.subject, id)
  await sbSendQ.close();

  console.error("[+] Awaiting receipt of completion message.")
  const sbRecvQ = await sbClient.acceptSession(
    /* queue */ argv.buscomplete as string,
    /* session */ `shutdown-${id}`);
  const rmsg = await lib.AzureServiceBusUtils.awaitOneForever(sbRecvQ);
  console.error("[+] Shutdown reply", rmsg.body)

  await sbRecvQ.completeMessage(rmsg);
  await sbRecvQ.close();
  await sbClient.close();
}
