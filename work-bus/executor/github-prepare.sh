#!/bin/sh
# This actually generates settings.json for our ephemeral runner.

set -e -u
SELFDIR=$(dirname "$(readlink -f -- "$0")")

case "$1" in
  "configure")
    exec "${SELFDIR}"/../../local/bin/github-act-runner configure \
      --unattended --ephemeral --no-default-labels \
      --name "${2}" --system-labels "${3}" --url "${4}" --token "${5}"
    ;;
  "remove")
    exec "${SELFDIR}"/../../local/bin/github-act-runner remove
    ;;
  *)
    echo >&2 "Bad github-prepare verb $1"
    exit 1
esac
