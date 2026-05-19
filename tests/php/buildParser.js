"use strict";

const PEG  = require("../../lib/peg");

module.exports.buildParser = function( opts ) {
  let options = {
    cache:    false,
    output:   "source",
    trace:    false,
    plugins:  [],
    language: 'php',
    commonLang: true,
    optimizeFirstSet: 'call',
  };
  Object.assign(options, opts);
  let code = PEG.buildParser(options.input, options) + "\n";
  return code.replace(/^<\?php/, '');
};
