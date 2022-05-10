#########################
This Documentation Itself
#########################

This documentation is built using `Sphinx <https://www.sphinx-doc.org/>`_.  Our
central configuration file is :download:`_sphinx/conf.py <../_sphinx/conf.py>`
and, in general, ``sphinx`` should be invoked using :download:`_sphinx/Makefile
<../_sphinx/Makefile>` as ::

    make -f _sphinx/Makefile html

..

This will place the generated HTML in ``_sphinx/build/html``.  You may wish to
have a webserver serve this location for ease of viewing the documentation.

You will need to have ``sphinx`` and the ``sphinx-book-theme`` available; on
Debian and derivative systems, that's probably as easy as ::

    sudo apt install python3-sphinx python3-sphinx-book-theme

