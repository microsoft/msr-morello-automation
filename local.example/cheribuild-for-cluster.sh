#!/bin/zsh
set -e -u -x

rm -rf $HOME/cheri/output/rootfs-morello-purecap
rm -rf $HOME/cheri/output/rootfs-morello-hybrid

export TAR_WRITER_OPTIONS=xz:compression-level=0
A=(
  --enable-hybrid-targets

  morello-llvm

  cheribsd-morello-hybrid
  cheribsd-morello-purecap
    --cheribsd/build-bench-kernels
    --cheribsd/build-options="-DWITH_MALLOC_PRODUCTION"

  disk-image-mfs-root-morello-hybrid
  disk-image-mfs-root-morello-purecap
    --disk-image-mfs-root/extra-files=$HOME/cheri/extra-files-empty
    --disk-image-mfs-root/kernel-names ""

  rootfs-tarball-morello-hybrid
  rootfs-tarball-morello-purecap
    --rootfs-tarball/extra-files=$HOME/cheri/extra-files-empty
)
exec $HOME/cheri/cheribuild/cheribuild.py "${A[@]}"
