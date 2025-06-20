"use strict";

var visitor = require("../visitor");

/*
 * Removes proxy rules -- that is, rules that only delegate to other rule.
 */
function removeProxyRules(ast, options) {
  function isProxyRule(node) {
    return node.type === "rule"
      && node.expression.type === "rule_ref"
      && node.expression.assignments.length === 0;
  }

  function replaceRuleRefs(ast, from, to) {
    var replace = visitor.build({
      rule_ref: function(node) {
        if (node.name === from) {
          node.name = to;
        }
      }
    });

    replace(ast);
  }

  var indices = [];

  ast.rules.forEach( function(rule, i) {
    if (isProxyRule(rule)) {
      replaceRuleRefs(ast, rule.name, rule.expression.name);
      if (!options.allowedStartRules.includes(rule.name)) {
        indices.push(i);
      }
    }
  });

  indices.reverse();

  indices.forEach( (i) => { ast.rules.splice(i, 1); });
}

module.exports = removeProxyRules;
