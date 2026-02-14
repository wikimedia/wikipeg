/* global beforeEach, jasmine, addMatchersLegacy */

"use strict";

beforeEach(function() {
  addMatchersLegacy(jasmine, {
    toHaveParts: function(actual, expected, matchersUtil, isNot) {
      var result = {};
      result.message = () => "Expected " + matchersUtil.pp(actual.parts) +
        (isNot ? "not " : "") +
        " to match "+matchersUtil.pp(expected) + " and not be inverted, " +
        "but it " + (isNot ? "did" : "didn't") + ".";
      result.pass = matchersUtil.equals(actual.parts, expected) &&
        matchersUtil.equals(actual.inverted, false) &&
        matchersUtil.equals(actual.ignoreCase, false);
      return result;
    },
    toHaveInvertedParts: function(actual, expected, matchersUtil, isNot) {
      var result = {};
      result.message = () => "Expected " + matchersUtil.pp(actual.parts) +
        (isNot ? "not " : "") +
        " to match "+matchersUtil.pp(expected) + " and be inverted, " +
        "but it " + (isNot ? "did" : "didn't") + ".";
      result.pass = matchersUtil.equals(actual.parts, expected) &&
        matchersUtil.equals(actual.inverted, true) &&
        matchersUtil.equals(actual.ignoreCase, false);
      return result;
    },
  });
});
