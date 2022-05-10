#!/bin/sh
# This actually generates settings.json for our ephemeral runner.

set -e -u
SELFDIR=$(dirname "$(readlink -f -- "$0")")
exec "${SELFDIR}"/../../local/bin/github-act-runner configure \
  --unattended --ephemeral --no-default-labels \
  --name "${1}" --system-labels "${2}" --url "${3}" --token "${4}"
