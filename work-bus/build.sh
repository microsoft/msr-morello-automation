#!/bin/sh

set -e -u

npm i
tsc --build --verbose
chmod +x ./client-utils/dist/index.js
chmod +x ./executor/dist/index.js

( cd github-reflector && npm i && tsc --build --verbose )
