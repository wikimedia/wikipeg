#!/usr/bin/env node

"use strict";

const PEG  = require("../../lib/peg");
const readline = require("readline");
const buildParser = require('./buildParser.js').buildParser;

process.stdin.setEncoding('utf8');

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
  terminal: false
});

rl.on('line', function (line) {
  let result = buildParser(JSON.parse(line));
  process.stdout.write(JSON.stringify(result) + "\n");
});

rl.on('error', function(error) {
  process.exit(0);
});
process.stdin.on('error', function(error) {
  process.exit(0);
});
