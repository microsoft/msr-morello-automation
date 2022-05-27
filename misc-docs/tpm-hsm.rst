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

Creating Certificates Using openssl
###################################

Tell OpenSSL to use the TPM2 PKCS11 provider with a config file that looks like
:download:`this one <openssl-pkcs11-tpm.conf>`.  (The ``req`` section therein
allows us to specify certificate subjects on the command line without fuss.)
You can set the ``OPENSSL_CONF`` environment variable to point at this file
rather than replacing the global configuration.

A self-signed certificate for this key can be created with something like the
following.  You'll need the user PID for the token from above.  ::

    openssl req -engine pkcs11 -keyform engine -new -nodes -x509 -sha256 \
      -key 1:${CKA_ID} -days 3650 -subj "/CN=..."

OpenSSH Public Key Format
=========================

You can also read out the public keys in OpenSSH format with ::

   ssh-keygen -D /usr/lib/x86_64-linux-gnu/libtpm2_pkcs11.so.1

The comment will contain the ``--key-label``.

nginx
#####

``nginx`` supports using PKCS#11 URLs for its SSL keys and certificates, but we
need to do some configuration outside what appears to be available in its own
configuration language.

- First, Create ``/var/www/.tpm2_pkcs11`` and make it owned by ``www-data`` and
  mode ``0700``.

- Then, follow the instructions for `Creating Keys Using tpm2_ptool`_ above,
  running these commands **as the** ``www-data`` **user** and using ``http``
  for the ``$TOKEN_LABEL``.  The TPM PKCS11 glue files will end up in
  ``/var/www/.tpm2_pkcs11``.

- Still as ``www-data``, run the command in `Creating Certificates Using
  openssl`_ above.  Save the output to ``/etc/nginx/tpm-http.crt``.

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

- Find the ID of the key to use.  This is a bit of a mess; while you'd think
  that either ``pkcs11-tool`` or something within ``openssl`` could be useful
  here, the simplest thing, ironically, is to use ``p11tool`` from GNUTLS
  (sigh).  You'll need to tell ``p11tool`` to load the right module, which
  seems to be possible only by modifying files (sigh) thanks to p11-kit.
  Anyway, create ``/etc/pkcs11/modules/tpm2.module`` with the single line ::

    module: /usr/lib/x86_64-linux-gnu/libtpm2_pkcs11.so.1

  And then run ``p11tool --list-tokens`` and grab the URI with the right Label
  (``http``, used as ``$TOKEN_LABEL`` from above).

- Use these lines in a site configuration to use the TPM2 key
  ::

    ssl_certificate "/etc/nginx/tpm-http.crt";
    ssl_certificate_key "engine:pkcs11:pkcs11:model=IoT%20Soft;manufacturer=MSFT;serial=0000000000000000;token=http";

  The ``http`` in the ``pkcs11`` URI is the ``$TOKEN_LABEL``, the rest is
  hard-coded noise for the vTPM exposed by HyperV.  YMMV.

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
mechanism.  The TPM PKCS11 glue files will end up in ``$HOME/.tpm2_pkcs11/``.

While it suffices to pass something like ``-I
/usr/lib/x86_64-linux-gnu/libtpm2_pkcs11.so`` to ``ssh``, you will probably be
better off using a ssh configuration file.
