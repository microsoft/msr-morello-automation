import type { Argv, Arguments } from "yargs"
import type { ServiceBusMessage
	    , ServiceBusReceiver
            , ServiceBusReceivedMessage } from "@azure/service-bus"
import { EnvironmentCredential } from "@azure/identity"
import { ServiceBusClient, ServiceBusClientOptions } from "@azure/service-bus"

export type { ServiceBusClient, ServiceBusMessage, ServiceBusReceiver }

export function busYargs(yargs: Argv) {
  return yargs
  .option("busconn", {
    type: "string",
    describe: "Azure Service Bus connection string; no need for credentials",
  })
  .option("busname", {
    type: "string",
    describe: "Service bus FQDN; will use EnvironmentCredential",
  })
  .option("busqueue", {
    type: "string",
    demandOption: true,
    describe: "Azure Service Bus queue name",
  })
  .option("busendpoint", {
    type: "string",
    describe: "Azure Service Bus custom endpoint",
  })
}

export function clientFromYargs(argv: Arguments) {
  let connopts : ServiceBusClientOptions = { }

  if ("busendpoint" in argv) {
    connopts.customEndpointAddress = argv.busendpoint as string;
  }

  if ("busconn" in argv) {
    return new ServiceBusClient(argv.busconn as string, connopts);
  } else if ("busname" in argv) {
    return new ServiceBusClient(
      argv.busname as string,
      new EnvironmentCredential(),
      connopts);
  } else {
    throw new Error("Can't construct bus client; need conn str or bus name");
  }
}

export async function awaitOneForever(recv : ServiceBusReceiver)
  : Promise<ServiceBusReceivedMessage> {
  const msgs = await recv.receiveMessages(1,
    { /*
       * We seemingly can't say to wait forever, so just wait a very long while
       * before polling again.
       *
       * XXX 20220622 Apparently 24 hours is too long and something gives up on
       * our AMQP connection.  Try lowering this to one hour and keeping an eye
       * on the connections.
       */
      maxWaitTimeInMs: 60 * 60 * 1000
    });

   if (!msgs.length) {
     return awaitOneForever(recv);
   }

   return msgs[0];
}
