##########
TPM as HSM
##########

We use our machine's (v)TPM to hold secrets for our webserver and would like
to generalize this mechanism.

Authorizing Users
#################

The TPM resource manager is owed by the group ``tss``.  Ensure that
``www-data`` and ``morello-auto`` daemon users are in that group.  (``usermod
-a -G tss ...``).

Examining the TPM
#################

Use ``tpm2_ptool`` subcommands ``listprimaries``, ``listtokens``,
``listobjects`` to examine the hierarchy of objects on the TPM.  Alternatively,
you can use ``pkcs11-tool`` (from OpenSC) by passing it ::

  --module /usr/lib/x86_64-linux-gnu/libtpm2_pkcs11.so.1

in addition to other arguments (like ``-T``).

Creating Keys Using tpm2_ptool
##############################

Initialize a "primary" on the TPM; this command will return a "primary ID"::

    tpm2_ptool init

Create a token, giving it a label, user PIN, and security-officer PIN::

    tpm2_ptool addtoken --pid=1 \
      --label=$TOKEN_LABEL --userpin=abracadabra --sopin=hocuspocus

Create a key (use ``--algorithm=help`` to see supported algorithms)::

    tpm2_ptool addkey --label=$TOKEN_LABEL --userpin=abracadabra \
      --key-label=mykey --algorithm=rsa2048

Vary ``--key-label`` to taste.  This will spit out a key ID (``CKA_ID``).

Ingesting Keys Instead
======================

Occasionally one is handed a private key rather than being expected to supply a
public one.  In this scenario, you can use something like ::

    tpm2_ptool import --label=$TOKEN_LABEL --userpin=abracadabra \
      --key-label=... --algorithm=ecc --private=$PRIVATE_KEY_FILE

This, too, spits out a key ID.

Listing Keys And PKCS#11 URLs
#############################

This is a bit of a mess; while you'd think that either ``pkcs11-tool`` or
something within ``openssl`` could be useful here, the simplest thing is to use
``p11tool`` from GNUTLS.  You'll need to tell ``p11tool`` to load the right
module, which seems to be possible only by modifying files (sigh), thanks to
p11-kit.  Anyway, create ``/etc/pkcs11/modules/tpm2.module`` with the single
line ::

    module: /usr/lib/x86_64-linux-gnu/libtpm2_pkcs11.so.1

And then run ``p11tool --list-tokens``.  You should see a URL with the right
``label=$TOKEN_LABEL`` conjunct.  If you run ``p11tool --list-all
"pkcs11:label=$TOKEN_LABEL"``, you should see the public keys available under
this token, even if you have set a user PIN.  If you have not set a user PIN,
the private key objects will also be shown.  If you have set a user PIN, you
can see the private key objects by adding adding ``--login`` to request that
``p11tool`` authenticate to the token first.

In general it suffices to use the ``token=$TOKEN_LABEL`` and
``object=$KEY_LABEL`` conjuncts in simple setups like this one; there's no need
for the rest of the PKCS#11 URL.

Creating Certificates
#####################

OpenSSL
=======

This is no longer straightforward with OpenSSL 3; it seems like the PKCS#11
engine now available in OpenSSL is severely restricted relative to the 1.1
version.  There does not seem to be a replacement PKCS#11 OpenSSL 3 provider.
(At least enough functionality remains that OpenSSH and nginx, below, can avail
themselves of PKCS#11 tokens, but key management operations seem gone.) It is
possible that the 1.8 release of https://github.com/tpm2-software/tpm2-pkcs11,
which brings a new ``tpm2_ptool export`` command, provides a way forward, but,
as of this writing, no meaningful documentation or migration guide is easily
found.

.. Tell OpenSSL to use the TPM2 PKCS11 provider with a config file that looks like
.. :download:`this one <openssl-pkcs11-tpm.conf>`.  (The ``req`` section therein
.. allows us to specify certificate subjects on the command line without fuss.)
.. You can set the ``OPENSSL_CONF`` environment variable to point at this file
.. rather than replacing the global configuration.
..
.. A self-signed certificate for this key can be created with something like the
.. following.  You'll need the user PID for the token from above.  ::
..
..     openssl req -engine pkcs11 -keyform engine -new -nodes -x509 -sha256 \
..       -key 1:${CKA_ID} -days 3650 -subj "/CN=..."
..

.. _misc-docs/tpm-hsm/create/gnutls:

GNUTLS
======

Having told p11-kit how to find the tpm2 PKCS#11 module as per `above
<Listing Keys And PKCS#11 URLs>`_, you can run::

  GNUTLS_PIN=abracadabra certtool --generate-self-signed \
    --load-privkey "pkcs11:token=$TOKEN_LABEL;object=$KEY_LABEL'

OpenSSH Public Key Format
=========================

You can also read out the public keys in OpenSSH format with ::

  ssh-keygen -D /usr/lib/x86_64-linux-gnu/libtpm2_pkcs11.so.1

The comment will contain the ``--key-label``.

OpenSSL Path-based Certificate Stores
=====================================

The OpenSSL short hash of the certificate, as used by, for example, file-based
certificate root stores (such as ``/etc/ssl/certs``) can be computed using::

  openssl x509 -hash -noout -in /etc/nginx/tpm-http.crt

Despite being "proprietary" to OpenSSL, this can be more convenient than using
a certificate bundle file as we can just place a file in a directory rather
than needing to append to a file.

nginx
#####

``nginx`` supports using PKCS#11 URLs for its SSL keys and certificates, but we
need to do some configuration outside what appears to be available in its own
configuration language.

- First, Create ``/var/www/.tpm2_pkcs11`` and make it owned by ``www-data`` and
  mode ``0700``.

- Then, follow the instructions for `Creating Keys Using tpm2_ptool`_ above,
  running these commands **as the** ``www-data`` **user**, using ``http``
  for the ``$TOKEN_LABEL``, and ``httpkey`` for the key label.  The TPM PKCS11
  glue files will end up in ``/var/www/.tpm2_pkcs11``.

- Still as ``www-data``, run :ref:`the command above
  <misc-docs/tpm-hsm/create/gnutls>` to generate a self-signed certificate.
  Save the output to ``/etc/nginx/tpm-http.crt`` and export it to client
  systems (see `OpenSSL Path-based Certificate Stores`_, for example).

- Create ``/etc/systemd/system/nginx.service.d/99-opensslconf.conf`` with ::

    [Service]
    Environment=OPENSSL_CONF=/etc/nginx/openssl.conf
    Environment=TPM2_PKCS11_STORE=/var/www/.tpm2_pkcs11

- Create ``/etc/nginx/openssl.conf`` with the following contents, which
  **includes the user PIN**.  While the key is what matters, as a defense in
  depth, make this file also owned by ``www-data`` and with mode ``0400``.
  ::

    openssl_conf = sec_root

    [sec_root]
    engines = sec_engines

    [sec_engines]
    pkcs11 = sec_eng_pkcs11

    [sec_eng_pkcs11]
    engine_id = pkcs11
    MODULE_PATH = /usr/lib/x86_64-linux-gnu/libtpm2_pkcs11.so.1
    PIN=abracadabra

- Find the ID of the key to use.

- Use these lines in a site configuration to use the TPM2 key
  ::

    ssl_certificate "/etc/nginx/tpm-http.crt";
    ssl_certificate_key "engine:pkcs11:pkcs11:token=http;object=httpkey";

.. _misc-docs/tpm-hsm/ssh:

ssh
###

Rather than using ``~/.ssh/id_*`` files, we can push SSH keys into our (v)TPM,
too, at least since `OpenSSH v5.4p1
<https://github.com/openssh/openssh-portable/blob/d13d995a202c562c80d7e7a11c43504c505481d1/ChangeLog#L235>`_
from 2010.

Follow the instructions for `Creating Keys Using tpm2_ptool`_ above, running
these commands as the user who will be running SSH, and using ``ssh`` for the
``$TOKEN_LABEL``, and leaving ``userpin`` *empty* (that is, ``--userpin ''``)
unless you want ``ssh`` to prompt for a PIN or use its ``SSH_ASKPASS``
mechanism.  The TPM PKCS#11 glue files will end up in ``$HOME/.tpm2_pkcs11/``.

While it suffices to pass something like ``-I
/usr/lib/x86_64-linux-gnu/libtpm2_pkcs11.so.1`` to ``ssh``, you will probably
be better off using a ssh configuration file; the option you want is
``PKCS11Provider``.
