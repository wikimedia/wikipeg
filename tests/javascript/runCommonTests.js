"use strict";

const TestRunner = require("./TestRunner");

function runCommonTests() {
  let runner = new TestRunner();

  let args = process.argv.slice(2);
  let options = {};
  while (args.length) {
    let arg = args.shift();
    switch (arg) {
      case '--help':
        console.log(`Usage: node runCommonTests.js [...options...]
Available options:
  --id <id>     Specify either the test ID (e.g. 10) or the case ID (e.g. 10.4)
  -v            Print something when tests start and stop
  --dump-code   Write the generated JS code for the selected tests to stdout`);
        return false;

      case '--id':
        options.id = args.shift();
        break;

      case '-v':
        options.v = true;
        break;

      case '--dump-code':
        options['dump-code'] = true;
        break;

      default:
        console.log(`Unrecognised option "${arg}"`);
        return false;
    }
  }

  return runner.runFile( __dirname + '/../common/tests.txt', options);
}

process.exit(runCommonTests() ? 0 : 1);
