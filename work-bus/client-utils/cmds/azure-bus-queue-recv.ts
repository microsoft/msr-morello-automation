import { ServiceBusClient } from "@azure/service-bus"
import type { Arguments } from "yargs"

import { AzureServiceBusUtils as lasbu } from "@msr-morello-work-bus/lib"

exports.command = "azure-bus-queue-recv"
exports.desc = "Drain and print messages from an Azure Service Bus Queue"
exports.builder = lasbu.busYargs
exports.handler = async function (argv: Arguments) {
  const sbClient = lasbu.clientFromYargs(argv);
  const sbRecv = sbClient.createReceiver(argv.busqueue as string);

  console.error("Awaiting messages")
  try {
    while (true) {
      /*
       * This effectively polls once per minute, but at least it's encapsulated
       * and if @azure/service-bus ever figures out how to wait forever, so will
       * we (XXX, 20220120).
       */
      for await (const msg of sbRecv.getMessageIterator()) {
        const seq = msg.sequenceNumber || { high: undefined, low: undefined }
        console.log(seq.high, seq.low, msg.enqueuedTimeUtc, msg.body);
        await sbRecv.completeMessage(msg)
      }
    }
  } finally {
    await sbRecv.close();
    await sbClient.close();
  }
}
