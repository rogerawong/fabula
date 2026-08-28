:orphan:

.. Synthetic fixture (ours, not vendored). The godot-docs corpus contains
   ZERO :glob: blocks. A globbed block's entry list is a PATTERN, not a
   list, so it must round-trip verbatim as a locked node: entries cannot be
   reordered into it, and it cannot be split apart. See docs/12.

Globbed sections
================

.. toctree::
   :glob:
   :maxdepth: 1
   :name: syn-glob

   tutorials/2d/*
   tutorials/io/*

.. toctree::
   :glob:
   :maxdepth: 1
   :reversed:
   :name: syn-glob-mixed

   about/introduction
   tutorials/*/index
