WikiPEG Benchmark Suite
======================

This is the WikiPEG benchmark suite. It measures speed of the parsers generated
by WikiPEG on various inputs. Its main goal is to provide data for code generator
optimizations.

Running
-------

All commands in the following steps need to be executed in WikiPEG root directory
(one level up from this one).

  1. Install all WikiPEG dependencies, including development ones:

        $ npm install

  2. Execute the benchmark suite:

        $ make benchmark

  3. Wait for results.

