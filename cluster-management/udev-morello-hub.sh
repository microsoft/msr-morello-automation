#!/bin/busybox sh
set -e -u

SYS=$1
USB_BUS_DEVPATH=$2
SYS_DEV_PATH=${SYS}/bus/usb/devices/${USB_BUS_DEVPATH}

# Try to figure out our serial number by looking at the MCC's UAS target
probe_usb_mcc() {
  M=${SYS_DEV_PATH}.3
  [ -r ${M}/product ] || return 1
  [ "M1SDP" = "$(cat ${M}/product)" ] || return 1
  [ -r ${M}/serial ] && { cat ${M}/serial; exit 0; }
}

probe_usb_mcc

exit 1
