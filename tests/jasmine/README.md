WikiPEG Spec Suite
=================

This is the WikiPEG spec suite. It ensures WikiPEG works correctly. All specs
should always pass on all supported platforms.

Running
-------

All commands in the following steps need to be executed in WikiPEG root directory
(one level up from this one).

  1. Install all WikiPEG dependencies, including development ones:

        $ npm install

  2. Execute the spec suite:

        $ make spec

  3. Watch the specs pass (or fail).
