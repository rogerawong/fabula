.. _ansible_documentation:
..
   This is the index file for Ansible the package. It gets symlinked to index.rst by the Makefile

Ansible Documentation
=====================

Welcome to Ansible community documentation!
This documentation covers the version of Ansible noted in the upper left corner of this page.
We maintain multiple versions of Ansible and of the documentation, so please be sure you are using the version of the documentation that covers the version of Ansible you're using.
For recent features, we note the version of Ansible where the feature was added.

Ansible releases a new major release approximately twice a year.
The core application evolves somewhat conservatively, valuing simplicity in language design and setup.
Contributors develop and change modules and plugins, hosted in collections, much more quickly.

.. toctree::
   :maxdepth: 2
   :caption: Ansible getting started

   getting_started/index
   getting_started_ee/index

.. toctree::
   :maxdepth: 2
   :caption: Installation, Upgrade & Configuration

   installation_guide/index
   porting_guides/porting_guides

.. toctree::
   :maxdepth: 2
   :caption: Using Ansible

   inventory_guide/index
   command_guide/index
   playbook_guide/index
   vault_guide/index
   module_plugin_guide/index
   collections_guide/index
