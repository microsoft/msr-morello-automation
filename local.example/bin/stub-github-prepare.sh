#!/bin/sh
SELFDIR=$(dirname "$(readlink -f -- "$0")")
echo "===> Github prepare in $SELFDIR: $@"
touch settings.json
