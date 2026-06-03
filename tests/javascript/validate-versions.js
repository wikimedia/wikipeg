#!/usr/bin/env node
"use strict";

const packageJson = require('../../package.json');
const packageLockJson = require('../../package-lock.json');
const libPeg = require('../../lib/peg.js');


// Parse version from HISTORY.md: if first ## line is "x.x.x (not yet released)",
// the expected version is <next ## version>-git; otherwise it's an exact match.
const fs = require('fs');
const history = fs.readFileSync(__dirname+'/../../HISTORY.md');
let historyVersion = null;
let historyIsPrerelease = false;
for (const line of history.toString().split('\n')) {
	const match = line.match(/^## (\S+)/);
	if (match) {
		if (match[1] === 'x.x.x') {
			historyIsPrerelease = true;
		} else {
			historyVersion = match[1];
			break;
		}
	}
}
if (historyIsPrerelease && historyVersion) {
	historyVersion += '-git';
}

let errors = 0;
let advice = null;
if (packageJson.version !== packageLockJson.version) {
	advice = "Run `npm install --package-lock-only`";
	errors++;
}
if (packageJson.version !== packageLockJson.packages[""].version) {
	advice = "Run `npm install --package-lock-only`";
	errors++;
}
if (packageJson.version !== libPeg.VERSION) {
	errors++;
}
if (packageJson.version !== historyVersion) {
	advice = advice || 'Perhaps you need to run `composer update-history`';
	errors++;
}

if (errors) {
	console.log("*** wikipeg version mismatch! ***");
	console.log("package.json     ", packageJson.version);
	console.log("package-lock.json", packageLockJson.version);
	console.log("                 ", packageLockJson.packages[""].version);
	console.log("lib/peg.js       ", libPeg.VERSION);
	console.log("HISTORY.md       ", historyVersion || '<unknown>');
	if (advice) {
		console.log("");
		console.log(advice);
	}
	process.exit(1);
}
console.log("Version check ok.");
process.exit(0);
