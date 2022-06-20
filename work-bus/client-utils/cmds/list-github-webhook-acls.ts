/*
 * See docs/access_control.rst .
 */

import { CosmosClient } from "@azure/cosmos"
import { EnvironmentCredential } from "@azure/identity"
import type { Arguments } from "yargs"

import assert = require("assert")

exports.command = "list-github-webhook-acls"
exports.desc = "Dump the WebHook ACLs currently stored in the Azure Cosmos DB."
exports.builder =
  { dbconn: { type: "string"
            , describe: "Cosmo DB connection string"
            }
  , dbacct: { type: "string"
            , describe: "Cosmo DB account name; will use EnvironmentCredential"
            }
  , db: { type: "string"
        , default: "GitHubWebHookDB"
        , describe: "Database within account"
        }
  }

exports.handler = async function (argv: Arguments) {
  const client =
    ("dbconn" in argv)
    ? new CosmosClient(argv.dbconn as string)
    : ("dbacct" in argv)
      ? new CosmosClient(
	 { endpoint: argv.dbacct as string
         , aadCredentials: new EnvironmentCredential()
         })
      : undefined;
  if (client === undefined) {
    throw new Error("Need --dbconn or --dbacct");
  }
  const db = client.database(argv.db as string);

  {
    const table = db.container("AllowOwner");
    const iter = table.items
      .query("SELECT c.id, c.owner, c.label FROM c")
      .getAsyncIterator();
    for await (const { resources: rows } of iter) {
      rows.forEach((row) => {
        console.log("USER", row.owner, row.label, row.id)
      });
    }
  }

  {
    const table = db.container("AllowRepository");
    const iter = table.items
      .query("SELECT c.id, c.owner, c.repo, c.label FROM c")
      .getAsyncIterator();
    for await (const { resources: rows } of iter) {
      rows.forEach((row) => {
        console.log("REPO", row.owner, row.repo, row.label, row.id)
      });
    }
  }
}
