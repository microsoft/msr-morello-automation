###############
Useful Commands
###############

::

  export MORELLO_SCRIPTS=${PWD}

For systemd Integration
#######################

Show the status of the queue workers::

  systemctl list-units 'morello-worker*'

Watch the log stream of all workers::

  journalctl -o with-unit -f -u 'morello-worker@msrc\x2dmorello*.service'

For a board
###########

* Install newer firmware
  ::

    ./board-runner/update-firmware.sh \
    /tank/morello/upstreams/board-firmware \
    msrc-morelloNN

* Boot a board manually
  ::

    MORELLO_HOSTNAME=msrc-morelloNN \
    ./local/bin/systemd-run-wrap.sh ./local/bin/board-prepare.sh default

  Running this under ``systemd-run`` will kill off the lurking ``socat`` after
  the job finishes.

For the work queue
##################

* Submit a shutdown request to pull the next available worker out of the pool
  ::

    ~/bin/envf ./local/morello-worker@.env node \
    ./work-bus/client-utils/dist/index.js \
    shutdown \
    --config ./local/executor-config-nwf-test.json

* Listen to the github reflector debug stream
  ::

    ~/bin/envf local/morello-worker@.env.nwf node \
    ./work-bus/client-utils/dist/index.js \
    azure-bus-queue-recv \
    --config ./local/executor-config-nwf-test.json \
    --busqueue github-reflector-debug

* Audit webhook ACLs.  This is the only thing that needs to connect to the
  database, and so our configuration files are generally useless and POLA says
  that our service principal shouldn't have access to the database, so just use
  the database connection string ::

    ./work-bus/client-utils/dist/index.js \
    list-github-webhook-acls \
    --dbconn "..."

* List github runners, to see if we've left any stragglers behind
  ::

    OPENSSL_CONF=/dev/null \
    ./work-bus/client-utils/dist/index.js \
    list-github-runners \
    --config /tank/morello/scripts/local/executor-config-nwf-test.json

* Run a test executor that listens on nwf's github bot and just runs stub shell
  scripts::

    ~/bin/envf ./local/morello-worker@.env.nwf \
    ./work-bus/executor/dist/index.js --config local/executor-config-nwf-test.json

* Run a test executor that listens on nwf's github bot and runs the actual
  board scripts::

    MORELLO_HOSTNAME=msrc-morelloNN \
    ./local/bin/systemd-run-wrap.sh \
    ~/bin/envf ./local/morello-worker@.env.nwf \
    ./work-bus/executor/dist/index.js --config local/executor-config-nwf-run.json

  Running this under ``systemd-run`` will kill off the lurking ``socat`` after
  the job finishes.
