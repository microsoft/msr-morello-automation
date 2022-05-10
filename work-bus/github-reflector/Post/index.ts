import { CosmosClient, Database as CosmosDB } from "@azure/cosmos"
import { AzureFunction, Context, HttpRequest } from "@azure/functions"
import { DefaultAzureCredential } from "@azure/identity"
import { ServiceBusClient, ServiceBusMessage } from "@azure/service-bus"

import { Webhooks, EmitterWebhookEventName } from "@octokit/webhooks"

import { QueueDataTypes as lqty } from "@msr-morello-work-bus/lib"

// @types/node lets us enumerate keys in process.env for TS
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      ACL_COSMOS: string;
      GITHUB_HMAC_KEY: string;
      SBCONN__fullyQualifiedNamespace: string;
    }
  }
}

/*
 * Perform an ACL check using the owner and repository fields of the event, by
 * probing a CosmosDB.  See docs/access_control.rst .
 *
 * XXX 202201 Sadly, because the query we want to make depends on the POST
 * *body* (and not the URI "route" or query parameters), we can't avail
 * ourselves of the "bindings" infrastructure (which won't just give us a
 * handle to a database, but, rather, really wants to run queries for us), and,
 * so, here we are.
 */
async function aclCheck(db: CosmosDB, owner: string, repo: string, label: string) {
  // Is the owner * label tuple authorized?
  try {
    const {resources: ownerOK} = await db.container("AllowOwner").items.query(
      { query: "SELECT c.id FROM c WHERE c.owner = @owner AND c.label = @label"
      , parameters: [ { name: "@owner", value: owner }
                    , { name: "@label", value: label }
                    ]
      }).fetchAll();
    if (ownerOK.length > 0) {
      return true;
    }
  } catch (err) {
    // CosmosDB throws if the container isn't present
  }

  // What about the owner * repo * label tuple?
  try {
    const {resources: repoOK} = await db.container("AllowRepository").items.query(
      { query: "SELECT c.id FROM c WHERE" +
               " c.owner = @owner AND c.repo = @repo AND c.label = @label"
      , parameters: [ { name: "@owner", value: owner }
                    , { name: "@repo", value: repo }
                    , { name: "@label", value: label }
                    ]
      }).fetchAll();
    if (repoOK.length > 0) {
      return true;
    }
  } catch (err) {
    // Again, just take that to mean "no"
  }

  return false;
}

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
  const webhooks = new Webhooks({ secret: process.env["GITHUB_HMAC_KEY"] });
  const selfcred = new DefaultAzureCredential();

  /*
   * XXX 202201 Because we want to do something more than post text to a queue,
   * we can't avail ourselves of the serviceBus output bindings for everything.
   * Rather than construct two clients, one for the bindings and one for us,
   * just do it all by hand.
   *
   * The "__fullyQualifiedNamespace" bit of the config variable name comes from
   * the binding logic, though I cannot find where that actually happens.
   */
  const sbClient = new ServiceBusClient(
    process.env["SBCONN__fullyQualifiedNamespace"], selfcred);
  const sbSendDebug = sbClient.createSender("github-reflector-debug");

  context.res = { };

  webhooks.onError((err) => {
    context.log(err);
    context.res = { status: 417, body: "Runtime error: " + err };
  });

  // What we're actually here for
  webhooks.on("workflow_job", async function ({id, name, payload})
  {
    const labels = payload.workflow_job.labels
    context.log(
      "Got workflow_job event action=%s on repository=%s (org=%s) from=%s; runs-on=%s",
      payload.action, payload.repository.full_name,
      payload.organization && payload.organization.login,
      payload.sender.login, labels);

    /*
     * Filter jobs to those which are for self-hosted runners.  According to
     * https://docs.github.com/en/enterprise-server@3.3/actions/hosting-your-own-runners/using-self-hosted-runners-in-a-workflow
     * the self-hosted label must come first.
     */
    if (labels.length == 0 || labels[0] != "self-hosted") {
      context.log("Not for self-hosted; done");
      context.res = { status: 200, body: "Not for self-hosted; done" };
      return;
    }

    /*
     * While one might imagine that the third were optional, because GitHub
     * matches by conjunct, we really do need to have all of them.  Similarly,
     * we can't permit extras.
     */
    if (labels.length != 3) {
      context.log("Wrong number of runs-on labels");
      context.res = { status: 200, body: "Wrong number of runs-on labels" };
      return;
    }

    const cosmos = new CosmosClient(
      { aadCredentials: selfcred
      , endpoint: process.env["ACL_COSMOS"] });

    try {
      const db = cosmos.database("GitHubWebHookDB");

      // Require that the source be in the ACL
      if (!await aclCheck(db,
                          payload.repository.owner.login,
                          payload.repository.name,
                          labels[1])) {
        context.log("Unauthorized; done")
        context.res = { status: 200, body: "Unauthorized; done" };
        return;
      }
    } finally {
      await cosmos.dispose();
    }

    // Send a very short summary onwards
    const summary =
      { type: "github-workflow"

        // Fields for debugging more than anything else
      , action: payload.action
      , conclusion: null
      , // The runner identifier (namespace per owner/repo)
        runner: payload.workflow_job.runner_name

      , /*
         * The workflow identifier; this is stable across queued / in_progress /
         * completed events and we will use it in message routing, below
         */
        id: payload.workflow_job.id

      , // Which hat to wear when creating a runner registration token
        installation: payload.installation.id

      , // Identify the repository to which the runner should bind...
        owner: payload.repository.owner.login
      , repo: payload.repository.name

      , /*
         * You'd imagine this would be the .url field, but no, the runner
         * config.sh wants the HTML URL, so, here 'tis!
         */
        repo_html_url: payload.repository.html_url

      , /*
         * Pass through the entire set of labels.  The first *must* be
         * self-hosted (as per the above check and GitHub's own docs).
         * The second has been checked against our allow-lists, and the
         * others are freeform.  See docs/github-reflector#labels
         */
        labels: labels
      };

    if (payload.action == "completed") {
      summary.conclusion = payload.workflow_job.conclusion;
    }

    // To the debug channel...
    await sbSendDebug.sendMessages(<ServiceBusMessage> { body: summary })

    /*
     * And the work-queue topic, with deduplication (messageId) and
     * subscription routing (subject)
     */
    switch (payload.action) {
    case "queued":
     {
      const sbSendQ = sbClient.createSender("work-queue");
      await sbSendQ.sendMessages(<ServiceBusMessage>
        { messageId: `githubQ-${summary.id}`
        , subject: labels[1]
        , body: <lqty.GitHubWorkflowJobQueuedEvent> summary });
      await sbSendQ.close();
      break;
     }
    case "completed":
      if (summary.runner !== null) {
        /*
         * Abuse the notion of sessions to allow our workers to wait only for
         * messages addressed to them.  Note that this is the runner name and
         * is not at all a function of the job ID, as there is no easy way to
         * get the job ID that got picked up by a particular runner.
         *
         * Use messageId as intended, for message
         * deduplication.
         */
        const sbSendQ = sbClient.createSender("work-complete");
        await sbSendQ.sendMessages(<ServiceBusMessage>
          { sessionId: `github-${summary.runner}`
          , messageId: `github-${summary.runner}-${summary.id}`
          , body: <lqty.GitHubWorkflowJobCompletedEvent> summary
          });
        await sbSendQ.close();
      } else {
        /*
         * A null runner with completion means that the job has been aborted
         * before a runner bound to it.  There's an ugly race, here, because
         * runners can't bind specifically to the job that caused them to be,
         * and so there's merely *some* executor out there that's about to be
         * disappointed.  See
         * https://github.com/ChristopherHX/github-act-runner/issues/60
         *
         * XXX There's not much we can do here except institute some timeout
         * on listening for ephemeral jobs, I think?
         */
      }
      break;
    }
  })

  /*
   * Star events are easily triggered and serve as a convenient debugging
   * hook; write something like what we would have written for the workflow_job
   * to the debug bus.
   */
  webhooks.on("star", async function ({id, name, payload})
  {
    context.log("Got star event action=%s", payload.action);

    const cosmos = new CosmosClient(
      { aadCredentials: selfcred
      , endpoint: process.env["ACL_COSMOS"] });

    try {
      const db = cosmos.database("GitHubWebHookDB");
      const event : lqty.GitHubStarEvent =
        { type: "github-star"
        , action: payload.action
        , starred_at: payload.starred_at
        , installation: payload.installation.id
        , owner: payload.repository.owner.login
        , repo: payload.repository.name
        , repo_html_url: payload.repository.html_url
        , debug:
            [ await aclCheck(db,
                payload.repository.owner.login,
                payload.repository.name,
                "msr-morello")
            , await aclCheck(db,
                payload.repository.owner.login,
                payload.repository.name,
                "reflector-debug")
            ]
        };
      await sbSendDebug.sendMessages(<ServiceBusMessage> { body: event })
    } finally {
      await cosmos.dispose();
    }
  })

  await webhooks.verifyAndReceive({
    id: req.headers["x-github-delivery"],
    name: <EmitterWebhookEventName> req.headers["x-github-event"],
    payload: req.body,
    signature: req.headers["x-hub-signature-256"],
  })
  .catch((err) => {
    context.log(err)
    context.res = { status: 417, body: "Thrown error: " + err };
  });

  await sbSendDebug.close();
  await sbClient.close();
  context.done();
};

export default httpTrigger;
