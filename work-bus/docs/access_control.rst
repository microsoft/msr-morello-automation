Access Control
##############

Introduction
============

GitHub Apps have two install-ability states:

* A *private* GitHub App may be installed only on repositories owned by its
  owner.

* A *public* GitHub App may be installed by anyone who visits its installation
  URL (a GitHub endpoint indexed by the App's *name*, curiously enough:
  `<https://github.com/apps/${appname}/installations/new>`_).

We would like to have some flexibility in where we make Morello CI available.
While we intend to restrict to repositories controlled or vouched for by MS
FTEs, not all such repositories are under the ``microsoft`` GitHub organization.
As such, it will be convenient to straddle organizations and organizations, and
so we intend to make our GitHub App *public*.  However, to prevent just anyone
from running code on our cluster, the reflector implements a simple
authorization check, which permits granting an entire user/organization or a
particular (owner,repository) pair access.

CosmosDB Schema
===============

Concretely, we use a "serverless" CosmosDB holding a *very small amount of
data* to hold the authorized sets (calling them ACLs would really be
over-glorifying what's going on here).

We have a Database within our Cosmos DB Account called ``GitHubWebHookDB`` and,
within that, two containers, ``AllowOwner`` and ``AllowRepository``.  These
containers hold allow-lists.  The items within the ``AllowOwner`` have two
salient fields, ``owner``, the user or organization, and ``label``, the
work-queue topic label (i.e., github ``runs_on`` label), to allow.  The items
within the ``AllowRepository`` container have three salient fields, ``owner``
and ``label`` as above and the new ``repo`` field, the repository name.

The client command `list-webhook-acls
<../client/src/cmds/list-webhook-acls.ts>`_ can enumerate all granted access
given the connection string to the Cosmos DB account.  There is not yet a
similar tool for *modifying* these sets; it is perceived to be sufficiently rare
and sufficiently straightforward through the Azure Portal.

Within the :doc:`reflector <github-reflector>`, the ``aclCheck`` function
encapsulates the logic.  At the moment, it is up to each hook to perform the
check if appropriate: not all hooks are "about" repositories, and it was
convenient for debugging to be able to *report* the ACL check result for
debugging on events that did not result in our automation taking other action.

Notes
=====

* There appears to be no facility to refuse association of a public App with an
  user, an organization, or a repository.  Therefore, we continue to ignore
  installation notifications and simply filter individual requests.

* The use of Cosmos is ridiculous, but it is significantly less expensive than
  Azure SQL or the apparently much more appropriate App Configuration offerings.
