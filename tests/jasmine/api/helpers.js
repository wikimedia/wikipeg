/* global beforeEach, jasmine, addMatchersLegacy */

"use strict";

beforeEach(function() {
  addMatchersLegacy(jasmine, {
    toBeObject: function (actual, expected, matchersUtil, isNot) {
      return {
        message: function() {
          return "Expected " + matchersUtil.pp(actual) + " "
            + (isNot ? "not " : "")
            + "to be an object.";
        },
        pass: actual !== null && typeof actual === "object",
      };
    },
    toBeArray: function (actual, expected, matchersUtil, isNot) {
      return {
        message: function() {
          return "Expected " + matchersUtil.pp(actual) + " "
            + (isNot ? "not " : "")
            + "to be an array.";
        },
        pass: Object.prototype.toString.apply(actual) === "[object Array]",
      };
    },
    toBeFunction: function (actual, expected, matchersUtil, isNot) {
      return {
        message: function() {
          return "Expected " + matchersUtil.pp(actual) + " "
            + (isNot ? "not " : "")
            + "to be a function.";
        },
        pass: typeof actual === "function",
      };
    },
  });
});
