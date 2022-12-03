#!/bin/sh
set -e -u

cd "${RUNTIME_DIRECTORY}"
exec /usr/bin/node \
  --unhandled-rejections=strict \
  ${MORELLO_SCRIPTS}/work-bus/executor/dist/index.js \
    --config ${MORELLO_SCRIPTS}/local/executor-config.json
