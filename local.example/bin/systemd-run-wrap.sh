#!/bin/bash

set -e -u

exec systemd-run \
  --user --wait --collect --same-dir --pty \
  -p RuntimeDirectory="morello/${MORELLO_HOSTNAME}" \
  -E MORELLO_HOSTNAME="${MORELLO_HOSTNAME}" \
  -E MORELLO_SCRIPTS="${MORELLO_SCRIPTS}" \
  "$@"
