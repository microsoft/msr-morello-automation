Additional NFS Exports in the Cluster Environment
#################################################

We expose some additional material, beyond just root filesystems, over NFS.
Recall that NFS in the cluster is neither authenticated nor
integrity-protected, so nothing here should be sensitive.

/opt/msr-gitref
===============

Many of our jobs work by checking out one or more public ``git`` repositories.
Since we know what those are ahead of time, we can generate a ``git``
repository that contains useful subsets of those repositories, export it over
NFS, and teach ``git`` to use it when cloning, reducing network traffic and
time taken.  As the location of this NFS share is inherently specific to our
deployment, we do not include the exact ``/etc/rc.d`` script that we use to
mount it as part of this repository, but see :ref:`below
<local/more-nfs/opt/msr-xtra/rcd>` for what a very similar dance looks like.

.. _local/more-nfs/opt/msr-xtra:

The Mysterious /opt/msr-xtra
============================

Sometimes we need to bring up a board with a custom kernel (e.g., for temporal
safety research) or feed extra files in from the management node... without
changing the base system image exported over NFS.  In an ideal world, we would
do this by ``zfs clone``-ing the base image and just thwapping files into
place, but, sadly, that doesn't work unless we run at least *something* as root
on the management node, because Linux requires root privileges to mount
file-systems in ways the in-kernel NFS server can export.

Instead, we perform a little bit of terror.  We construct a scratch directory
that is available over both NFS (at, say, ``$SCR_NFS``) and HTTP
(``$SCR_URL``).  These paths are *predicatable* and indexed per-board.

In this directory, we deposit...

- a symlink of ``boot`` to the ``boot`` of the *NFS* export that will form the
  machine's root filesystem (``$ROOT_NFS``). [#f1]_

- a directory ``opt/msr-xtra/boot/kernel`` holding the kernel *and modules* we
  wish to boot.

- a file ``opt/msr-xtra/boot/script`` that will guide the bootloader through
  booting ``opt/msr-xtra/boot/kernel``.

- any extra files we wish to share from the management node also go into
  ``opt/msr-xtra``.

We then instruct the UEFI loader to load :ext-freebsdman:`loader(8)` from
within this scratch directory over HTTP, specifically, from
``./boot/loader.efi`` relative to ``$SCR_URL``. [#f2]_ This means that
:ext-freebsdman:`loader(8)` will also decode the path string ``/opt/msr-xtra``
relative to ``$SCR_URL``, and so we can tell it to source instructions from
``/opt/msr-xtra/boot/script`` and the right things will happen.

Importantly, that script instructs the kernel to load its NFS root from
``$ROOT_NFS``, not ``$SCR_NFS``, since we have not synthesized a full root
directory in the latter.  Thus, once the kernel is running, ``/opt/msr-xtra``
has lost its meaning and is just an empty directory in ``$ROOT_NFS`` and so
something must be done.  That something is a script inserted into ``/etc/rc.d``
that runs ``BEFORE: FILESYSTEMS``; see below.

At this point, ``/opt/msr-xtra/boot/kernel`` once again resolves to the same
directory that the loader saw and, importantly, attempts to load kernel modules
relative to the default ``kern.module_path`` :ext-freebsdman:`sysctl(8)` will
behave as expected.  As a bonus, the rest of ``/opt/msr-xtra`` is also
available.

Making A Boot Environment
-------------------------

You will want to include the following files:

* ``kernel/kernel`` - of course
* ``kernel/geom_eli`` - needed for our storage game
* ``kernel/gpart_gpt`` - needed for our storage game
* ``kernel/mac_ntpd`` - apparently something about our userspace pulls this in

Optionally, also include

* ``kernel/fusefs.ko`` - for FUSE support if you wish
* ``kernel/hwpmc.ko`` - for benchmarking

The simplest ``boot/script`` to use is one which largely mimics our default
script::

    config = require"config"
    config.reload("/boot/msr/_common.conf")
    config.parse("kernel=\"/opt/msr-xtra/boot/kernel\"")
    config.loadelf()
    cli_execute("boot")

This pulls in our custom ``mfs.img`` as well.

.. rubric:: Footnotes

.. [#f1] Ordinarily, our HTTP exports as consumed by
   :ref:`board-runner/README/loader` are just symlinks to the NFS export behind
   ``$ROOT_NFS``.  However, :ext-freebsdman:`loader(8)` accesses only paths in
   ``/boot``, so we can get away with this single link.


.. [#f2] As mentioned in :doc:`/work-bus/docs/executor`, to minimize
   wear on the UEFI persistent variable store, we actually tell UEFI about
   *another*, per-board symlink that we can repoint on the host.  Here, we
   repoint that symlink to our scratch directory.

.. _local/more-nfs/opt/msr-xtra/rcd:

The /etc/rc.d Script
====================

This script knows how to ...

1. discover ``$ROOT_NFS`` (``mount -p | awk '$2 == "/"{ print $1 }'``).

2. derive ``$SCR_NFS`` from ``$ROOT_NFS`` and ``hostname -s``.  This step is
   non-portable and is why we do not include the script itself in the
   ``cheribsd-exports`` herein.

3. Mount ``${SCR_NFS}/msr-xtra`` on ``/opt/msr-xtra``.
