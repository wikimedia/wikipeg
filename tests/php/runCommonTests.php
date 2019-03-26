<?php

namespace WikiPEG\Tests;

if (PHP_SAPI !== 'cli') {
  exit;
}

require __DIR__ . '/../../vendor/autoload.php';

function runCommonTests() {
  $runner = new TestRunner;
  $options = getopt('v', ['id:', 'dump-code', 'help', 'node:']);
  if (isset($options['help'])) {
    echo "Usage: php {$GLOBALS['argv'][0]} [..options...]\n" .
      "Available options:\n" .
      "  --id=<id>       Specify either the test ID (e.g. 10) or the case ID (e.g. 10.4)\n" .
      "  -v              Print something when tests start and stop\n" .
      "  --dump-code     Write the generated PHP code for the selected tests to stdout\n" .
      "  --node=<path>   Specify an alternative Node.js binary\n";


    return false;
  }
  return $runner->runFile(__DIR__ . '/../common/tests.txt', $options);
}

exit( runCommonTests() ? 0 : 1 );
