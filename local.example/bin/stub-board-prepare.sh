#!/bin/bash
echo "===> Stub board prepare $@"
echo ${RUNTIME_DIRECTORY} ${MORELLO_SCRIPTS} ${MORELLO_HOSTNAME}

if [ -n "${STUB_SLOW-}" ]; then
  for i in $(seq 1 ${STUB_SLOW}); do
    echo "Sleep 1m @ $i"
    sleep 60
  done
fi
