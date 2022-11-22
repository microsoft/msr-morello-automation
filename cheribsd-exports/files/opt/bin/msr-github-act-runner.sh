#!/bin/sh

# The executor lands settings.json in /tmp since /root is R/O for us.
cd /tmp || exit

# github-act-runner wants to create $XDG_CACHE_HOME/act, but will fall back
# to $HOME/.cache/act.  Since $HOME is a popular thing to want, let's just set
# that here.
export HOME=/tmp

# GitHub actions use bash as their shell by default, so best install that.
# GitHub also loves to define actions in javascript, so install node and npm.
pkg64 install -y bash npm-node16

# XXX Workaround a runtime bug
# https://github.com/CTSRD-CHERI/cheribsd-ports/issues/9
export GODEBUG="asyncpreemptoff=1"

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

/opt/bin/github-act-runner run
E=$?

kill %1
exit $E
