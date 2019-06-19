"use strict";

var visitor        = require("../visitor"),
    asts           = require("../asts");

// Find rules that never report failures and silence them.
// 1. A start rule always reports failure.
// 2. A non-start rule does not report failure if every caller is either:
//    A) a named rule
//       (this is because named rules manually report failure, attributing
//        the failure to the named rule instead of its children), or
//    B) inside an assertion (and (&) or not (!) expressions), or
//    C) (transitively) a rule which does not report failure

function optimizeFailureReporting(ast, options) {

  const startRules = options.allowedStartRules.concat(options.allowedStreamRules);

  // Disable failure reporting for rules by default, and find rules for which
  // conditions 2A, 2B, or 2C are false.
  ast.rules.forEach( (node) => {
    node.reportsFailure = false;
  });

  // Enable failure reporting for start rules (condition 1)
  const failReportingRules = startRules.map((name) =>
    asts.findRule( ast, name )
  );

  // Selectively enable failure reporting for rules in start rules' call graph
  const skipChildren = () => {};
  const check = visitor.build ({
    rule: function(node) {
      // We are visiting this rule because we've found that it may report
      // failures.  All rules referenced may also report failures.
      node.reportsFailure = true;
      check(node.expression);
    },

    // Break AST traversing because failure reporting is disabled in a named
    // rule (2A)
    named: skipChildren,

    // Never reports failure, so break AST traversing (2B)
    simple_and: skipChildren,
    simple_not: skipChildren,

    rule_ref: function(node) {
      const rule = asts.findRule(ast, node.name);
      // This function is only reached when the parent rule reports failures.
      // Recheck all rules called by the referenced rule (2C)
      if (!rule.reportsFailure) {
        failReportingRules.push( rule );
      }
    },
  });

  while (failReportingRules.length) {
    check(failReportingRules.shift());
  }
}

module.exports = optimizeFailureReporting;
