#!/bin/sh

set -e -u -x

if [ -z "${1-}" ] || [ ! -d "${1-}" ]; then
  echo 2>&1 "Need firmware directory as argument 1"
  exit 1
fi

if [ -z "${2-}" ] || [ ! -d "/dev/morello/${2-}" ]; then
  echo 2>&1 "Need board name as argument 2"
  exit 1
fi

if [ "$(id -u)" != "0" ]; then
  echo 2>&1 "Script must be run as root"
  exit 1
fi

FIRMWARE_PATH="$1"
MORELLO_HOSTNAME="$2"
MOUNTPOINT="$(mktemp -t -d morello-firmware-update.XXXXXXXXXX)"

mount "/dev/morello/${MORELLO_HOSTNAME}/mccsd" "${MOUNTPOINT}"

rsync --inplace --exclude .git -crvvP "${FIRMWARE_PATH}"/. "${MOUNTPOINT}"/.
diff -rqw "${MOUNTPOINT}"/. "${FIRMWARE_PATH}"/.  || true

umount "${MOUNTPOINT}"
rmdir "${MOUNTPOINT}"
