#####################################
Automation for Running Morello Boards
#####################################

Here are a series of scripts we use for managing a worker Morello board in our
cluster environment.  The basic lifecycle of these nodes is...

- Perform a hard reset via the MCC and UEFI Netboot over HTTP.

- Steer the CheriBSD UEFI loader through booting a kernel with MFS root.

- Pivot onto a NFS root.

- Hand off control of the board to another script (which interacts over ssh),
  until that script terminates.

  During this phase, it may be useful to log the board's console in case of
  panics, but we no longer rely on the console for control.

.. _board-runner/README/booting:

Booting
#######

Stages :ref:`1 <board-runner/README/mcc>` through :ref:`3
<board-runner/README/mfs>` herein are sequenced by
:ref:`board-runner/README/run.init`, but can be run individually if desired.
Stage :ref:`4 <board-runner/README/ssh>` uses :download:`run.ssh`, which assumes
that :ref:`board-runner/README/run.init` has been run or that a suitable
synthetic environment has been created.

.. _board-runner/README/mcc:

Stage 1: MCC and UEFI
=====================

Morello M1SDP boards have an onboard supervisor called the Motherboard
Controller Chip ("MCC") that must be told to start the board.  Once powered on,
the Morello SoC itself boots using UEFI firmware, and all our boards pull their
systems over the network, using UEFI's HTTP boot facility.  The
:download:`mcc-efi.expect` script here knows how to make all that happen.  It
must be given the following parameters:

``-board DIR``
   names the ``DIR``-ectory under ``/dev/morello`` that contains all the
   board's UARTs.  Recall :doc:`our cluster management setup
   <../cluster-management/README>`.

``-boot-url URL``
   sets the URL (``http`` or ``https``) that will be programmed into the EFI
   boot options.

For debugging, this script also takes a ``-skip SKIPS`` argument, with
``SKIPS`` a comma-separated list of stages to elide:

``mcc``
   assume the board is already powered on

``uefiescape``
   don't wait for the "Press ESCAPE" message from UEFI

.. _board-runner/README/loader:

Stage 2: CheriBSD Loader
========================

In general use, our ``-boot-url`` provided above is to the CheriBSD
:ext-freebsdman:`loader_efi(8)` (and, in particular, its ``loader_lua.efi``
incarnation).  This EFI program knows how to load the rest of ``/boot`` from
next to itself, and, so, pulls in our :download:`/boot/loader.conf.local
<../cheribsd-exports/files/boot/loader.conf.local>`.

Our cluster runs CheriBSD and uses its :ext-freebsdman:`diskless(8)` facility
to have read-only root filesystems imported over NFS.  Unfortunately, this game
is not as seamless as might be desirable, in part because EFI HTTP boot is not
completely supported.  Instead, we play a very Linux-like game with a MFS image
specified in the above ``/boot/loader.conf.local``.

.. _board-runner/README/mfs:

Stage 3: From the CheriBSD Loader to NFS Root
=============================================

Our :download:`cheribsd-mfs.expect` script walks the system through boot using
this loader-provided MFS image and does some other customization during boot
before pivoting onto a NFS root and letting :ext-freebsdman:`diskless(8)` take over.  The
network is configured via DHCP, the on-system SATA storage is initialized, some
randomness is imported from the host, and a SSH host key is provided for the
system's use.  This script must be given the following parameters:

``-board DIR``
   as above

``-loader-script``
   specifies a path to a file to be loaded by :ext-freebsdman:`loader(8)` by
   its ``include`` mechanism (see :ext-freebsdman:`loader_simp(8)`).  This path
   is interpreted relative to the parent directory of ``-boot-url`` given to
   the script above (that is, relative to ``.../`` with the ``-boot-url``
   pointing into ``.../boot/loader.efi``).  We expect this script to perform
   any remaining configuration and then boot the machine; in practice, we use
   :ext-freebsdman:`loader_lua(8)` and this path names a Lua script.

   If this option is not given, the loader is merely told to ``boot``.  (We
   expect that ``autoboot_delay`` is set to ``"NO"`` in ``/boot/loader.conf``
   so that we can better synchronize the handoff between our two scripts.)

``-nfs-root HOST:DIR``
   specifies the NFS export to use as the root filesystem.  This must be as per
   :doc:`../cheribsd-exports/README`.

It also accepts, and we always use, in practice, the following optional
parameters:

``-ssh-ecdsa KEY``
   specifies a host file containing a ECDSA OpenSSH private key to be copied to
   the board.

``-dhcp-out FILE``
   names a host file which will contain the board's DHCP-sourced IPv4 address.

``-lurk``
   fork off and detach a child task to hold open our connection to the board's
   UART.  This is useful to capture panics in logs, for example.  If this is
   being used without a process-hierarchy-killing process supervisor (for
   example, at the command line rather than under systemd), then you **must**
   ensure that you kill off the lurking ``socat`` (or the lurking ``expect``
   attached to it) before attempting to otherwise interact with the UART again,
   including re-running the these scrips.

``-panic-kill PID``
   in combination with ``-lurk``, this causes the forked off child to deliver
   ``SIGTERM`` to the given PID (or PID group, if negative) if the lurking
   listener sees a kernel panic.

Local Storage
-------------

A stack of ``geom``-etry devices and file-systems are constructed on the
on-system SATA device:

* The entire device is used for an ``ELI`` encrypted ``geom`` provider.

* A ``gpt`` partiton scheme is created inside that ``ELI`` layer.

* A large swap partition is created and labeled; it will be activated by
  partition label in ``/etc/fstab``, below.

* The remainder of the storage is used for a filesystem (the partition is,
  again, labeled).  This, too, will be mounted by ``/etc/fstab``, below, at
  ``/mnt``, and used to hold fetched packages and, presumably, much of the
  workload's temporary state.

Stage 3.1: Diskless NFS Root
----------------------------

Having pivoted onto the NFS root, the existing CheriBSD/FreeBSD
:ext-freebsdman:`diskless(8)` machinery takes over.  See
:ref:`cheribsd-build/README/diskless` for details.

.. _board-runner/README/run.init:

run.init
========

As mentioned, our :download:`run.init` script sequences stages :ref:`1
<board-runner/README/mcc>` through :ref:`3 <board-runner/README/mfs>`.

``run.init`` takes the following arguments or environment variables:

``-d MORELLO_HOSTNAME``
   Passed as ``-board`` in :ref:`board-runner/README/mcc` and
   :ref:`board-runner/README/mfs`.

``-l LOADER_URL``
   Passed as ``-boot-url`` in :ref:`board-runner/README/mcc`

``-n NFS_ROOT``
   Passed as ``-nfs-root`` in :ref:`board-runner/README/mfs`.

``-p ON_PANIC_KILL_PID``
   Passed as ``-panic-kill`` in :ref:`board-runner/README/mfs`.

``-s LOADER_SCRIPT``
   Passed as ``-loader-script``  in :ref:`board-runner/README/mfs`.

``run.init`` always passes ``-lurk`` in :ref:`board-runner/README/mfs`, so the
associated admonitions about unsupervised use apply here, too.

It additionally leaves the following files in the directory indicated by the
``RUNTIME_DIRECTORY`` environment variable (which is mandatory):

``ipaddr``
   holds the board's DHCP-assigned IPv4 address, as scraped from ``dhclient``
   during boot.

``ssh_known_hosts``
   pairs the board's IPv4 address with the (digest of the) ephemeral SSH host
   key.  This file is suitable for use with OpenSSH's UserKnownHosts option
   (see https://man.openbsd.org/ssh_config), and ``run.ssh`` uses it in exactly
   that way.

.. _board-runner/README/ssh:

Stage 4: SSH Access
===================

Now that we have booted and :ext-freebsdman:`diskless(8)` has done its thing,
our board is ready to accept SSH connections.  To make this easier on the
management host, we have a script, :download:`run.ssh`, which wraps the ``ssh``
executable and passes the requisite arguments.

This script assumes that the environment variable ``RUNTIME_DIRECTORY`` is set
to an absolute path containing the SSH known-hosts file and DHCP address as
created by :ref:`board-runner/README/run.init`, above.

The script will direct ``ssh`` to load, as a configuration file, the first of
``${MORELLO_SCRIPTS}/local/ssh.config`` or ``../local/ssh.config`` relative to
itself to exist, using ``-F``, and so supplanting the default ``~/.ssh/config``
parsing (if desired, it can be ``Include``-ed).  This is expecially useful in
combination with :ref:`ssh keys in the TPM <misc-docs/tpm-hsm/ssh>`.

A Note On Shutdown
##################

Usually at this point some *external* supervision will restart the process from
the top.  While the lifecycle above can generally be asynchronously aborted,
there may be constraints imposed by the external script at the end.  For
example, when running github actions, it is rude to interrupt the agent runner
after it has accepted a job but before the job has completed.

Host-side Dependencies
######################

Software
========

- HTTP(S) server (e.g., nginx) for netboot

  Disable directory auto-indexing, at least for the paths through which you'll
  be pulling CheriBSD netboot, as it seems to crash CheriBSD's
  :ext-freebsdman:`loader_efi(8)`.

  We assume that the NFS directories below are exported (read-only) over HTTP
  at ``/nfs`` and set script arguments appropriately, but, of course, YMMV.  In
  particular, you need only serve ``/boot`` over HTTP and can serve the rest
  exclusively over NFS, if desired.

- NFS server

  See :doc:`../cheribsd-exports/README` for how to create the export
  directory/ies.

- The software in this directory is implemented in ``expect`` and relies on
  ``tcllib`` and ``socat``.

- We also rely on the stable naming of Morello device nodes from
  :doc:`../cluster-management/README` within these scripts: they accept a board
  hostname argument and expect to be able to find the UARTs by using that name
  in path construction.

