#!/bin/sh

# GitHub actions use bash as their shell by default, so best install that.
# GitHub also loves to define actions in javascript, so install node and npm.
pkg64 install -y bash npm-node16

# For historical reasons, the work-bus/executor/github "backend" installs
# settings.json into /tmp rather than into ~worker; move that to the new
# location.
mv /tmp/settings.json ~worker/

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

su - worker -c /opt/bin/msr-github-act-runner-inner.sh
E=$?

kill %1
exit $E
