"use strict";

var asts = require("./asts");

/**
 * A visitor which traverses the grammar like a directed graph, following
 * rule_ref nodes into their associated rules, but only visiting each node
 * once per instance. Calling traverse() on a node which has already been
 * visited has no effect.
 */
function Traverser(ast, handlers) {
  this.ast = ast;
  this.visitedNodes = new Set();
  this.changed = false;
  for (let type in this.defaultHandlers) {
    this[type] = this.defaultHandlers[type].bind(this);
  }
  for (let type in handlers) {
    this[type] = handlers[type].bind(this);
  }
}

function traverseNop(/*node*/) {
}

function traverseExpression(node, ...rest) {
  this.traverse.apply(this, [node.expression].concat(rest));
}

function traverseChildren(property) {
  return function traverseChildrenSpecialised(node, ...rest) {
    for (let i = 0; i < node[property].length; i++) {
      this.traverse.apply(this, [node[property][i]].concat(rest));
    }
  };
}

function traverseRuleRef(node, ...rest) {
  let rule = asts.findRule(this.ast, node.name);
  this.traverse.apply(this, [rule].concat(rest));
}

Traverser.prototype = {
  traverse: function(node, ...rest) {
    if (this.visitedNodes.has(node)) {
      return;
    }
    this.visitedNodes.add(node);
    let handler = this[node.type];
    if (!handler) {
      throw new Error("Unknown node type: " + node.type);
    }
    handler(node, ...rest);
  },

  reset: function() {
    this.visitedNodes.clear();
    this.changed = false;
  },

  defaultHandlers: {
    initializer:   traverseNop,
    rule:          traverseExpression,
    named:         traverseExpression,
    choice:        traverseChildren("alternatives"),
    action:        traverseExpression,
    sequence:      traverseChildren("elements"),
    labeled:       traverseExpression,
    text:          traverseExpression,
    simple_and:    traverseExpression,
    simple_not:    traverseExpression,
    optional:      traverseExpression,
    zero_or_more:  traverseExpression,
    one_or_more:   traverseExpression,
    semantic_and:  traverseNop,
    semantic_not:  traverseNop,
    parameter_and: traverseNop,
    parameter_not: traverseNop,
    labeled_param: traverseNop,
    rule_ref:      traverseRuleRef,
    literal:       traverseNop,
    "class":       traverseNop,
    any:           traverseNop
  }
};

module.exports = Traverser;
