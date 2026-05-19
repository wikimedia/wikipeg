#!/usr/bin/env node
"use strict";

const buildParser = require('../php/buildParser.js').buildParser;
const fs = require("fs");

const cacheContents = fs.readFileSync(__dirname + '/../php/testcache.json');
const cache = JSON.parse(cacheContents);
let errors = 0;
for (const [key,expected] of Object.entries(cache)) {
  const options = JSON.parse(key);
  const actual = buildParser(options);
  if ( expected !== actual ) {
	errors++;
	const preview = options.input.length > 10 ? options.input.slice(0,10) + '...' : options.input;
	console.log("Cache mismatch!", preview);
  }
}
if (errors) {
  console.log("Run `make testcache` to regenerate cache file.");
  process.exit(1);
}
process.exit(0);
