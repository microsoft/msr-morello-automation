########################
CheriBSD For The Cluster
########################

.. _cheribsd-build/README/diskless:

Diskless Operation
##################

We put an empty ``/etc/diskless`` in our NFS root to force the use of
:ext-freebsdman:`diskless(8)` when booting.  The ``/conf/base`` directory walks
:ext-freebsdman:`diskless(8)` through copying ``/etc`` into a MD filesystem,
and ``/conf/default`` populates ``/etc/fstab`` from
:download:`files/conf/default/etc/fstab`, which mounts
:ext-freebsdman:`tmpfs(5)` filesystems for ``/tmp`` and ``/var``, brings up
swap and mounts ``/mnt`` from the local SATA storage (configured during the
:ref:`MFS phase of boot <board-runner/README/mfs>`).

Constructing Images
###################

There are, essentially, two ways of building disk images: from a CheriBSD
release image or from scratch using ``cheribuild``.

From Release
============

.. TODO
.. todo::

   Will need to be documented once we have release images.

   The/A challenge here is to get MFS images from the release tarballs.
   Perhaps we just end up shipping the entirety of base.txz as MFS.

With cheribuild
===============

Build the following targets::

    morello-llvm
    cheribsd-morello-purecap
    rootfs-tarball-morello-purecap
    disk-image-mfs-root-morello-purecap

You may wish to pass the following options if building a benchmarking root:

``--cheribsd-morello-purecap/build-bench-kernels``
   to include the ``NODEBUG`` kernels used for benchmarking

``--cheribsd-morello-purecap/build-options="-DWITH_MALLOC_PRODUCTION"``
   to disable malloc debugging checks

You can significantly speed up the ``rootfs-tarball`` generation, at the cost
of a slightly larger file to transfer, by setting
``TAR_WRITER_OPTIONS=xz:compression-level=0`` in your environment before
invoking ``cheribuild``.  As these files are transferred usually once (from
build system to cluster head node) and not persisted, that is usually a
worthwhile tradeoff.

.. todo::

   The MFS images also require gpart and geli management tools added to them.
   This is not yet in upstream ``cheribuild``.

.. note::

   Optional targets you may wish to include as well, if you aren't wanting to
   use the CL packages::

      gdb-morello-hybrid-for-purecap-rootfs
      morello-llvm-morello-hybrid-for-purecap-rootfs
      git-morello-purecap
      rsync-morello-purecap
      gkermit-morello-purecap

You will want to copy the following ``output/`` products to the cluster host machine::

    cheribsd-morello-purecap.tar.xz
    cheribsd-mfs-root-morello-purecap.img

Setting Up the Network Shares
#############################

The :download:`create-export.sh` script will construct a series of ``sh``
commands to be run as root to build a suitable export filesystem (with the
intent being that the sysadmin should review them before executing them).  It
takes two arguments: the name of the export filesystem to create and a
directory containing the source material.

The command stream will also source files from the ``files`` directory beside
itself (and this document, most likely).  Some notes on the contents thereof:

* ``mtree`` describes not just what to pull from this directory but also the
  UID and GID and permission bits (and whatever else mtree can push into a
  tarball).

* ``/boot/loader.conf.local`` configures the loader as expected by the
  ``expect`` scripts in this directory.

* ``/etc/diskless`` is empty but its existence is necessary to force
  ``/etc/rc`` to run ``/etc/rc.initdiskless`` even though ``loader.efi`` does
  not hand off the proper kenv variables; recall our :ref:`our MFS-based
  workaround <board-runner/README/mfs>` and
  :ref:`cheribsd-build/README/diskless`.

* :download:`files/etc/rc.conf` (see :ext-freebsdman:`rc.conf(5)`) configures
  :ext-freebsdman:`rc(8)` services.  We bring up the network with DHCP (again,
  so that the daemon will renew our lease as our workload runs), set the clock
  with NTP, and start SSH.

* :download:`files/etc/rc.d/msr-morello-pre-net` runs quite early in the ``rc``
  boot chain (after the ``FILESYSTEMS`` target and before the ``NETWORKING``
  target) and finishes configuration started in :ref:`board-runner/README/mfs`.
  It...

  * installs the SSH key copied to the board, and

  * mounts ``nullfs``-es for ``/usr/local`` and ``/usr/local64``, backed by local
    storage from ``/mnt``.

Additionally, ``create-export.sh`` will also source
``../local/cheribsd-files/mtree`` (relative to itself) for additional local
files that should not be under revision control (e.g.,
``/opt/bin/github-act-runner`` for :doc:`../work-bus/docs/executor`).

Caching pkg
###########

Because our boards have very rapid cycling (single CI jobs), we consider it
polite to push their use of ``pkg`` (and ``pkg64``) behind a caching HTTP proxy.
(Concretely, we use ``squid`` running on the orchestrator node, but feel free to
adjust to taste.)

It would, ordinarily, suffice to write, to ``/usr/local/etc/pkg.conf`` (and
``/usr/local64/etc/pkg.conf``), having replaced ``PROXY`` appropriately this
stanza::

  pkg_env : {
    http_proxy: "http://PROXY:3128/"
  }

..

However, because our boards mount ``nullfs``-es over ``/usr/local`` and
``/usr/local64``, we cannot just ship such files in place in the NFS export.
Instead, we add an ``etc/rc.d/msr-morello-pkg`` boot script that generates
these files.  This script is ordered by::

  # REQUIRE: msr-morello-pre-net
  # BEFORE: NETWORKING

..

so that it runs after the ``msr-morello-pre-net`` script from above but before
anything that might go contact the pkg distribution server(s).
