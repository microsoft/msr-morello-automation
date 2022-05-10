####################
Notes on TLS in UEFI
####################

This is a bit of a pain, sorry.

EDK2 Changes
############

As of April 2022, the ``morello-firmware`` images shiped by Arm do not include
TLS support out of the box.  Fortunately, sufficient (if primitive) support is
available in EDK2 source.  Follow the instructions at
https://git.morello-project.org/morello/docs/-/blob/morello/mainline/user-guide.rst
to clone the firmware sources.

In
``bsp/uefi/edk2/edk2-platforms/Platform/ARM/Morello/MorelloPlatform.dsc.inc``,
change ``NETWORK_TLS_ENABLE`` to ``TRUE`` and add ::

    TlsLib|CryptoPkg/Library/TlsLib/TlsLib.inf

to ``[LibraryClasses.common]``.  Rebuild and copy the results in
``output/soc/firmware`` to the MCC's USB storage device, specifically into the
``SOFTWARE/`` directory.

Installing the Certificate
##########################

The UEFI TLS tools require the use of a *file* to carry the TLS certificate.
That would be fine, except that Morello boards do not come with UEFI-writable
*filesystems* out of the box, every effort the author has made to use the UEFI
RamDisk mechanism has come to naught.  It therefore appears necessary to
provide the certificate on removable storage or *boot* the machine once and
create a filesystem whence UEFI can source the certificate.  On CheriBSD, for
example, assuming you don't care about anything on the attached disk::

    gpart create -s gpt ada0
    gpart add -t efi -s 32M ada0
    newfs_msdos /dev/ada0p1

Land a *DER*-formatted certificate on that filesystem, being sure to name it
something ending in ``.der``, ``.cer``, ``.crt``, or, for maximal confusion,
``.pem``.  *PEM*-encoded certificates will not work!

Then, use the ``Device Manager``'s ``Tls Auth Configuration`` menu in the UEFI
UI to install the certificate:

1. ``Server CA Configuration``
2. ``Enroll Cert``
3. ``Entroll Cert Using File``
4. browse to your file
5. ``Commit Changes and Exit`` (you can ignore the GUID field)

You should now be able to netboot over HTTPS.
