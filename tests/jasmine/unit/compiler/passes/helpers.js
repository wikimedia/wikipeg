/* global beforeEach, jasmine, PEG, addMatchersLegacy */

"use strict";

beforeEach(function() {
  addMatchersLegacy(jasmine, {
    toChangeAST: function(pass, grammar, matchersUtil, isNot, options, details) {
      function matchDetails(value, details) {
        function isArray(value) {
          return Object.prototype.toString.apply(value) === "[object Array]";
        }

        function isObject(value) {
          return value !== null && typeof value === "object";
        }

        var i, key;

        if (isArray(details)) {
          if (!isArray(value)) { return false; }

          if (value.length !== details.length) { return false; }
          for (i = 0; i < details.length; i++) {
            if (!matchDetails(value[i], details[i])) { return false; }
          }

          return true;
        } else if (isObject(details)) {
          if (!isObject(value)) { return false; }

          for (key in details) {
            if (details.hasOwnProperty(key)) {
              if (!(key in value)) { return false; }

              if (!matchDetails(value[key], details[key])) { return false; }
            }
          }

          return true;
        } else {
          return value === details;
        }
      }

      // Allow 'options' to be an optional argument.
      if (details === undefined) {
        details = options;
        options = {};
      }
      var ast     = PEG.parser.parse(grammar, options);
      var result = {};

      // options defaults should match those in compiler.js:compile()
      pass(ast, Object.assign({
        allowedStartRules: [ast.rules[0].name],
        allowedStreamRules: [],
        cache: false,
        trace: false,
        optimize: "speed",
        output: "parser",
      }, options));

      result.message = function() {
        return "Expected the pass "
          + "with options " + matchersUtil.pp(options) + " "
          + (isNot ? "not " : "")
          + "to change the AST " + matchersUtil.pp(ast) + " "
          + "to match " + matchersUtil.pp(details) + ", "
          + "but it " + (isNot ? "did" : "didn't") + ".";
      };
      result.pass = matchDetails(ast, details);
      return result;
    },

    toReportError: function(pass, grammar, matchersUtil, isNot, options, details) {
      // Allow 'options' to be an optional argument.
      if (details === undefined) {
        details = options;
        options = {};
      }
      var ast = PEG.parser.parse(grammar, options);
      var result = {};

      try {
        // options defaults should match those in compiler.js:compile()
        pass(ast, Object.assign({
          allowedStartRules: [ast.rules[0].name],
          allowedStreamRules: [],
          cache: false,
          trace: false,
          optimize: "speed",
          output: "parser",
        }, options));

        result.message = function() {
          return "Expected the pass to report an error "
            + (details ? "with details " + matchersUtil.pp(details) + " ": "")
            + "for grammar " + matchersUtil.pp(grammar) + ", "
            + "but it didn't.";
        };
        result.pass = false;
        return result;
      } catch (e) {
        /*
         * Should be at the top level but then JSHint complains about bad for
         * in variable.
         */
        var key;

        if (isNot) {
          result.message = function() {
            return "Expected the pass not to report an error "
              + "for grammar " + matchersUtil.pp(grammar) + ", "
              + "but it did.";
          };
        } else {
          if (details) {
            for (key in details) {
              if (details.hasOwnProperty(key)) {
                if (!matchersUtil.equals(e[key], details[key])) {
                  result.message = function() {
                    return "Expected the pass to report an error "
                      + "with details " + matchersUtil.pp(details) + " "
                      + "for grammar " + matchersUtil.pp(grammar) + ", "
                      + "but " + matchersUtil.pp(key) + " "
                      + "is " + matchersUtil.pp(e[key]) + ".";
                  };
                  result.pass = false;
                  return result;
                }
              }
            }
          }
        }

        result.pass = true;
        return result;
      }
    }
  });
});
