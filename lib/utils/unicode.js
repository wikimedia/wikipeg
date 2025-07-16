"use strict";

const fs = require("fs"),
    casefold = require("./casefold");

// Raw case folding definitions from CaseFolding.txt
const caseFoldDefs = casefold.parse(
  fs.readFileSync(__dirname + "/CaseFolding.txt", "utf-8")
);

// Maps from a character to its canonical "case folded" version
const simpleCaseFolding = [];

// Maps from a canonical "case folded" character to all characters
// which map to it.
const reverseSimpleCaseFolding = [];

// Compute simpleCaseFolding/reverseSimpleCaseFolding
for (const def of caseFoldDefs) {
  if (def.status === 'C' || def.status === 'S') {
    const mapped = def.mapped[0];
    simpleCaseFolding[def.code] = mapped;
    if (reverseSimpleCaseFolding[mapped] === undefined) {
      reverseSimpleCaseFolding[mapped] = [mapped];
    }
    reverseSimpleCaseFolding[mapped].push(def.code);
  }
}

module.exports = {
  defs: caseFoldDefs,
  simpleCaseFolding,
  reverseSimpleCaseFolding,
};
