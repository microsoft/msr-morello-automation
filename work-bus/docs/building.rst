########
Building
########

Most Everything
###############

Building most everything can be achieved by running, in the top-level directory
``./build.sh``.  This will construct a shared ``node_modules`` and build in the
various subdirectories.  (Out of tree builds seem complicated; I'm sorry.)

Unfortunately, the :doc:`github-reflector` needs special handling lest it get
too tangled up in the top-level, shared ``node_modules``.  As such it is *not*
a ``npm`` workspace but rather its own thing.  ``./build.sh`` knows how to play
the same game again in its directory.  The result is suitable for using ``func
azure functionapp publish ...`` to ship to Azure.
