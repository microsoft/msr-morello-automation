#!/bin/sh

# GitHub actions use bash as their shell by default, so best install that.
# GitHub also loves to define actions in javascript, so install node and npm.
pkg64 install -y bash npm-node16

# For historical reasons, the work-bus/executor/github "backend" installs
# settings.json into /tmp rather than into ~worker; move that to the new
# location.
mv /tmp/settings.json ~worker/

exec su - worker -c "exec /opt/bin/msr-github-act-runner-inner.sh"
