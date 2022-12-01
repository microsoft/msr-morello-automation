###########
Azure Setup
###########

This file contains the Azure PowerShell commands used to instantiate the
cloud-side components of the dance here.

Getters
#######

To pick up where one left off, or to restart in the middle, we can look up
resources by name.  The Resource Group is required by just about everything::

    $resgrp = Get-AzResourceGroup morello-github

The "high-level" resources::

    $cdbacc = Get-AzCosmosDBAccount `
      -ResourceGroupName $resgrp.ResourceGroupName -Name morello-github-cosmos

    $ghacldb= Get-AzCosmosDBSqlDatabase `
      -ResourceGroupName $resgrp.ResourceGroupName -AccountName $cdbacc.Name `
      -Name GitHubWebHookDB

    $ghfn   = Get-AzFunctionApp -ResourceGroupName $resgrp.ResourceGroupName `
      -Name morello-github-entryfn

    $bus    = Get-AzServiceBusNamespace `
      -ResourceGroupName $resgrp.ResourceGroupName -Name morello-github-bus

And then lower-level entities that you're less likely to need::

    $stacc  = Get-AzStorageAccount `
      -ResourceGroupName $resgrp.ResourceGroupName -Name morellogithubstorage

    $ghaclown = Get-AzCosmosDBSqlContainer `
      -ResourceGroupName $resgrp.ResourceGroupName -AccountName $cdbacc.Name `
      -DatabaseName $ghacldb.Name -Name AllowOwner

    $ghaclrepo = Get-AzCosmosDBSqlContainer `
      -ResourceGroupName $resgrp.ResourceGroupName -AccountName $cdbacc.Name `
      -DatabaseName $ghacldb.Name -Name AllowRepository

    $wqghd  = Get-AzServiceBusQueue `
      -ResourceGroupName $resgrp.ResourceGroupName -Namespace $bus.Name `
      -Name github-reflector-debug

    $wqq    = Get-AzServiceBusTopic `
      -ResourceGroupName $resgrp.ResourceGroupName -Namespace $bus.Name `
      -Name work-queue

    $wqc    = Get-AzServiceBusQueue `
      -ResourceGroupName $resgrp.ResourceGroupName -Namespace $bus.Name `
      -Name work-complete

Note that some of these *names* are known by software and so require renaming
throughout the tree if desired.  In particular:

* The :doc:`github-reflector` code knows the service bus queue and topic names
  ``github-reflector-debug``, ``work-queue``, and ``work-complete``.

* The :doc:`executor` knows the service bus queue and topic names ``work-queue``
  and ``work-complete``.

* The :doc:`github-reflector` ``Post`` function itself and the
  :download:`list-github-webhook-acls
  <../client-utils/cmds/list-github-webhook-acls.ts>` utility know the
  database name, ``GitHubWebHookDB``, and the containers' names, ``AllowOther``
  and ``AllowRepository``.

The hope is that these are sufficiently namespaced (within particular Azure
resources whose names are *configurable*) that they do not need to be changed
if this software is multiply instantiated.

Constructors And Such
#####################

To actually create the resources and to set the associations between them, we
need to call constructors and occasionally post-factually update objects.

* Create the resource group::

    $resgrp = New-AzResourceGroup -Name morello-github -Location "UK South"

* Create a storage account and a Function App with managed identity for the
  :doc:`github-reflector`.::

    $stacc = New-AzStorageAccount -ResourceGroupName $resgrp.ResourceGroupName `
      -Kind StorageV2 -AccessTier Hot -SKU Standard_LRS `
      -AllowBlobPublicAccess 0 -Location 'UK South' -Name morellogithubstorage

    $ghfn = New-AzFunctionApp -ResourceGroupName morello-github `
      -StorageAccountName $stacc.StorageAccountName -OSType Linux `
      -Runtime node -RuntimeVersion 14 -FunctionsVersion 4 `
      -Location 'UK South' -Name morello-github-entryfn

    Set-AzWebApp -AssignIdentity $true -Name $ghfn.Name `
      -ResourceGroupName $resgrp.ResourceGroupName

    # Having done that, re-run the $ghfn = Get... to get .IdentityPrincipalId

* Create the message bus.  We use a *queue* for work events, where we treat all
  consumers as interchangeable.  We allow messages on the ``work-queue`` queue
  to be locked for 5 minutes (the maximum duration), rather than the default of
  1, to buy us some time to go through the worker registration flow, though not
  the entire job's work flow, before settling the message.

  The *completion* queue is created with *sessions* in a wild abuse of the
  protocol (the library lets us construct dynamic subscriptions to sessions,
  but only to sessions, without administrative control of the bus).

  ::

    $bus = New-AzServiceBusNamespace `
      -ResourceGroupName $resgrp.ResourceGroupName -Location 'UK South' `
      -SkuName Standard -Name morello-github-bus

    $wqghd = New-AzServiceBusQueue -ResourceGroupName $resgrp.ResourceGroupName `
      -Namespace $bus.Name -DefaultMessageTimeToLive P7D `
      -DeadLetteringOnMessageExpiration $false `
      -Name github-reflector-debug

    $wqq = New-AzServiceBusTopic -ResourceGroupName $resgrp.ResourceGroupName `
      -Namespace $bus.Name `
      -DefaultMessageTimeToLive P7D `
      -RequiresDuplicateDetection $true `
      -DuplicateDetectionHistoryTimeWindow P1D `
      -EnablePartitioning $false `
      -Name work-queue

    New-AzServiceBusSubscription -ResourceGroupName $resgrp.ResourceGroupName `
      -Namespace $bus.Name -Topic $wqq.Name `
      -Name msr-morello `
      -DefaultMessageTimeToLive P7D `
      -DeadLetteringOnMessageExpiration $false `
      -LockDuration PT5M

    $wqqdefrule = Get-AzServiceBusRule -ResourceGroupName $resgrp.ResourceGroupName `
      -Namespace $bus.Name -Topic $wqq.Name -Subscription msr-morello `
      -Name '$Default'
    $wqqdefrule.SqlFilter.SqlExpression = "sys.Label = 'msr-morello'"
    Set-AzServiceBusRule -ResourceGroupName $resgrp.ResourceGroupName `
      -Namespace $bus.Name -Topic $wqq.Name -Subscription msr-morello `
      -Name 'msr-morello' -InputObject $wqqdefrule

    $wqc = New-AzServiceBusQueue -ResourceGroupName $resgrp.ResourceGroupName `
      -Namespace $bus.Name -DefaultMessageTimeToLive P7D `
      -DeadLetteringOnMessageExpiration $false `
      -RequiresSession $true -Name work-complete

* Grant the :doc:`github-reflector` permission to push to the bus::

    New-AzRoleAssignment -RoleDefinitionName "Azure Service Bus Data Sender" `
      -Scope $wqghd.Id -ObjectId $ghfn.IdentityPrincipalId
    New-AzRoleAssignment -RoleDefinitionName "Azure Service Bus Data Sender" `
      -Scope $wqq.Id -ObjectId $ghfn.IdentityPrincipalId
    New-AzRoleAssignment -RoleDefinitionName "Azure Service Bus Data Sender" `
      -Scope $wqc.Id -ObjectId $ghfn.IdentityPrincipalId

* Create a Cosmos DB account, a database for the :doc:`github-reflector` ACLs,
  and the allow lists themselves::

    # TODO: I do not know how to create the CosmoDB account through the
    # commandlets available; in particular, I do not know how to set its
    # "capacity mode" to serverless.  Just create it in the Portal GUI and then
    # Get- it as per above.  Note that it has to be reachable via a public
    # endpoint because the serverless tier of Functions, which we use here,
    # cannot integrate with VNETs.

    $ghacldb = New-AzCosmosDBSqlDatabase `
      -ResourceGroupName $resgrp.ResourceGroupName `
      -AccountName $cdbacc.Name -Name GitHubWebHookDB

    $ghaclown = New-AzCosmosDBSqlContainer `
      -ResourceGroupName $resgrp.ResourceGroupName `
      -AccountName $cdbacc.Name -DatabaseName $ghacldb.Name `
      -Name AllowOwner -PartitionKeyKind Hash -PartitionKeyPath "/id"

    $ghaclrepo = New-AzCosmosDBSqlContainer `
      -ResourceGroupName $resgrp.ResourceGroupName `
      -AccountName $cdbacc.Name -DatabaseName $ghacldb.Name `
      -Name AllowRepository -PartitionKeyKind Hash -PartitionKeyPath "/id"

    New-AzCosmosDBSqlRoleAssignment -ResourceGroupName $resgrp.ResourceGroupName `
      -AccountName $cdbacc.Name -PrincipalId $ghfn.IdentityPrincipalId `
      -RoleDefinitionName "Cosmos DB Built-in Data Reader" `
      -Scope "/dbs/$(${ghacldb}.Name)/colls/$(${ghaclown}.Name)"

    New-AzCosmosDBSqlRoleAssignment -ResourceGroupName $resgrp.ResourceGroupName `
      -AccountName $cdbacc.Name -PrincipalId $ghfn.IdentityPrincipalId `
      -RoleDefinitionName "Cosmos DB Built-in Data Reader" `
      -Scope "/dbs/$(${ghacldb}.Name)/colls/$(${ghaclrepo}.Name)"

* In order to specify which resources the reflector is to use, we can *derive*
  configuration settings from the above values::

    Update-AzFunctionAppSetting -Name $ghfn.Name `
      -ResourceGroupName $resgrp.ResourceGroupName -AppSetting `
        @{ "SBCONN__fullyQualifiedNamespace" = `
            ([System.Uri]$bus.ServiceBusEndpoint).Host `
         ; "ACL_COSMOS" = $cdbacc.DocumentEndpoint `
         }

* We need to also specify some configuration values obtained from elsewhere or
  by fiat.  Specifically, we need to set the HMAC secret that GitHub will use
  to prove that it is the source of our WebHook events::

    Update-AzFunctionAppSetting -Name $ghfn.Name `
      -ResourceGroupName $resgrp.ResourceGroupName -AppSetting `
        @{ "GITHUB_HMAC_KEY" = $github_hmac_key `
         }

Reflector App Service Plan
==========================

By default, ``New-AzFunctionApp`` associates its constructed app with a fully
dynamic App Service Plan (ASP).  While these are inexpensive, they permit the
application to scale down to zero instances live, and functions can take long
enough to start up that GitHub's WebHook machinery complains of timeouts.
Therefore, one might want to change the ASP associated with the Function App.
Assuming you have an ASP already, run ::

  Update-AzFunctionApp -ResourceGroupName $resgrp.ResourceGroupName `
    -Name $ghfn.Name -PlanName $asp.Name

You probably want to set the Function App to be "Always On", too, in its
Configuration's General Settings in the Portal, or with the somewhat clumsily
generic ::

  Get-AzResource -ResourceType $ghfn.Type `
    -ResourceGroupName $ghfn.ResourceGroupName -Name $ghfn.Name | `
  Set-AzResource -PropertyObject @{"siteConfig" = @{"AlwaysOn" = $true}}

Connection Strings
##################

In general, the use of connection strings should be reserved for admin-esque
tasks, as they are harder to manage and audit than actual identification.

You can obtain the bus connection string (what the tooling calls ``--busconn``)
with something like::

    $buskey = Get-AzServiceBusKey -ResourceGroupName $resgrp.ResourceGroupName `
      -Namespace $bus.Name -Name RootManageSharedAccessKey
    $buskey.PrimaryConnectionString

(Though note that the client tooling here does not need to manage the message
queues and does not, itself, so could use a connection string that just has
that grant.  See below.)

And similarly for the database (``--dbconn``)::

    $cdbkey = Get-AzCosmosDBAccountKey -Type ConnectionStrings `
      -ResourceGroupName $resgrp.ResourceGroupName -Name $cdbacc.Name
    $cdbkey["Primary SQL Connection String"]

(The client tooling does not write to the Cosmos DB and so ``"Primary Read-Only
SQL Connection String"`` would work just as well.)

* Optionally, we may wish to construct a connection string with only read
  rights to the message bus, for use by clients::

    New-AzServiceBusAuthorizationRule `
      -ResourceGroupName $resgrp.ResourceGroupName `
      -Namespace $bus.Name -Rights Listen -Name ClientListen

    $buskey = Get-AzServiceBusKey -ResourceGroupName $resgrp.ResourceGroupName `
      -Namespace $bus.Name -Name ClientListen
    $buskey.PrimaryConnectionString

  Note that such a connection string is not useful for use by :doc:`the
  executor <executor>`, as it must write back to the bus when told to
  ``shutdown``.

Service Principals, Role Assignments, and Secrets
#################################################

The tooling here in general knows how to use the ``EnvironmentCredential``
class (see
https://docs.microsoft.com/en-us/azure/developer/javascript/sdk/authentication/overview)
to authenticate to Azure as a service principal using client secrets or secret
keys.  This is, essentially, a manual form of the Function App's Managed
Identity from above.

.. note::

   Despite everything, the secrets and even the secret keys here are *bearer
   tokens*.  While we would very much like to :doc:`bind keys into our TPM
   <../../misc-docs/tpm-hsm>`, to the best of our knowledge this is not (yet)
   possible using the Azure SDKs.  Please, therefore, deploy the usual defenses
   against key exfiltration (restricted file ownership and permissions, limited
   access to the machine bearing keys, &c).

   See https://github.com/Azure/azure-sdk-for-js/issues/22011

.. _work-bus/docs/azure_setup/service_princ_mk:

Creating a Service Principal
============================

Create a new Azure AD Service Principal with the following.  While a default
Scope and Role are not, strictly, required, it is polite to set them to our
resource group. ::

   New-AzADServicePrincipal -Scope $resgrp.ResourceId -Role Reader `
     -DisplayName ...

While most of our deployment runs within a single Azure tenant, we have set up
a stanging version in a second tenant.  Occasionally, it is useful to allow the
management node's *production* service principal to access *testing* resources;
as such, we have set our service principal's ``SignInAudience`` value to
``AzureADMultipleOrgs`` rather than the default of ``AzureADMyOrg``.  This can
be done by updating the "application" associated with the service principal::

    Update-AzADApplication -SignInAudience AzureADMultipleOrgs -DisplayName ...

Once created, a service principal can be looked up by display name::

   $sp = Get-AzADServicePrincipal -Displayname ...

The ``Id`` field on a service principal object, rather than its display name,
is what most other things will require.

.. note::

   Service principals are global to a tennant's entire AD, rather than scoped
   to any associated Subscription or Resource Group.

.. note::

   The Azure Portal does not make it easy to see what permissions have been
   granted to a service principal.  Having looked one up as above, to see
   its associated role assignments, run::

       Get-AzRoleAssignment -ObjectId $sp.Id

   You can restrict the scope searched with the ``-Scope`` or
   ``-ResourceGroup`` switches.  It may be convenient to send the result
   through ``Format-Table -Wrap RoleDefinitionName,Scope``.

   This seems to neglect things that might be called "resource-specific roles",
   which include Azure CosmosDB SQL Role assignments.  For those, you will need
   to use ``Get-AzCosmosDBSqlRoleAssignment`` to interrogate *per database* and
   then *filter* on the result::

     Get-AzCosmosDBSqlRoleAssignment `
       -ResourceGroupName $resgrp.ResourceGroupName `
       -AccountName $cdbacc.name `
     | Where-Object {$_.Principalid -eq $exsp.Id }

.. _work-bus/docs/azure_setup/service_princ_sec:

Service Principal Client Secrets
================================

If ``$sp`` holds the service principal object, then it should suffice to run
something like this to create a credential with a particular lifetime::

   $sppw = New-AzADSpCredential -ObjectId $sp.Id `
     -EndDate ((get-date) + (New-TimeSpan -Days 70))
   $sppw.SecretText

The ``SecretText`` field is not available on the result of
``Get-AzADSpCredential``, so be prepared to copy it out now.  You may wish to
make note of the ``$sppw.KeyId``, too, to rotate or remove the secret, later.

.. note::

   Due to what appears to be an ignored Azure bug, these credentials will not
   be reflected in the Azure portal, but can be used all the same.  Excitement
   abounds.  See https://github.com/MicrosoftDocs/azure-docs/issues/41433 and
   https://github.com/Azure/azure-powershell/issues/11825.

It is good hygene to use ``Get-AzADSpCredential -ObjectId $sp.Id`` to list all
outstanding keys and to use ``Remove-AzADSpCredential -ObjectId $sp.Id -KeyId
...`` to remove all but those actively in use.

.. _work-bus/docs/azure_setup/service_princ_env:

Environment Variables
=====================

Using the ``EnvironmentCredential`` requires setting three environment
variables:

``AZURE_TENANT_ID``
   must hold the tenant UUID, which may be found by executing::

     Connect-AzureAD
     (Get-AzureADTenantDetail).ObjectId

``AZURE_CLIENT_ID``
   must be the UUID of the service principal.  It is available in PowerShell
   as the ``AppId`` field on ``Get-AzADServicePrincipal``'s result.
   (Not to be confused with the ``Id`` field.)

``AZURE_CLIENT_SECRET``
   must hold the per-client secret obtained as per
   :ref:`work-bus/docs/azure_setup/service_princ_sec` above.

For the Executor
================

Having :ref:`created <work-bus/docs/azure_setup/service_princ_mk>` a service
principal for :doc:`the executor <executor>`, ``$exsp``, we must grant it some
roles so that it may use the other resources we have created, above.
Specifically, it will require...

* read access to the work submission topic::

   New-AzRoleAssignment -RoleDefinitionName "Azure Service Bus Data Receiver" `
     -Scope $wqq.Id -ObjectId $exsp.Id

* and read-write access to the work completion queue::

   New-AzRoleAssignment -RoleDefinitionName "Azure Service Bus Data Receiver" `
     -Scope $wqc.Id -ObjectId $exsp.Id
   New-AzRoleAssignment -RoleDefinitionName "Azure Service Bus Data Sender" `
     -Scope $wqc.Id -ObjectId $exsp.Id

Optionally, we may grant this service principal

* read adccess to the github reflector's debug queue::

   New-AzRoleAssignment -RoleDefinitionName "Azure Service Bus Data Receiver" `
     -Scope $wqghd.Id -ObjectId $exsp.Id

* read access cosmos database tables (chiefly so that we can use the
  ``list-github-webhook-acl`` command with this principal's identity)::

    New-AzCosmosDBSqlRoleAssignment -ResourceGroupName $resgrp.ResourceGroupName `
      -AccountName $cdbacc.Name -PrincipalId $exsp.Id `
      -RoleDefinitionName "Cosmos DB Built-in Data Reader" `
      -Scope "/dbs/$(${ghacldb}.Name)/colls/$(${ghaclown}.Name)"

    New-AzCosmosDBSqlRoleAssignment -ResourceGroupName $resgrp.ResourceGroupName `
      -AccountName $cdbacc.Name -PrincipalId $exsp.Id `
      -RoleDefinitionName "Cosmos DB Built-in Data Reader" `
      -Scope "/dbs/$(${ghacldb}.Name)/colls/$(${ghaclrepo}.Name)"

* write access to the job submission queue.  This, in particular, allows us
  to use the ``shutdown`` client utility herein::

   New-AzRoleAssignment -RoleDefinitionName "Azure Service Bus Data Sender" `
     -Scope $wqq.Id -ObjectId $exsp.Id

.. _work-bus/docs/azure_setup/service_princ_cross:

Cross-Tenant Authentication
===========================

We will refer to the "origin" tenant where the service principal was created and
the "remote" tenant(s) to which it also wishes to authenticate.

1. The remote tenant must create a service principal with the same "app id"::

     New-AzADServicePrincipal -AppId ...

2. The remote tenant must assign RBAC rules for this new service principal.

3. When authenticating, the service must now indicate that the tenant it
   wants to access is the remote.  For ``EnvironmentCredential`` authentication
   in particular, that means changing the ``AZURE_TENANT_ID`` value (while
   retaining ``AZURE_CLIENT_ID`` and, if in use, ``AZURE_CLIENT_SECRET``).

The last step is the most confusing; authenticating to the origin tenant will
*succeed* but will not grant access to resources in the remote tenant.
Accessing resources in both concurrently is, therefore, a bit of a challenge
(but, presumably, doable with enough engineering effort).
