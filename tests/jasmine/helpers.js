/* global globalThis */

"use strict";

globalThis.PEG = require("../../lib/peg.js");

globalThis.addMatchersLegacy = function(jasmine, m) {
  var out = {};
  Object.keys(m).forEach((name) => {
    out[name] = (matchersUtil) => {
      return {
        compare: function(actual, expected, ...extra) {
          return m[name](actual, expected, matchersUtil, false, ...extra);
        },
        negativeCompare: function(actual, expected, ...extra) {
          var result = m[name](actual, expected, matchersUtil, true, ...extra);
          result.pass = !result.pass;
          return result;
        },
      };
    };
  });
  jasmine.addMatchers(out);
};
