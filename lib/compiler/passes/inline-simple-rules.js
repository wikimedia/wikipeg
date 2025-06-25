"use strict";

var visitor = require("../visitor");

/*
 * Inline simple rules, like character classes and string constants.
 */
function inlineSimpleRules(ast, options) {
  if (options && options.noInlining) {
    return;
  }

  const startRules = options.allowedStartRules.concat(options.allowedStreamRules);

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
          Object.keys(node).forEach((name) => delete node[name]);
          // Deep-copy all properties from toNode
          Object.keys(toNode).forEach((name) => {
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

  ast.rules.forEach( function(rule, i) {
    if (isSimpleRule(rule)) {
      var removedAll = replaceRuleRefs(ast, rule.name, rule.expression);
      if (removedAll && !startRules.includes(rule.name)) {
        indices.push(i);
      }
    }
  });

  indices.reverse();

  indices.forEach((i) => ast.rules.splice(i, 1));
}

module.exports = inlineSimpleRules;
