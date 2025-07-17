"use strict";

var objects = require("../utils/objects");

/* Simple AST node visitor builder. */
var visitor = {
  build: function(functions) {
    function visit(node) {
      return functions[node.type].apply(null, arguments);
    }

    function visitNop() { }

    function visitExpression(node) {
      var extraArgs = Array.prototype.slice.call(arguments, 1);

      visit.apply(null, [node.expression].concat(extraArgs));
    }

    function visitChildren(property) {
      return function(node) {
        var extraArgs = Array.prototype.slice.call(arguments, 1);

        node[property].forEach( (child) => {
          visit.apply(null, [child].concat(extraArgs));
        });
      };
    }

    var DEFAULT_FUNCTIONS = {
      grammar: function(node) {
        var extraArgs = Array.prototype.slice.call(arguments, 1);

        if (node.initializer) {
          if (Array.isArray(node.initializer)) {
            node.initializer.forEach( (initializer) => {
              visit.apply(null, [initializer].concat(extraArgs));
            });
          } else {
            visit.apply(null, [node.initializer].concat(extraArgs));
          }
        }

        node.rules.forEach( (rule) => {
          visit.apply(null, [rule].concat(extraArgs));
        });
      },

      initializer:   visitNop,
      rule:          visitExpression,
      choice:        visitChildren("alternatives"),
      action:        visitExpression,
      sequence:      visitChildren("elements"),
      labeled:       visitExpression,
      text:          visitExpression,
      simple_and:    visitExpression,
      simple_not:    visitExpression,
      optional:      visitExpression,
      zero_or_more:  visitExpression,
      one_or_more:   visitExpression,
      semantic_and:  visitNop,
      semantic_not:  visitNop,
      parameter_and: visitNop,
      parameter_not: visitNop,
      labeled_param: visitNop,
      rule_ref:      visitNop,
      literal:       visitNop,
      class:         visitNop,
      any:           visitNop
    };

    objects.defaults(functions, DEFAULT_FUNCTIONS);

    return visit;
  }
};

module.exports = visitor;
