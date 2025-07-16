/* global beforeEach, jasmine */

"use strict";

beforeEach(function() {
  this.addMatchers({
    toHaveParts: function(expected) {
      this.message = () => "Expected " + jasmine.pp(this.actual.parts) +
        (this.isNot ? "not " : "") +
        " to match "+jasmine.pp(expected) + " and not be inverted, " +
        "but it " + (this.isNot ? "did" : "didn't") + ".";
      return this.env.equals_(this.actual.parts, expected) &&
        this.env.equals_(this.actual.inverted, false) &&
        this.env.equals_(this.actual.ignoreCase, false);
    },
    toHaveInvertedParts: function(expected) {
      this.message = () => "Expected " + jasmine.pp(this.actual.parts) +
        (this.isNot ? "not " : "") +
        " to match "+jasmine.pp(expected) + " and be inverted, " +
        "but it " + (this.isNot ? "did" : "didn't") + ".";
      return this.env.equals_(this.actual.parts, expected) &&
        this.env.equals_(this.actual.inverted, true) &&
        this.env.equals_(this.actual.ignoreCase, false);
    },
  });
});
