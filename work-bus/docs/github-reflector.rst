####################
The GitHub Reflector
####################

This is a stab at `Autoscaling with Self-Hosted Runners
<https://docs.github.com/en/actions/hosting-your-own-runners/autoscaling-with-self-hosted-runners>`_
without having to stand up Kubernetes or Terraform.

GitHub Ephemeral Runners
########################

Using GitHub ephemeral action runners requires some work:

* We must listen for WebHook callbacks and arrange for an ephemeral runner to
  present itself *after* a job has been queued.

* We must be able to create registration tokens for those ephemeral runners,
  which requires executing actions through GitHub's ABI, as such tokens expire
  after an hour.

This set of needs corresponds to a subset of the facilities of a `GitHub App
<https://docs.github.com/en/developers/apps>`_.  (In particular, Apps can also
act on behalf of users; for us, it suffices that the app always act as itself,
which dramatically simplifies the story.)  For the above to work, our App must
have **administration rights** on repositories and/or complete control over
self-hosted runners associated with organizations.  At the moment, we always
create tokens at repository scope, and so do not require the latter permission.
The App must also have at least read-only access to repository *contents* and
*metadata* in order to register for the ``workflow_job`` WebHook events.

Push-Pull Reflection
####################

In our initial deployment, our Morello cluster, we have a fixed number of
possible workers and would like to have them parked waiting for a job to be
available.  That is, we want the many workers to pull jobs, while GitHub wants
to push notifications to a single sink.  To glue the two together, we use an
Azure Service Bus (but any AMQP broker would do).  Our GitHub reflector accepts
GitHub WebHook HTTP POST requests, extracts the relevant information, and
enqueues messages to the bus, which holds messages until our workers can pick
them up.

GitHub Labels
#############

GitHub allows its workflows to specify a *sequence* of labels to constrain the
environment in which workflow jobs find themselves running; this is the
``runs-on`` field of a job description.  See
https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#jobsjob_idruns-on
for additional details.

While GitHub places no constraints on the form of labels, `github-act-runner
<https://github.com/ChristopherHX/github-act-runner>`_ uses a comma-separated
list to encode the sequence, so please do not use commas inside labels.
Probably best avoid shell metacharacters, UNICODE, and, really, anything
outside ``[A-Za-z0-9_-]``.

In order to use a self-hosted runner, GitHub requires that the label
``self-hosted`` be the *first* label in the sequence.  Our reflector therefore
quickly rejects, without queueing anything to its service bus, any workflow job
for which this is not true.  See, for additional detail, `GitHub's documentation
<https://docs.github.com/en/enterprise-server@3.3/actions/hosting-your-own-runners/using-self-hosted-runners-in-a-workflow>`_.

We, then, use the *second* label within the sequence as the message *subject*
in our work-dispatch service bus topic.  This field can be filtered using
service bus topic subscriptions, and so this is a convenient mechanism to
select *which* idle workers can pick up a given job.  Because this second label
routes messages in our system, it is also used in the `Access Control`_ checks
detailed below.

Our :doc:`Executor <executor>` uses the *third* label as a parameter to its
board startup script.

Access Control
##############

A limited form of access control is present; see :doc:`access_control`.

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

Configuration
#############

The GitHub reflector is configured primarily in Azure Function App Settings
(see :doc:`azure_setup`).

Source
######

The GitHub reflector source is in
:download:`/work-bus/github-reflector/Post/index.ts`; the remainder of the
``work-bus/github-reflector`` directory is configuration and build machinery.
