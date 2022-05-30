export interface DispatchResult {
  /*
   * The actual worker job, yielding its exit code.
   */
  promise: Promise<number>;

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
