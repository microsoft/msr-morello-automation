#######################################
Lightweight Ephemeral Runner Work Queue
#######################################

This is an overglorified multi-producer, multi-consumer work distribution
system.  The initial use case is pushing notifications of GitHub CI jobs onto
our Morello cluster, but we envision other sources and sinks.

What's Here?
############

There are two primary pieces of software involved in how we play this dance:

1. The :doc:`github-reflector <docs/github-reflector>`, which takes WebHook
   callbacks from GitHub and enqueues them to a shared message bus in Azure.

2. The :doc:`executor <docs/executor>` command, which drains messages from that
   shared bus and responds appropriately.  For GitHub Workflow messages, for
   example, it will use the GitHub API to configure and run a self-hosted
   runner for the repository indicated in the message.

There are also some more minor pieces of orchestration:

1. A lengthy sequence of PowerShell commands needed to stand up the GitHub
   reflector and its associated Azure entourage.  See :doc:`docs/azure_setup`.

As well, there are bits designed to facilitate introspection:

1. The `<github-reflector>`_ also queues messages to a "debug" message queue,
   allowing for parallel visibility into the system.  The
   ``azure-bus-queue-recv`` command can be used to drain this queue.  (If
   nobody is draining, messages will expire server-side after a little time;
   given that the messages are small and we are not likely to have a lot of
   them, this should be fine.)

2. We have a CLI tool, ``list-github-runners``, to enumerate all runners
   potentially associated with our GitHub App, to ease development and, should
   it be necessary, discovering any leaked runners.

3. The ``list-github-webhook-acls`` command can dump the allow lists for the
   `<github-reflector>`_.

Client Configuration
####################

The `<client-utils>`_ and `<executor>`_ programs are configured via their
command lines.  For convenience, they take a ``--config $FILE.json`` argument
that pulls additional command line arguments from ``$FILE.json`` (yes, the file
name must end in ``.json`` for NodeJS reasons; sadly, due to `a bug
<https://github.com/yargs/yargs-parser/issues/430>`_, it is not possible to
specify more than one ``--config`` file).  For ease of use, it is useful to
have such a file containing:

* ``busconn``, the *connection string* for our Azure Service Bus

* ``dbconn``, the *connection string* for our Azure Cosmos DB Account

* ``github_appid``, the *numeric* identifier of our GitHub App

* ``github_key``, the private key for our GitHub App in *PEM* format.  Note
  that JSON does not permit multi-line strings, so newlines must be encoded as
  ``\n``.

Most client commands then need only their ``--config`` parameter, or that and a
``busqueue`` parameter, rather than the full set of strings every time.  Of
course, even that can be put into the configuration file used by a particular
command.
