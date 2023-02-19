#!/bin/sh

# XXX
# It's possible someone else picked up the job we were spawned for and that we
# don't get assigned a job after all.  It would be much better if GitHub let
# runners declare which job they wanted, but so it goes.  See
# https://github.com/ChristopherHX/github-act-runner/issues/59 and
# https://github.com/ChristopherHX/github-act-runner/issues/60 .  As per the
# latter, we can time out our runner by sending it a single SIGINT: either it
# will have picked up a job and do nothing, or it won't have picked up a job
# yet and will stop listening and de-register itself.
(sleep 300; kill -INT -$$) &

# XXX Workaround a runtime bug
# https://github.com/CTSRD-CHERI/cheribsd-ports/issues/9
export GODEBUG="asyncpreemptoff=1"

/opt/bin/github-act-runner run
E=$?

kill %1
exit $E
