##########################
Local /opt/bin Executables
##########################

``local/cheribsd-files/opt/bin`` contains a few files sourced from "out there,
somewhere".  In more detail,

* ``azcopy`` is built according to
  https://wiki.freebsd.org/Ports/sysutils/py-azure-cli on a Morello machine
  outside the cluster.  One needs to change the build command a bit::

      CGO_LDFLAGS=-fuse-ld=lld CC=clang \
      go build -v -buildmode=exe -ldflags=-s  -o azcopy

* ``github-action-runner`` is just a FreeBSD aarch64 binary from
  https://github.com/ChristopherHX/github-act-runner
