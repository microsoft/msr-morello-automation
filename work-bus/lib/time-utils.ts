/*
 * Race `act` against a timeout of `timeMS` milliseconds.  If the timeout
 * expires, invoke (and wait for resolution of the return from) `onTimeout`.
 */
export function withTimeout<T>(
 act: Promise<T>,
 timeMS: number,
 onTimeout: () => Promise<void>) {
  let timeout : NodeJS.Timeout;
  let timeoutRunningP : Promise<void> | undefined = undefined;

  const timeoutP = new Promise<Promise<void>>((resolve) => {
    timeout = setTimeout(() => {
                timeoutRunningP = onTimeout();
                resolve(timeoutRunningP);
              }, timeMS);
  });
  const timeThen = timeoutP.then((p) => p);
  const actThen = act.then(async (v) => {
    clearTimeout(timeout); // cancel timeout if it hasn't happened yet
    if (timeoutRunningP !== undefined) {
      // timeout already fired; wait for it to finish (it may have already)
      console.log("work-bus executor: timeout fired; awaiting...")
      await timeoutRunningP
    }
    return v
  });
  return Promise.race([actThen, timeThen]).then(_ => actThen);
}

/*
 * Call `f` separated by an interval of `timeMS` milliseconds until told to
 * stop by invoking the `stop` field of its returned object.  This function
 * never overlaps invocation of `f`.
 */
export function periodically (timeMS: number, f: () => void) {
  let t : NodeJS.Timeout | undefined = undefined;
  const stop = () => {
    clearTimeout(t);
    t = undefined;
  };
  const step = () => {
    t = setTimeout(() => {
      f();
      if (t !== undefined) { step(); }
    }, timeMS);
  };
  step();
  return { stop: stop };
};
