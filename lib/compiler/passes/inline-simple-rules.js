"use strict";

var visitor = require("../visitor"),
    asts = require("../asts");

/*
 * Inline simple rules, like character classes and string constants.
 */
function inlineSimpleRules(ast, options) {

  const startRules = options.allowedStartRules.concat(options.allowedStreamRules);

  function isSimpleRule(rule) {
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

    // By default don't inline rules which have attributes
    // (other than 'inline')
    if ((rule.attributes || []).some((attr) => attr.name !== 'inline')) {
      return false;
    }
    return isClassOrLiteral(rule.expression) ||
      isRepeatedClassOrLiteral(rule.expression) ||
      isTextRepeatedClassOrLiteral(rule.expression);
  }

  function isInlineRule(rule) {
    let inline = asts.getRuleAttributeValue(rule, "inline", undefined);
    if (inline !== undefined) {
      return inline;
    }
    if (options.noInlining) {
      return false;
    }
    return isSimpleRule(rule);
  }

  function replaceRuleRefs(ast, from, toNode) {
    var removedAll = true;
    var replace = visitor.build({
      rule_ref: function(node) {
        if (node.name === from) {
          // skip inlining if this reference has parameters
          if (node.assignments.length > 0) {
            removedAll = false;
            return;
          }
          const wasPicked = node.picked;
          // Remove all properties of node
          Object.keys(node).forEach((name) => delete node[name]);
          // Deep-copy all properties from toNode
          Object.keys(toNode).forEach((name) => {
            // A poor man's clone
            node[name] = JSON.parse(JSON.stringify(toNode[name]));
          });
          if (wasPicked) {
            node.picked = wasPicked;
          }
        }
      }
    });

    replace(ast);
    return removedAll;
  }

  var indices = [];

  ast.rules.forEach( function(rule, i) {
    if (isInlineRule(rule)) {
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
