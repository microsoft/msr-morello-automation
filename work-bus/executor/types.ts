/*
 * A dispatched job has run to completion successfully; the work request should
 * be acknowledged and the executor should be restarted.
 */
export interface DispatchJobResultOK {
  result: "ok";
}

/*
 * A dispatched job has failed; the work request should be abandoned so that it
 * can be picked up by another worker and the executor should be restarted.
 */
export interface DispatchJobResultFail {
  result: "fail";
}

/*
 * A dispatched job is requesting that the executor shut down and not restart.
 */
export interface DispatchJobResultShutdown {
  result: "shutdown";
}

export type DispatchJobResult =
  DispatchJobResultOK | DispatchJobResultFail | DispatchJobResultShutdown;

export interface DispatchResult {
  /*
   * The actual worker job, yielding its exit code.
   */
  promise: Promise<DispatchJobResult>;

  /*
   * When an external event source reports that the work is done, this is the
   * session identifier on the completion queue to which that announcement will
   * be posted.  Recall ../docs/executor.rst .
   */
  completionFrom: string | undefined;

  /*
   * Optional cleanup thunk, run after racing promise and receipt of a message
   * as directed by completionFrom.
   */
  cleanup?(): Promise<void>;
}
