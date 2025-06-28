"use strict";

var GrammarError = require("../../grammar-error"),
    visitor        = require("../visitor"),
    asts           = require("../asts");

// Find rules that always match/succeed:
// It only contains expressions that always match/succeed, either:
// * an optional (?) expression, or
// * a zero_or_more (*) expression, or
// * a rule reference to a rule that always matches/succeeds, or
// * a sequence containing only the aforementioned expressions, or
// * a choice containing at least one expression that always matches

function analyzeAlwaysMatch(ast, options) {
  options = options || {};
  if (options.noAlwaysMatch) {
    return;
  }

  // Look for rules which always match/succeed
  const alwaysMatch = function(node, result) {
    result.alwaysMatch = true;
  };

  const maybeMatch = function(node, result) {
    result.alwaysMatch = false;
  };

  const childMatch = function(node, result) {
    checkAlwaysMatch(node.expression, result);
  };

  const ruleMatch = function(node, result) {
    // To break cycles, mark this rule (conservatively) as *not*
    // always matching, before recursing.
    if (node.hasOwnProperty('alwaysMatch')) {
      result.alwaysMatch = node.alwaysMatch;
      return;
    }
    node.alwaysMatch = false;
    checkAlwaysMatch(node.expression, result);
    node.alwaysMatch = result.alwaysMatch;
  };

  const checkAlwaysMatch = visitor.build ({
    rule: ruleMatch,

    rule_ref: function(node, result) {
      const rule = asts.findRule( ast, node.name );
      checkAlwaysMatch(rule, result);
    },

    choice: function(node, result) {
      let alwaysMatch = false;
      node.alternatives.forEach( (child) => {
        // Don't recurse if we've already found a choice which always matches
        if (alwaysMatch) {
          if (child.type === 'rule_ref' &&
              asts.getRuleAttributeValue(asts.findRule(ast, child.name), "unreachable", false)) {
            // This is okay, the rule is flagged as known unreachable
          } else if (!options.allowUselessChoice) {
            throw new GrammarError(
              "Unreachable alternative.", child.location
            );
          }
        } else {
          let subresult = {};
          checkAlwaysMatch(child, subresult);
          alwaysMatch = subresult.alwaysMatch;
        }
      });

      result.alwaysMatch = alwaysMatch;
    },

    sequence: function(node, result) {
      if (node.hasOwnProperty('alwaysMatch')) {
        result.alwaysMatch = node.alwaysMatch;
        return;
      }
      let alwaysMatch = true;
      node.elements.forEach( (child) => {
        let subresult = {};
        checkAlwaysMatch(child, subresult);
        child.alwaysMatch = subresult.alwaysMatch;
        alwaysMatch = alwaysMatch && child.alwaysMatch;
      });
      result.alwaysMatch = alwaysMatch;
      node.alwaysMatch = alwaysMatch;
    },

    labeled: childMatch,
    text: childMatch,
    simple_and: childMatch,
    simple_not: maybeMatch,
    action: function(node, result) {
      if (node.hasOwnProperty('alwaysMatch')) {
        result.alwaysMatch = node.alwaysMatch;
        return;
      }
      checkAlwaysMatch(node.expression, result);
      node.alwaysMatch = result.alwaysMatch;
    },

    optional: alwaysMatch,
    zero_or_more: alwaysMatch,
    // "any" can fail to match if we're at the end of file
    any:  maybeMatch,
    // Same for 'class': even [^] will fail to match at end of file
    class: maybeMatch,

    one_or_more: maybeMatch,
    literal: function(node, result) {
      // Empty literal always match on any input
      result.alwaysMatch = node.value.length === 0 ? true : false;
    },

    semantic_and:  maybeMatch,
    semantic_not:  maybeMatch,
    parameter_and: maybeMatch,
    parameter_not: maybeMatch,
    labeled_param: maybeMatch,
  });

  checkAlwaysMatch(ast, {});
  // Specifically label sequence and action nodes
  const checkSequencesAndActions = visitor.build ({
    sequence: function(node) {
      node.elements.forEach( (child) => checkSequencesAndActions(child, {}) );
      checkAlwaysMatch(node, {});
    },
    action: function(node) {
      checkSequencesAndActions(node.expression, {});
      checkAlwaysMatch(node, {});
    },
  });
  checkSequencesAndActions(ast, {});
}

module.exports = analyzeAlwaysMatch;
