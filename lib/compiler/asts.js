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

  matchesEmpty: function(ast, node) {
    function matchesTrue()  { return true;  }
    function matchesFalse() { return false; }

    function matchesExpression(node) {
      return matches(node.expression);
    }

    var matches = visitor.build({
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

      rule_ref: function(node) {
        return matches(asts.findRule(ast, node.name));
      },

      literal: function(node) {
        return node.value === "";
      },

      class:   matchesFalse,
      any:     matchesFalse
    });

    return matches(node);
  }
};

module.exports = asts;
