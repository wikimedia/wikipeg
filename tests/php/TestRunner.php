<?php

namespace WikiPEG\Tests;

use WikiPEG\Expectation;
use WikiPEG\SyntaxError;

class TestRunner {
  private $success;
  private $longContext;
  private $shortContext;
  private $verbose;
  private $targetId;
  private $dumpCode;
  private $successCount;
  private $totalCount;
  private $codeLines;
  private $nodeBinary;

  private function readFile($fileName) {
    $testFileParser = $this->makeTestFileParser();
    $text = file_get_contents($fileName);
    if ($text === false) {
      $this->error("Unable to read file \"$fileName\"");
    }

    try {
      return $testFileParser->parse($text);
    } catch (SyntaxError $e) {
      $this->error("Syntax error in \"$fileName\":{$e->location->start}: " . $e->getMessage());
      return [];
    }
  }

  public function runFile($fileName, array $options = []) {
    $this->verbose = isset($options['v']);
    $this->targetId = $options['id'] ?? null;
    $this->dumpCode = isset($options['dump-code']);
    $this->nodeBinary = $options['node'] ?? 'node';

    $this->startServer();

    echo "Running language-independent tests against PHP\n";


    $this->setErrorContext(null);
    $this->success = true;
    $this->successCount = 0;

    $tests = $this->readFile($fileName);

    foreach ($tests as $test) {
      $test['cache'] = false;
      $this->runTest($test);
      $test['cache'] = true;
      $this->runTest($test);
    }

    if ($this->successCount === $this->totalCount) {
      echo "SUCCESS: ";
    } else {
      echo "FAILED: ";
    }
    echo "$this->successCount / $this->totalCount assertions were successful\n";

    $this->terminateServer();

    return $this->success;
  }

  private function installErrorHandler() {
    set_error_handler(function (...$args) {
      $this->handleError(...$args);
    });
  }

  private function handleError($code, $message, $file, $lineNumber) {
    $line = $this->codeLines[$lineNumber - 1] ?? '';
    throw new PHPErrorException("$message: line $lineNumber: $line");
  }

  private function restoreErrorHandler() {
    restore_error_handler();
  }

  private function runTest($test) {
    $this->setErrorContext($test);
    $parser = null;

    foreach ($test['cases'] as $caseIndex => $case) {
      $this->setErrorContext($test, $caseIndex);
      if (!$this->checkIdFilter($test, $caseIndex)) {
        continue;
      }

      if ($parser === null) {
        $this->info("Generating parser");
        $parser = $this->makeTestParser($test);
        if ($parser === null) {
          // Invalid parser, error already reported
          return;
        }
      }

      $this->info("starting");
      $errorCount = 0;
      $e = null;
      $result = null;
      $this->installErrorHandler();
      try {
        $result = $parser->parse($case['input']);
      } catch (SyntaxError $e) {
      } catch (PHPErrorException $e) {
      }
      $this->restoreErrorHandler();

      if (!empty( $case['error'])) {
        $errorCount += $this->assertError($e, $case['errorResult'] ?? null);
      } elseif (!empty( $case['ReferenceError'])) {
        $errorCount += $this->assertIdentical(
          $e instanceof PHPErrorException
          && strpos( $e->getMessage() ?? '', "Undefined variable" ) !== false,
          true, 'expected reference error');
      } elseif ($e instanceof PHPErrorException) {
        $errorCount += $this->assertIdentical($e->getMessage(), null, "expected no PHP error");
      } else {
        $errorCount += $this->assertIdentical($e, null, 'expected no exception');
        $errorCount += $this->assertIdentical($result, $case['expected'], "result mismatch");
      }
      if ($errorCount) {
        $this->info("FAILED");
      } else {
        $this->info("succeeded");
      }
    }
  }

  private function startServer() {
    $this->serverProc = proc_open(
      escapeshellarg($this->nodeBinary) . ' ' .
        escapeshellarg(__DIR__ . '/server.js'),
      [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => STDERR],
      $pipes);

    if (!$this->serverProc) {
      $this->fatal("Unable to open server proc");
    }

    $this->serverIn = $pipes[0];
    $this->serverOut = $pipes[1];
  }

  private function terminateServer() {
    proc_close($this->serverProc);
  }

  private function checkServerStatus() {
    $status = proc_get_status($this->serverProc);
    if (!$status['running']) {
      if ($status['signaled']) {
        $this->fatal("Generator server has exited with signal " . $status['termsig']);
      } else {
        $this->fatal("Generator server has exited with status " . $status['exitcode']);
      }
    }
  }

  private function buildParser($options) {
    $this->checkServerStatus();
    fwrite($this->serverIn, json_encode($options) . "\n");
    $result = fgets($this->serverOut);

    $this->checkServerStatus();
    $code = json_decode($result);

    // Remove open tag
    return preg_replace('/^<\?php/', '', $code);
  }

  private function makeTestFileParser() {
    $options = [
      'input' => file_get_contents(__DIR__ . '/../common/TestFile.peg'),
      'className' => 'WikiPEG\\Tests\\TestFileParser',
    ];
    $code = $this->buildParser($options);
    eval($code);
    return new TestFileParser;
  }

  private function makeTestParser($test) {
    $id = $test['id'];
    $className = "WikiPEG\\Tests\\Test$id";
    if ($test['cache']) {
      $className .= 'C';
    }
    $options = [
      'input' => $test['grammar'],
      'className' => $className,
      'cache' => $test['cache'],
    ];
    $code = $this->buildParser($options);

    if ($this->dumpCode) {
      echo $code;
    }

    $this->codeLines = explode("\n", $code);

    try {
      eval( $code );
    } catch (ParseError $e) {
      $this->error("Error parsing generated PHP code: " . $e->getMessage());
      return null;
    }
    return new $className;
  }

  private function makeParser($test) {
    $id = $test['id'];
    $className = "WikiPEG\\Tests\\Test$id";
    if ($test['cache']) {
      $className .= 'C';
    }
    $options = [
      'input' => $test['grammar'],
      'className' => $className,
      'cache' => $test['cache'],
    ];
    $this->checkServerStatus();
    fwrite($this->serverIn, json_encode($options) . "\n");
    $result = fgets($this->serverOut);

    $this->checkServerStatus();
    $code = json_decode($result);

    // Remove open tag
    $code = preg_replace('/^<\?php/', '', $code);

    if ($this->dumpCode) {
      echo $code;
    }

    $this->codeLines = explode("\n", $code);

    try {
      eval( $code );
    } catch (ParseError $e) {
      $this->error("Error parsing generated PHP code: " . $e->getMessage());
      return null;
    }
    return new $className;
  }

  private function getCaseId($test, $caseIndex) {
    $cache = $test['cache'] ? '.cache' : '';
    return $test['id'] . $cache . '.' . ($caseIndex + 1);
  }

  private function checkIdFilter( array $test, int $caseIndex ) {
    return $this->targetId === null
      || strval($test['id']) === $this->targetId
      || $this->getCaseId( $test, $caseIndex ) === $this->targetId;
  }

  private function setErrorContext($test, $caseIndex = null) {
    if ($test) {
      if ($caseIndex !== null) {
        $caseId = $this->getCaseId($test, $caseIndex);
        $this->longContext = "Test #$caseId \"{$test['desc']}\"\n";
        $this->shortContext = "Test #$caseId: ";
      } else {
        $this->longContext = "Test #{$test['id']} \"{$test['desc']}\"\n";
        $this->shortContext = "Test #{$test['id']}: ";
      }
    } else {
      $this->longContext = '';
      $this->shortContext = '';
    }
  }

  private function info($message) {
    if ($this->verbose) {
      print $this->shortContext . $message . "\n";
    }
  }

  private function error($message) {
    print $this->longContext . $message . "\n\n";
    $this->success = false;
  }

  private function fatal($message) {
    throw new FatalTestException($message);
  }

  private function encode($data) {
    return json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
  }

  private function assertIdentical($actual, $expected, $desc) {
    $this->totalCount++;
    if ($actual instanceof Expectation && $expected instanceof Expectation) {
      $match = Expectation::compare( $actual, $expected) === 0;
    } else {
      $match = $actual === $expected;
    }

    if (!$match) {
      $this->error("Assertion failed: $desc.\n" .
        "Expected: " . $this->encode($expected) . "\n" .
        "Actual: " . $this->encode($actual));
      return 1;
    } else {
      $this->successCount++;
      return 0;
    }
  }

  private function assertError($actual, $expected) {
    $this->totalCount++;
    if (!($actual instanceof SyntaxError)) {
      $this->error("Assertion failed: caught an exception which is not a SyntaxError.\n" .
        $actual->__toString());
      return 1;
    } elseif ($expected === null) {
      if ($actual === null) {
        $this->error("Assertion failed: any error expected, no error received.");
        return 1;
      } else {
        $this->successCount++;
        return 0;
      }
    } else {
      if (!isset($expected[0])) {
        $expected = [$expected];
      }
      $match = false;
      if (count($actual->expected) === count($expected)) {
        $match = true;
        foreach ($expected as $i => $expectation) {
          $match = $expectation['type'] === $actual->expected[$i]->type
            && $expectation['description'] === $actual->expected[$i]->description
            && ($expectation['value'] ?? null) === $actual->expected[$i]->value;
          if (!$match) {
            break;
          }
        }
      }
      if (!$match) {
        $this->error("Assertion failed: expected matching error details.\n" .
          "Expected: " . $this->encode($expected) . "\n" .
          "Actual: " . $this->encode($actual->expected));
        return 1;
      } else {
        $this->successCount++;
        return 0;
      }
    }
  }
}
