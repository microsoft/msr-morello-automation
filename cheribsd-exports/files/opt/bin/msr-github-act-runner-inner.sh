#!/bin/sh

# XXX Workaround a runtime bug
# https://github.com/CTSRD-CHERI/cheribsd-ports/issues/9
export GODEBUG="asyncpreemptoff=1"

exec /opt/bin/github-act-runner run
