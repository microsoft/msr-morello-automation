#!/bin/zsh

set -e -u

[ ${#@} -eq 2 ] || {
  echo >&2 "Usage: create-export.sh EXPORT_NAME SOURCE_DIR"
  exit 1
}

: ${ROOT_NAME:=$1}
: ${SOURCE_DIR:=$2}

: ${ZFS_BASE:=tank/morello/export}
: ${CHERIBUILD_ARCH_SUFFIX:=morello-purecap}
: ${ROOTFS_TARBALL_FILE:=cheribsd-${CHERIBUILD_ARCH_SUFFIX}.tar.xz}
: ${MFS_IMAGE_FILE:=cheribsd-mfs-root-${CHERIBUILD_ARCH_SUFFIX}.img}
: ${KERNELS:=GENERIC-MORELLO GENERIC-MORELLO-PURECAP}
: ${CHERIBSD_FILES:=${(q)0:A:h}/files}
: ${CHERIBSD_FILES_LOCAL:=${(q)0:A:h}/../local/cheribsd-files}

checkfile() {
  [ -r "$1" ] || { echo >&2 "Missing $1"; exit 1; }
}

ROOTFS_TARBALL_PATH="${SOURCE_DIR}/${ROOTFS_TARBALL_FILE}"
checkfile "${ROOTFS_TARBALL_PATH}"

MFS_IMAGE_PATH="${SOURCE_DIR}/${MFS_IMAGE_FILE}"
checkfile "${MFS_IMAGE_PATH}"

# Verify the in-tree mtree(s)
bsdtar -c -C "${CHERIBSD_FILES}" @mtree >/dev/null
if [ -r "${CHERIBSD_FILES_LOCAL}/mtree" ]; then
  bsdtar -c -C "${CHERIBSD_FILES_LOCAL}" @mtree >/dev/null
else
  echo >&2 "# No local cheribsd-files mtree"
fi

# Create the ZFS filesystem
ZFS_NAME="${ZFS_BASE}/${ROOT_NAME}"
echo zfs create "${(q)ZFS_NAME}"
echo ZFS_MOUNT=\$\(zfs get -Ho value mountpoint \'${ZFS_NAME}\'\)

# Export it RO over NFS
echo zfs set sharenfs=ro,no_root_squash "'${ZFS_NAME}'"

# Populate root from tarball
echo bsdtar -C \"\${ZFS_MOUNT}\" --chroot --numeric-owner -xpf ${(q)ROOTFS_TARBALL_PATH}

# Thwap down our new files
echo bsdtar -c -C "${(q)CHERIBSD_FILES}" @mtree \| tar -x -C "\"\${ZFS_MOUNT}\""
[ -r "${CHERIBSD_FILES_LOCAL}/mtree" ] && \
  echo bsdtar -c -C "${(q)CHERIBSD_FILES_LOCAL}" @mtree \| tar -x -C "\"\${ZFS_MOUNT}\""
echo cp -r ${(q)MFS_IMAGE_PATH} "\"\${ZFS_MOUNT:?}\""/boot/msr/mfs.img

# The images come with pre-generated ssh host keys, courtesy of cheribuild.
# That isn't what we want, so remove them.
echo rm -f "\"\${ZFS_MOUNT:?}\""/etc/ssh/ssh_host_\*_key\*
