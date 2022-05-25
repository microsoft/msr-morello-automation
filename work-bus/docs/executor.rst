The Executor
############

The executor is the primary program which receives work requests and dispatches
to handlers.  At the moment, there is but one real handler, for
github-originated work.  (There is another, less-real handler, for telling an
executor to shut down.  This is useful to ensure that we do not interrupt a
running job.)

Listening For Events
====================

The executor needs to be told, in addition to the things enumerated below, the
following configuration:

``--busconn``
  specifies the *connection string* for an Azure Service Bus

``--busqueue``
  specifies an Azure Service Bus *Queue or Topic* upon which to listen for
  notifications of work.  If it is a Topic, ``--busqueuesub`` must be used to
  specify the *subscription* to use.

``--buscomplete``
  specifies an Azure Service Bus *Queue* upon which to listen for work
  completion events.  This bus must have *sessions* enabled, which we abuse to
  route related messages to workers.  See :doc:`azure_setup`.

Common Preparation
==================

The executor needs to be told how to prepare an execution environment (e.g.,
boot a Morello board).  Its ``--board_prepare`` argument names a script that
takes a single parameter specifying the flavour of boot.

In our cluster deployment, it is the responsibility of ``--board_prepare`` to
wrap the :ref:`run.int boot sequencing script <board-runner/README/run.init>`.
This means, concretely:

1. using the provided single parameter to

   1. arrange for the board to boot the appropriate HTTP export.  In our
      cluster, each board has a constant HTTP URL associated with it, which
      points at a symlink (in a ``tmpfs``) under this script's control.

   2. set loader script (to select the kernel from within that HTTP export),

   3. set the NFS root (to select the userland).  Despite the symlink game
      being played for the HTTP export, no similar game is necessary for NFS,
      as the NFS paths are not persisted to on-board flash memory.

   Usually the loader URL usually names (after symlink chasing) a path within
   the NFS root, though this is not, strictly, required.

2. targeting the executor itself for termination if the board panics.  This is
   done by noting that the executor is the parent process of the
   ``--board_prepare`` script being run.

Given a cluster of multiple boards, either many different ``--board_prepare``
scripts must be used to target different boards, or environment variables must
be set when the executor is run, so that they will be inhereited by the script.

We have not committed our ``--board_prepare`` script to the repository, as it is
mostly paths meaningful only within our cluster and likely subject to more rapid
churn than the rest of the infrastructure here.

Remote Commands
===============

The executor expects to be able to run commands in a "remote" context using
a wrapper specified by ``--remotecmd``.  This wrapper must plumb the three
standard file descriptors and should run its argument through a shell on the
remote end.

See :ref:`board-runner/README/ssh` for more.

Environment Variables
=====================

The ``MORELLO_HOSTNAME`` environment variable, used elsewhere in this system,
is also known to the executor proper.  It is used...

- when constructing a `GitHub`_ ephemeral runner's *name*, and

- when shutting down, to answer the request with which *which* executor was
  shut down.

GitHub
======

We are going to use https://github.com/ChristopherHX/github-act-runner to
execute the GitHub YAML workflow descriptions and to interface with the GitHub
API, as this reimplementation is more portable than the official runner.
Moreover, it can operate "natively", without depending on container or VM
isolation, and all the associated machinery, between it and the work to be
done.

However, when running potentially malicious work like that, we must be
judicious in what we expose to the actual runner.  Specifically, we must not
expose any of the GitHub App authority or the actual runner registration token,
which is not a single-use secret.  Therefore, we must run ``github-act-runner``
*twice*: once on the orchestration node, to generate the runner's private key,
and then again on the actual machine expected to do the work.

Building The Runner
-------------------

First off, note that you may be better served by using a binary release from
https://github.com/ChristopherHX/github-act-runner/releases/; there are,
conveniently, builds for FreeBSD on AArch64 that should run on Morello just
fine, and, of course, for Linux on amd64 (for our head node).

In any case, if you do want to build from source, you'll need ``golang`` of at
least 1.17.  Personally, I prefer to stick go's packages in a local directory::

  GOPATH=$PWD/go go build .

This creates a ``github-act-runner`` executable.

Invoking the runner
-------------------

The executor expects to be able to invoke the runner in two different ways:

* locally, to generate ``settings.json``, via ``--github_prepare``, and

* remotely, to consume ``settings.json``, via ``--remotecmd`` and
  ``--github_run``.

The preparation step is split between the executor itself and the
``--github_prepare``-specified command.  The former needs the github app's id
(``--github_appid``) and public key (``--github_key``) to be specified as well.
Armed with those, the executor can construct short-lived runner registration
tokens that are then fed to the ``--github_prepare``-specified command.  This
command, in order, takes as arguments

1. the *name* of the runner to register;
2. the *labels*, as a comma-separated list, to provide to GitHub;
3. the repository, named by its "HTML url"; and
4. the github API registration token.

Our specific instance of this script is available as
:download:`../executor/github-prepare.sh`, but note that it expects to find
``github-act-runner`` in ``local/bin`` relative to the root of this repository.

The labels must include the label associated with the service bus queue or
topic subscription specified above!

The script we use for ``--github_run`` is
:download:`/cheribsd-exports/files/opt/bin/msr-github-act-runner.sh`,
a thin wrapper around the ``/opt/bin/github-act-runner`` binary that
additionally...

* Sets ``HOME`` to writeable storage.

* Uses the ``aarch64`` ``pkg64`` set to install ``bash`` and ``npm-node16``
  (providing ``node`` of ``nodejs``)

* Works around `a bug
  <https://github.com/CTSRD-CHERI/cheribsd-ports/issues/9>`_ in
  CheriBSD/Morello's ability to run the ``go`` runtime, by including in the
  environment ``GODEBUG="asyncpreemptoff=1"``.

Exit Codes
==========

The executor exits with...

+----+--------------------------------------------+
| 0  | on receipt of a job completion message     |
+----+--------------------------------------------+
| 1  | on internal error of some form or another  |
+----+--------------------------------------------+
| 42 | on receipt of a shutdown message           |
+----+--------------------------------------------+
| v  | if the worker exits with code v            |
+----+--------------------------------------------+

Note that workers should generally be sensitive to the meanings that the
executor assigns to exit codes.  In particular, bailing with 42 will likely
take the board out of service until it is manually reinstated.
