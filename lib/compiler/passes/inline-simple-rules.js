"use strict";

var arrays  = require("../../utils/arrays"),
    objects = require("../../utils/objects"),
    visitor = require("../visitor");

/*
 * Inline simple rules, like character classes and string constants.
 */
function inlineSimpleRules(ast, options) {
  if (options && options.noInlining) {
    return;
  }

  function isClassOrLiteral(node) {
    return node.type === 'class' || node.type === 'literal';
  }

  function isRepeatedClassOrLiteral(node) {
    return (node.type === 'zero_or_more' || node.type === 'one_or_more') &&
      isClassOrLiteral(node.expression);
  }

  function isTextRepeatedClassOrLiteral(node) {
    return node.type === 'text' && (
      isClassOrLiteral(node.expression) ||
      isRepeatedClassOrLiteral(node.expression)
    );
  }

  function isSimpleRule(node) {
    if ( node.type !== 'rule' ) {
      return false;
    }
    return isClassOrLiteral(node.expression) ||
      isRepeatedClassOrLiteral(node.expression) ||
      isTextRepeatedClassOrLiteral(node.expression);
  }

  function replaceRuleRefs(ast, from, toNode) {
    var removedAll = true;
    var replace = visitor.build({
      rule_ref: function(node) {
        if (node.name === from) {
          if (node.assignments.length > 0) {
            removedAll = false;
            return;
          }
          // Remove all properties of node
          arrays.each(objects.keys(node), function(name) {
            delete node[name];
          });
          // Deep-copy all properties from toNode
          arrays.each(objects.keys(toNode), function(name) {
            // A poor man's clone
            node[name] = JSON.parse(JSON.stringify(toNode[name]));
          });
        }
      }
    });

    replace(ast);
    return removedAll;
  }

  var indices = [];

  arrays.each(ast.rules, function(rule, i) {
    if (isSimpleRule(rule)) {
      var removedAll = replaceRuleRefs(ast, rule.name, rule.expression);
      if (removedAll && !arrays.contains(options.allowedStartRules, rule.name)) {
        indices.push(i);
      }
    }
  });

  indices.reverse();

  arrays.each(indices, function(i) { ast.rules.splice(i, 1); });
}

module.exports = inlineSimpleRules;
