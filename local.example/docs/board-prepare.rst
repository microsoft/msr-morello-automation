###########################################
Board Boot Environments of board-prepare.sh
###########################################

Root Directories
################

There are a handful of root environments to choose from within the cluster.
Generally, that means one per release from the CL, named ``YYYY.MM`` or
``YYYY.MM.P`` for point releases.  Additionally, ``default`` aliases one of
those likely to be the most useful for consumers.

Environment Selectors
#####################

The strings we get from github do a little more than pick the NFS root.

For starters, they select the boot script, usually either ``benchmark`` or
``default``.  Thus, we have ``YYYY.MM(.P)?-(benchmark|default)`` as
environment selectors.  Everything to the left of the hyphen determines the
root and the rest determines the boot script, which really just amounts to
determining which kernel to boot.

The ``default`` and ``benchmark`` environment selectors behave as above but
use the ``default`` root filesystem.

xtra
====

In addition to the "easy" options, we have a more elaborate way to smuggle
extra configuration into the early boot process.  See
:ref:`local/more-nfs/opt/msr-xtra` for the board-facing parts of this terror.

Environments named ``xtra_${root}_${xtra}`` will have the root filessytem
selected by ``${root}`` as per the above.  ``${xtra}`` is an Azure storage blob
*container and path* (within a fixed account) whose contents will be pulled
onto the management node and exported as ``/opt/msr-xtra`` when the board
boots.  It is expected that this dance causes ``/opt/msr-extra/boot/kernel`` to
exist.  If ``/opt/msr-extra/boot/script`` comes to exist as well, then it will
be used as the boot loader script, allowing for very fine grained control over
the boot process; see files in ``/cheribsd-export/files/boot/msr/`` for example
scripts.  Anything else you might need to smuggle in should be brought in over
a more standard mechanism, such as an Azure SAS URL and ``rclone`` as part of
the workflow itself.

When constructing an "xtra" boot environment like this, please be sure to
include all of the modules detailed in
:ref:`cheribsd-exports/README/images/miniboot`.

The script must be run with sufficient privileges to access the Azure storage
blobs to perform this fetch.  That means, in practice, that the Azure AD
service principal which the executor uses to access the message bus should also
be granted access to the storage account in question.  We do not include the
storage account name in ``${xtra}`` above because the firewall policy for the
cluster limits the accounts to which we can speak.  If use of the Portmeirion
centralized account is not sufficient, we can sort something out.
