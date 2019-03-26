#!/usr/bin/env node

"use strict";

const PEG  = require("../../lib/peg");
const readline = require("readline");

process.stdin.setEncoding('utf8');

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
  terminal: false
});

rl.on('line', function (line) {
  let options = {
    cache:    false,
    output:   "source",
    trace:    false,
    plugins:  [],
    language: 'php',
    commonLang: true,
  };
  Object.assign(options, JSON.parse(line));

  process.stdout.write(JSON.stringify(PEG.buildParser(options.input, options) + "\n") + "\n");
});

rl.on('error', function(error) {
  process.exit(0);
});
process.stdin.on('error', function(error) {
  process.exit(0);
});
