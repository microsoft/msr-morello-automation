import type { Argv, Arguments } from "yargs"
import type { ServiceBusReceiver
            , ServiceBusReceivedMessage } from "@azure/service-bus"
import { EnvironmentCredential } from "@azure/identity"
import { ServiceBusClient } from "@azure/service-bus"

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
}

export function clientFromYargs(argv: Arguments) {
  if ("busconn" in argv) {
    return new ServiceBusClient(argv.busconn as string);
  } else if ("busname" in argv) {
    return new ServiceBusClient(
      argv.busname as string,
      new EnvironmentCredential());
  } else {
    throw new Error("Can't construct bus client; need conn str or bus name");
  }
}

export async function awaitOneForever(recv : ServiceBusReceiver)
  : Promise<ServiceBusReceivedMessage> {
  const msgs = await recv.receiveMessages(1,
    { /*
       * We seemingly can't say to wait forever, so just wait a very long while
       * before polling again.  (XXX, 20220120)
       */
      maxWaitTimeInMs: 24 * 60 * 60 * 1000
    });

   if (!msgs.length) {
     return awaitOneForever(recv);
   }

   return msgs[0];
}
