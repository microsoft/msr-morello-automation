############################
Tools For Cluster Management
############################

Controller Environment
######################

The management system has two groups for its work:

- ``morello-auto`` for everything to do with the automation itself
- ``morello-user`` for shared user files (like this repository)

The management system also has the user ``morello-auto`` (in the group
``morello-auto``) for the daemons themselves.

Cluster Description File
########################

We describe our cluster in JSON for ease of tooling.  The schema is a
dictionary with keys...

``clustername``
   a human-friendly name for the cluster

``machines``
   a list of dictionaries with keys...

   ``hostname``
      a machine-friendly string naming the machine

   ``location``
      a human-friendly string

   ``MCC-serno``
      the serial number of the USB storage device exposed by the board's MCC.


   ``PCC``
      the Ethernet MAC of the PCC, hex octets with colon separators

   ``GBE``
      the Ethernet MAC of the AP SoC itself (as used by, e.g., CheriBSD)

   ``SMC``
      the Ethernet MAC of the SMC

Creating this JSON file is something of a manual task.

- Generally speaking, rummaging around in ``/sys/bus/usb/devices`` is perhaps
  the easiest way to find the relevant serial numbers; in particular, the MCC
  USB storage device serial number will be in a file whose path looks like
  ``/sys/bus/usb/devices/*.3/serial``.  (The debug UARTs may have serial
  numbers in similar files, at ``/sys/bus/usb/devices/*.{1,2}/serial``, but we
  have observed these as being unprogrammed on occasion.  Similarly for the USB
  debug on port 6 of the internal hub.)

- It is possible to find the MAC addresses of the device from the MCC UART
  using the EEPROM menu READCF command; they are at offsets 0x50 (AP GbE), 0x60
  (PCC), and 0x70 (SMC), in Ethernet wire format order (that is, with the octet
  usually rendered *rightmost* at offset 0).  For cross-validation, the suffix
  of the device's MCC USB storage device's serial number is also present at
  offset 0x10.

Tools Here
##########

:download:`udev-morello-hub.sh`
   a busybox shell script that attempts to extract a Morello board's MCC's USB
   storage device's serial number given two arguments, the path to ``sysfs``
   and the ``$bus-$devpath`` string that describes the location of a Morello's
   root USB hub.

:download:`cluster-to-udev.sh`
   consumes the JSON description of a cluster and generates a file suitable for
   installation as, for example, ``/etc/udev/rules.d/morello-usb.rules`` that
   serves to set suitable permissions and create stable names for the many
   devices exported by the boards over their USB DBG interfaces.

   - Devices will be placed under ``/dev/morello/${hostname}`` where
     ``${hostname}`` is the machine's ``hostname`` as given in the JSON
     description.

   - We create links for all the UARTs (``tty-`` followed by ``mcc``, ``ap0``,
     ``ap2``, ``fp0``, ``fp1``, ``pcc``, ``mcp``, and ``scp``) and the MCC's
     USB storage device (``mmcsd``).

   - This script generates output that assumes that the above
     :download:`udev-morello-hub.sh` script is available in
     ``/usr/local/sbin``.

:download:`morello-worker@.service`
   a `systemd <https://www.freedesktop.org/software/systemd/man/systemd.html>`_
   `service <https://www.freedesktop.org/software/systemd/man/systemd.service.html>`_
   `unit <https://www.freedesktop.org/software/systemd/man/systemd.unit.html>`_
   template which can be used to wrap :doc:`../work-bus/docs/executor` and all
   the successive machinery herein.  Copy this file to ``/etc/systemd/system``.

   It assumes the use of a *drop-in* configuration file in
   ``/etc/systemd/system/morello-worker@.service.d/`` to, at least, set the
   ``${MORELLO_SCRIPTS}`` environment variable::

     [Service]
     Environment=MORELLO_SCRIPTS=/path/to/this/repository

   If you are using client secrets or keys to identify as an Azure service
   principal, this drop-in mechanism can also be used to set the :ref:`required
   environment variables <work-bus/docs/azure_setup/service_princ_env>`.
   Because systemd does not consider configuration secret, you must use an
   ``EnvironmentFile`` to set ``AZURE_CLIENT_SECRET`` securely.  Be
   sure to restrict its ownership and permissions (probably to just
   ``root:root`` and ``0600``).

   You may also wish to add ``[Unit]``-level directives like ``After=`` to
   ensure that filesystems are mounted.

   See also :download:`../work-bus/executor/wrapper.sh`, the command actually
   run by this unit file.  Note that the actual configuration file
   (``local/executor-config.json``) is *not under revision control*.  See
   :doc:`../work-bus/docs/executor` for a description of its contents.
