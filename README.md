# MSRC Morello Cluster Readme

This is a collection of scripts for managing our cluster of Morello boxes as
stateless workers for (GitHub) CI/CD pipelines.

## What's Here?

- [cluster-management](cluster-management/README) describes tooling that
  scopes over the whole cluster, including the `udev` machinery to construct
  stable names for individual nodes' interfaces.

- [board-runner](board-runner/README) describes the machinery for
  network-booting an individual board over HTTP and pivoting root to a
  read-only NFS export on the controller node.

- [work-bus](work-bus/README) describes the CI/CD runner glue and some
  Azure-hosted services for push/pull conversion of work notifications.

This repository is also structured as a [Sphinx](https://www.sphinx-doc.org/)
project; see [our notes on that in misc-docs/sphinx.rst](misc-docs/sphinx) for
configuration and build instructions.

## Trademark Notice

Trademarks This project may contain trademarks or logos for projects, products,
or services. Authorized use of Microsoft trademarks or logos is subject to and
must follow Microsoft’s Trademark & Brand Guidelines. Use of Microsoft
trademarks or logos in modified versions of this project must not cause
confusion or imply Microsoft sponsorship. Any use of third-party trademarks or
logos are subject to those third-party’s policies.
