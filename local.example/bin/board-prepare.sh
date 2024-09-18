#!/bin/bash
# Boot a Morello board with the flavour specified in $1.
set -e -u -x

# We expect some environment variables for board-runner/run.init; check now.
: ${RUNTIME_DIRECTORY} ${MORELLO_SCRIPTS} ${MORELLO_HOSTNAME}

# if [ -z "${MORELLO_HOSTNAME-}" ]; then
#   export MORELLO_HOSTNAME="${RUNTIME_DIRECTORY#*morello/}"
#   echo "Inferred MORELLO_HOSTNAME to be ${MORELLO_HOSTNAME}"
# fi

# Construct a fixed path to our actual boot export for use by HTTP.  This
# allows us to keep the UEFI boot URL constant (per board) even as we change
# which root actually gets mounted.  While nginx does not like following
# symlinks outside of its locations, these are all quite local.
#
# Most of the paths through the maze below do not explicitly construct the link
# and so hit the generic case which just points that at an existing NFS export.
# However, in some cases, we need to synthesize a boot environment, and so will
# manually point this path somewhere else.
LOADER_URL_PATH="/tank/morello/export/sym/${MORELLO_HOSTNAME}"
rm -f "${LOADER_URL_PATH}"

NFS_PATH_PREFIX="/tank/morello/export"
nfs_path_for() {
  case "${1}" in
  202205.msr)   echo "${NFS_PATH_PREFIX}/202205.msr" ;;
  202205.1.msr) echo "${NFS_PATH_PREFIX}/202205.1.msr";;
  202212.msr)   echo "${NFS_PATH_PREFIX}/202212.msr.2";;
  default)      echo "${NFS_PATH_PREFIX}/202212.msr.2";;
  tmp-*)        echo "${NFS_PATH_PREFIX}/${1}";;
  *) echo 2>&1 "Bad NFS path query"; exit 1;;
  esac
}

# Build up an alternate boot environment according to the "/opt/msr-xtra" game
#
# $1 - Azure storage account for xtra files
# $2 - Azure storage path prefix for xtra files

do_xtra_scratch() {

    SCR_ROOT="${NFS_PATH_PREFIX}/scratch/${MORELLO_HOSTNAME}";
    rm -rf "${SCR_ROOT}"

    XTRA_ROOT="${SCR_ROOT}/opt/msr-xtra"
    mkdir -p "${XTRA_ROOT}"

    ln -s "${NFS_PATH}/boot" "${SCR_ROOT}/boot"

    # TODO: stop using local build once Debian has 0.61 or better
    AZURE_TENANT_ID="${1}" \
    RCLONE_CONFIG_AZURE_TYPE=azureblob \
    RCLONE_CONFIG_AZURE_ACCOUNT="${2}" \
    RCLONE_CONFIG_AZURE_ENV_AUTH=1 \
    /tank/nwf/rclone/_gopath/bin/rclone \
    sync -v \
    "azure:${3}" "${XTRA_ROOT}/boot"

    # If there isn't a boot script. land a sensible default, which
    # just points at the fetched boot/kernel.
    if [ ! -r "${XTRA_ROOT}/boot/script" ]; then
    cat >"${XTRA_ROOT}/boot/script" <<HERE
config = require"config"
config.reload("/boot/msr/_common.conf")
config.parse("kernel=\"/opt/msr-xtra/boot/kernel\"")
config.loadelf()
cli_execute("boot")
HERE
    fi

    LOADER_SCRIPT="/opt/msr-xtra/boot/script"

    ln -s "${SCR_ROOT}" "${LOADER_URL_PATH}"
}

case "${1}" in
  # Symbolic name targets
  default)
    NFS_PATH="$(nfs_path_for default)"
    LOADER_SCRIPT=/boot/msr/default
    ;;

  benchmark)
    NFS_PATH="$(nfs_path_for default)"
    LOADER_SCRIPT=/boot/msr/benchmark
    ;;

  # Specific release targets
  2022.05-default)
    NFS_PATH="$(nfs_path_for 202205.msr)"
    LOADER_SCRIPT=/boot/msr/default
    ;;
  2022.05-benchmark)
    NFS_PATH="$(nfs_path_for 202205.msr)"
    LOADER_SCRIPT=/boot/msr/benchmark
    ;;

  2022.05.1-default)
    NFS_PATH="$(nfs_path_for 202205.1.msr)"
    LOADER_SCRIPT=/boot/msr/default
    ;;
  2022.05.1-benchmark)
    NFS_PATH="$(nfs_path_for 202205.1.msr)"
    LOADER_SCRIPT=/boot/msr/benchmark
    ;;

  2022.12-default)
    NFS_PATH="$(nfs_path_for 202212.msr)"
    LOADER_SCRIPT=/boot/msr/default
    ;;
  2022.12-benchmark)
    NFS_PATH="$(nfs_path_for 202212.msr)"
    LOADER_SCRIPT=/boot/msr/benchmark
    ;;

  # Testing targets

  # Can't NFS root :(
  # purecap)
  #   MORELLO_EXPORT=202205.1.msr
  #   LOADER_SCRIPT=/boot/msr/purecap
  #   ;;

  tmp_bench_*)
    NFS_PATH="$(nfs_path_for "tmp-${1#tmp_bench_}")"
    LOADER_SCRIPT=/boot/msr/benchmark
    ;;

  tmp_default_*)
    NFS_PATH="$(nfs_path_for "tmp-${1#tmp_default_}")"
    LOADER_SCRIPT=/boot/msr/default
    ;;

  # "Extra" boot targets for things like temporal safety.

  xtra_* | nwfxtra_*)
    # Fetch something "extra" for boot.
    readarray -d _ -t -s 1 <<<"${1}"

    # Look up the actual NFS export and configure that path
    NFS_PATH="$(nfs_path_for "${MAPFILE[0]}")"

    # By default, we're not doing any cross-tenant work
    AZURE_STORAGE_TENANT="${AZURE_TENANT_ID}"

    # We support fetching from one of two storage accounts at the moment;
    # figure out which we're using.
    case "${1}" in
      xtra_*)
        AZURE_STORAGE_ACCT="acct1"
        ;;
      nwfxtra_*)
        AZURE_STORAGE_ACCT="acct2"
        AZURE_STORAGE_TENANT="tenant-uuid-..."
        ;;
    esac

    # And go do the actual magic.
    do_xtra_scratch "${AZURE_STORAGE_TENANT}" "${AZURE_STORAGE_ACCT}" "${MAPFILE[1]/$'\n'}"

    ;;

  # Error
  *)
    echo >&2 "Bad boot flavour '$1'"
    exit 1
    ;;
esac

# If we didn't explicitly construct something at ${LOADER_URL_PATH} above,
# make it an alias of the NFS export.
[ -e "${LOADER_URL_PATH}" ] || ln -s "${NFS_PATH}" "${LOADER_URL_PATH}"

NFS_PFX="10.0.0.1"
HTTP_PFX="http://10.0.0.1/nfs/sym"
exec "${MORELLO_SCRIPTS}"/board-runner/run.init \
  -l "${HTTP_PFX}/${MORELLO_HOSTNAME}/boot/loader_lua.efi" \
  -n "${NFS_PFX}:${NFS_PATH}" \
  -s "${LOADER_SCRIPT}" -p ${PPID}
