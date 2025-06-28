"use strict";
/*eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */

var GrammarError = require("../../grammar-error"),
    visitor        = require("../visitor"),
    asts           = require("../asts"),
    classNode      = require("../charsets").classNode,
    objects        = require("../../utils/objects");

// Find nullable rules; that is, rules which can match the empty string.
// Nullable rules only contain nullable expressions, either:
//      * an optional (?) expression, or
//      * a zero_or_more (*) expression, or
//      * a rule reference to a nullable rule, or
//      * a sequence containing only nullable expressions, or
//      * a choice containing at least one nullable expression

function analyzeFirst(ast, options) {
  options = options || {};
  if (options.noOptimizeFirstSet || options.optimizeFirstSet === 'none') {
    return;
  }
  const dumpAnalysis = options.dumpAnalyzeFirst;
  const optimizeFirstSet = options.optimizeFirstSet || 'call';

  // Look for nullable rules (can match the empty string)

  // Cache nullability at every node.
  function cacheNullable(f) {
    return function(node) {
      if (!node.hasOwnProperty('nullable')) {
        node.nullable = f(node);
      }
      return node.nullable;
    };
  }

  const checkNullable =
    cacheNullable((node) => asts.matchesEmpty(ast, node, cacheNullable));

  ast.rules.forEach((rule) => checkNullable(rule));

  // Now compute the FIRST set for each node: the set of characters
  // which can begin a valid match.  Perhaps more usefully: if the
  // next character in the input is *not* in FIRST, and the expression is
  // not nullable, the expression is guaranteed to FAIL.

  function firstIsChild(node) {
    return checkFirst(node.expression);
  }

  function firstRule(node) {
    if (node.hasOwnProperty('firstSet')) {
      return node.firstSet;
    }
    // To break cycles, mark this rule (conservatively) as having firstSet
    // of 'any' before recursing.
    node.firstSet = classNode.any();
    if (asts.getRuleAttributeValue(node, 'empty') === false) {
      // If we have a manual override that says this rule is not empty,
      // then conservatively assume it can match any character.
      return node.firstSet;
    }
    const first = checkFirst(node.expression);
    node.firstSet = first;
    if (dumpAnalysis) {
      console.error(node.name, `nullable=${node.nullable}`, "first", node.firstSet);
    }
    return first;
  }

  const checkFirst = visitor.build ({
    rule: firstRule,

    rule_ref: function(node) {
      const rule = asts.findRule(ast, node.name);
      return checkFirst(rule);
    },

    choice: function(node) {
      if (node.alternatives.length === 0) {
        throw new GrammarError( "No choices.", node.location );
      }
      let first = checkFirst(node.alternatives[0]);
      for (let i = 1; i < node.alternatives.length; i++) {
        if (classNode.isAny(first)) {
          break; // first set can't grow more than this
        }
        first = classNode.union(first, checkFirst(node.alternatives[i]));
      }
      return first;
    },

    sequence: function(node) {
      if (node.elements.length === 0) {
        throw new GrammarError( "No sequence.", node.location );
      }
      let first = checkFirst(node.elements[0]);
      let nullable = checkNullable(node.elements[0]);
      let fixups = [];
      for (let i = 1; nullable && i < node.elements.length; i++) {
        if (classNode.isAny(first)) {
          break; // first set can't grow more than this
        }
        if (
          node.elements[i].type === 'simple_and' &&
          !checkNullable(node.elements[i].expression) &&
          i < node.elements.length - 1
        ) {
          // get a bit more clever with simple_and when expression is
          // not nullable.
          let currentFirst = first;
          fixups.push(function(tail) {
            return classNode.union(
              currentFirst,
              classNode.intersection(
                checkFirst(node.elements[i].expression),
                tail
              )
            );
          });
          first = classNode.empty();
          continue;
        }
        first = classNode.union(first, checkFirst(node.elements[i]));
        nullable = checkNullable(node.elements[i]);
      }
      while (fixups.length) {
        let f = fixups.pop();
        first = f(first);
      }
      return first;
    },

    labeled: firstIsChild,
    text: firstIsChild,
    simple_and: classNode.empty,
    simple_not: classNode.empty,
    action: firstIsChild,

    optional: firstIsChild,
    zero_or_more: firstIsChild,
    one_or_more: firstIsChild,

    any: classNode.any,
    class: function(node) {
      // preprocess the node into a sorted firstSet
      return classNode.sort(objects.clone(node));
    },
    literal: function(node) {
      if (node.value.length === 0) {
        return classNode.empty();
      }
      return classNode.sort({
        type: "class",
        parts: [node.value[0]],
        inverted: false,
        ignoreCase: node.ignoreCase,
      });
    },

    semantic_and: classNode.empty,
    semantic_not: classNode.empty,
    parameter_and: classNode.empty,
    parameter_not: classNode.empty,
    labeled_param: classNode.empty,
  });

  ast.rules.forEach((rule) => checkFirst(rule));

  // Now we transform every non-nullable rule_ref to:
  //  (&FIRST rule)
  // if first is not ANY

  const addFirstPrefixesAtCall = visitor.build({
    rule_ref: function(node) {
      const rule = asts.findRule(ast, node.name);
      if (rule.nullable || classNode.isAny(rule.firstSet)) {
        return;
      }
      const location = node.location;
      const newRuleRef = objects.clone(node);
      const wasPicked = node.picked;
      newRuleRef.picked = true;
      // Remove all properties of node
      Object.keys(node).forEach((name) => delete node[name]);
      Object.assign(node, {
        type: "sequence",
        location: location,
        elements: [
          {
            type: "simple_and",
            location: location,
            expression: Object.assign({
              location: location,
            }, rule.firstSet),
            isFirstSetTest: rule.name,
          },
          newRuleRef,
        ],
        picked: wasPicked,
        numPicked: 1,
      });
    },
  });

  const addFirstPrefixesAtDef = visitor.build({
    rule: function(rule) {
      if (rule.nullable || classNode.isAny(rule.firstSet)) {
        return;
      }
      const location = rule.location;
      const oldExpr = rule.expression;
      const wasPicked = oldExpr.picked;
      oldExpr.picked = true;
      rule.expression = {
        type: "sequence",
        location: location,
        elements: [
          {
            type: "simple_and",
            location: location,
            expression: Object.assign({
              location: location,
            }, rule.firstSet),
            isFirstSetTest: rule.name,
          },
          oldExpr,
        ],
        picked: wasPicked,
        numPicked: 1,
      };
    },
  });

  if (optimizeFirstSet === 'def') {
    addFirstPrefixesAtDef(ast);
  } else if (optimizeFirstSet === 'call') {
    addFirstPrefixesAtCall(ast);
  } else {
    // don't optimize at all, just analyze
  }
}

module.exports = analyzeFirst;
