"use strict";

var visitor = require("./visitor");

/* AST utilities. */
var asts = {
  findRule: function(ast, name) {
    if (ast.rulesByName === undefined) {
      ast.rulesByName = {};
      ast.rules.forEach(function(r) {
        ast.rulesByName[r.name] = r;
      });
    }
    return ast.rulesByName[name];
  },

  indexOfRule: function(ast, name) {
    return ast.rules.findIndex((r) => r.name === name);
  },

  findRuleAttribute: function(rule, name) {
    return (rule.attributes || []).find((attr) => attr.name === name);
  },

  getRuleAttributeValue: function(rule, name, defaultValue) {
    let attr = asts.findRuleAttribute(rule, name);
    return attr === undefined ? defaultValue : attr.value;
  },

  matchesEmpty: function(ast, node, wrapper) {
    function matchesTrue()  { return true;  }
    function matchesFalse() { return false; }

    function matchesExpression(node) {
      return matches(node.expression);
    }

    wrapper = wrapper || ( (f) => f );
    var matches = wrapper(visitor.build({
      rule: matchesExpression,

      choice: function(node) {
        return node.alternatives.some(matches);
      },

      action: matchesExpression,

      sequence: function(node) {
        return node.elements.every(matches);
      },

      labeled:      matchesExpression,
      text:         matchesExpression,
      simple_and:   matchesTrue,
      simple_not:   matchesTrue,
      optional:     matchesTrue,
      zero_or_more: matchesTrue,
      one_or_more:  matchesExpression,
      semantic_and: matchesTrue,
      semantic_not: matchesTrue,

      parameter_and: matchesTrue,
      parameter_not: matchesTrue,
      labeled_param: matchesTrue,

      rule_ref: function(node) {
        return matches(asts.findRule(ast, node.name));
      },

      literal: function(node) {
        return node.value === "";
      },

      class:   matchesFalse,
      any:     matchesFalse
    }));

    return matches(node);
  }
};

module.exports = asts;
