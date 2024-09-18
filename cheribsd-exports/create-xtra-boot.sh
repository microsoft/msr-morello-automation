#!/bin/bash

# Create a directory tree with a minimal kernel and the modules we require
# for our setup.

FILES=(
  kernel
  fusefs.ko
  geom_eli.ko
  geom_part_gpt.ko
  hwpmc.ko
  mac_ntpd.ko
  nullfs.ko
)

set -e -u

KERNDIR=$1
DESTDIR=$2

mkdir -p "${DESTDIR}/kernel"

for i in "${FILES[@]}"; do
  cp -v "${KERNDIR}/${i}" "${DESTDIR}/kernel/"
done
