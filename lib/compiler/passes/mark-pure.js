"use strict";

var visitor        = require("../visitor"),
    asts           = require("../asts");

// Propagate `pure` attribute to `action` nodes

function markPure(ast, options) {
  options = options || {};
  var pureDefault = false;
  if (options.optimizePureActions) {
    pureDefault = true;
  }

  const propagatePure = visitor.build({
    rule: function(rule) {
      var pure = asts.getRuleAttributeValue(
        rule, 'pure', pureDefault
      );
      propagatePure(rule.expression, { pure });
    },
    action: function(node, result) {
      node.pure = result.pure;
    },
  });
  propagatePure(ast);
}

module.exports = markPure;
