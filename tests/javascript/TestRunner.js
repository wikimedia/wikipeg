"use strict";

let fs = require("fs");
let PEG = require("../../lib/peg.js");

class TestRunner {
  constructor() {
    this.verbose = false;
    this.targetId = null;
    this.dumpCode = false;
    this.success = false;
    this.successCount = 0;
    this.totalCount = 0;
    this.longContext = '';
    this.shortContext = '';
  }

  readFile(fileName) {
    let testFileParserSource = fs.readFileSync(__dirname + '/../common/TestFile.peg', 'utf8');
    let testFileParser = PEG.buildParser(testFileParserSource, {
      cache:    false,
      output:   "parser",
      trace:    false,
      plugins:  [],
      language: 'javascript',
      commonLang: true,
    });

    let testSource = fs.readFileSync(__dirname + '/../common/tests.txt', 'utf8');
    try {
      return testFileParser.parse(testSource);
    } catch (e) {
      if (e.name === 'SyntaxError') {
        this.error(`Syntax error in ${fileName}:${e.location.start.line}:${e.location.start.column}: ${e.message}`);
        return [];
      } else {
        throw e;
      }
    }
  }

  runFile(fileName, options) {
    this.verbose = !!options.v;
    this.targetId = options.id === undefined ? null : options.id;
    this.dumpCode = !!options['dump-code'];

    console.log("Running language-independent tests against JavaScript");

    this.setErrorContext(null);

    this.success = true;
    this.successCount = 0;

    let tests = this.readFile(fileName);

    for (let test of tests) {
      test.cache = false;
      this.runTest(test);
      test.cache = true;
      this.runTest(test);
    }

    let msg;
    if (this.successCount === this.totalCount) {
      msg = "SUCCESS: ";
    } else {
      msg = "FAILED: ";
    }
    msg += `${this.successCount} / ${this.totalCount} assertions were successful`;
    console.log(msg);

    return this.success;
  }

  runTest(test) {
    this.setErrorContext(test);
    let parser;

    for (let caseIndex = 0; caseIndex < test.cases.length; caseIndex++) {
      let testCase = test.cases[caseIndex];
      this.setErrorContext(test, caseIndex);
      if (!this.checkIdFilter(test, caseIndex)) {
        continue;
      }
      if (parser === undefined) {
        parser = this.makeTestParser(test);
        if (parser === null) {
          // Invalid parser, error already reported
          return;
        }
      }

      this.info('starting');
      let errorCount = 0;
      let e;
      let result;
      try {
        result = parser.parse(testCase.input);
      } catch (e_) {
        e = e_;
      }

      if (testCase.error !== undefined) {
        errorCount += this.assertError(e, testCase.errorResult);
      } else if (testCase.ReferenceError) {
        errorCount += this.assertIdentical(e.constructor === ReferenceError, true,
          'expected reference error');
      } else {
        errorCount += this.assertIdentical(String(e), 'undefined', 'expected no exception');
        errorCount += this.assertIdentical(result, testCase.expected, 'result mismatch');
      }
      if (errorCount) {
        this.info('FAILED');
      } else {
        this.info('succeeded');
      }
    }
  }

  makeTestParser(test) {
    let code = PEG.buildParser(test.grammar, {
      cache: test.cache,
      output: 'source',
      commonLang: true,
      language: 'javascript',
    });

    if (this.dumpCode) {
      console.log(code);
    }

    return eval(code);
  }

  getCaseId(test, caseIndex) {
    let cache = test.cache ? '.cache' : '';
    return `${test.id}${cache}.${caseIndex + 1}`;
  }

  checkIdFilter(test, caseIndex) {
    return this.targetId === null ||
      test.id.toString() === this.targetId ||
      this.getCaseId(test, caseIndex) === this.targetId;
  }

  setErrorContext(test, caseIndex = null) {
    if (test) {
      if (caseIndex !== null) {
        let caseId = this.getCaseId(test, caseIndex);
        this.longContext = `Test #${caseId} "${test.desc}"\n`;
        this.shortContext = `Test #${caseId}: `;
      } else {
        this.longContext = `Test #${test.id} "${test.desc}"\n`;
        this.shortContext = `Test #${test.id}: `;
      }
    } else {
      this.longContext = '';
      this.shortContext = '';
    }
  }

  info(message) {
    if (this.verbose) {
      console.log(this.shortContext + message);
    }
  }

  error(message) {
    console.log(this.longContext + message + "\n");
    this.success = false;
  }

  assertIdentical(actual, expected, desc) {
    this.totalCount++;
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      this.error(`Assertion failed: ${desc}\n` +
        `Expected: ${JSON.stringify(expected)}\n` +
        `Actual: ${JSON.stringify(actual)}\n`);
      return 1;
    } else {
      this.successCount++;
      return 0;
    }
  }

  assertError(actual, expected) {
    this.totalCount++;
    if (!actual || actual.name !== 'SyntaxError') {
      this.error("Assertion failed: caught an exception which is not a SyntaxError.\n" +
        String(actual));
    } else if (expected === null) {
      if (actual === null) {
        this.error("Assertion failed: any error expected, no error received.");
        return 1;
      } else {
        this.successCount++;
        return 0;
      }
    } else {
      if (!Array.isArray(expected)) {
        expected = [expected];
      }
      if (JSON.stringify(actual.expected) !== JSON.stringify(expected)) {
        this.error("Assertion failed: expected matching error details.\n" +
          `Expected: ${JSON.stringify(expected)}\n` +
          `Actual: ${JSON.stringify(actual)}\n`);
        return 1;
      } else {
        this.successCount++;
        return 0;
      }
    }
  }
}

module.exports = TestRunner;
