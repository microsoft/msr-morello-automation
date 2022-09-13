import type * as okw from "@octokit/webhooks-types"

export interface GitHubEventCommon {
  installation: okw.InstallationLite["id"];
  owner: okw.User["login"];
  repo: okw.Repository["name"];
  repo_html_url: okw.Repository["html_url"]
  debug: any | undefined;
}

/* From reflector, for debug only */
export interface GitHubStarEvent extends GitHubEventCommon {
  type: "github-star";
  action: okw.StarEvent["action"];
  starred_at: okw.StarEvent["starred_at"];
}

/* From reflector to executor, on work queue */
export interface GitHubWorkflowJobQueuedEvent extends GitHubEventCommon {
  type: "github-workflow"; /* XREF executor/dispatch.ts */
  action: okw.WorkflowJobQueuedEvent["action"];
  id: okw.WorkflowJob["id"];
  labels: okw.WorkflowJob["labels"];
}

/*
 * From reflector to executor, on completed queue,
 * per session (`github-${JobQueuedEvent.id}`)
 */
export interface GitHubWorkflowJobCompletedEvent extends GitHubEventCommon {
  type: "github-workflow";
  action: okw.WorkflowJobCompletedEvent["action"];
  id: okw.WorkflowJob["id"];
  labels: okw.WorkflowJob["labels"];
  runner: okw.WorkflowJob["runner_name"];
  conclusion: okw.WorkflowJob["conclusion"];
}

/* From client to executor, on work queue */
export interface ShutdownQueuedEvent {
  type: "shutdown"; /* XREF executor/dispatch.ts */
  id: string; /* Used to construct reply session */
}

/* From executor to client, on work queue, per session (`shutdown-${id}`) */
export interface ShutdownReply {
  type: "shutdown-reply"; /* XREF executor/dispatch.ts */
  host: string; /* Which one is shutdown? */
}

export type EnqueuedJobEvent =
  | ShutdownQueuedEvent
  | GitHubWorkflowJobQueuedEvent;
