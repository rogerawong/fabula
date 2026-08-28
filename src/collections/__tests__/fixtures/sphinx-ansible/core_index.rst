.. _ansible_core_documentation:

..
   This is the index file for ansible-core. It gets symlinked to index.rst by the Makefile

**************************
Ansible Core Documentation
**************************

Ansible Core, or ``ansible-core`` is the main building block and architecture for Ansible, and includes:

* CLI tools such as ``ansible-playbook``, ``ansible-doc``. and others for driving and interacting with automation.
* The Ansible language that uses YAML to create a set of rules for developing Ansible Playbooks and includes functions such as conditionals, blocks, includes, loops, and other Ansible imperatives.
* An architectural framework that allows extensions through Ansible collections.

This documentation covers the version of ``ansible-core`` noted in the upper left corner of this page.
We maintain multiple versions of ``ansible-core`` and of the documentation, so please be sure you are using the version of the documentation that covers the version of Ansible you're using.
For recent features, we note the version of Ansible where the feature was added.

``ansible-core`` releases a new major release approximately twice a year.
The core application evolves somewhat conservatively, valuing simplicity in language design and setup.
Contributors develop and change modules and plugins, hosted in collections, much more quickly.

.. toctree::
   :maxdepth: 2
   :caption: Ansible getting started

   getting_started/index

.. toctree::
   :maxdepth: 2
   :caption: Installation, Upgrade & Configuration

   installation_guide/index
   porting_guides/core_porting_guides

.. toctree::
   :maxdepth: 2
   :caption: Using Ansible Core

