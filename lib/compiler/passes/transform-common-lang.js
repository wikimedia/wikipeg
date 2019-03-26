"use strict";

var visitor        = require("../visitor");

/**
 * Perform a few simple transformations to convert a special subset of PHP to
 * JavaScript, for the purposes of writing grammar files used by both languages.
 * Used for testing.
 */
function transformCommonLang(ast, options) {
  if (!options.commonLang) {
    return;
  }

  function transform(code) {
    if (options.language === 'javascript') {
      code = code.replace(/\$this->/g, '');
      code = code.replace(/\$(?=\w+)/g, '');
    }
    return code;
  }

  function isExcluded(code) {
    let isJS = /^[ \t\n]*\/\/ (JavaScript|JS)\b/i.test(code);
    let isPHP = /^[ \t\n]*\/\/ PHP\b/i.test(code);
    if (options.language === 'javascript' && isPHP) {
      return true;
    }
    if (options.language === 'php' && isJS) {
      return true;
    }
    return false;
  }

  var visit = visitor.build({
    grammar: function(node) {
      if (node.initializer) {
        if (Array.isArray(node.initializer)) {
          node.initializer = node.initializer.filter(function(init) {
            return !isExcluded(init.code);
          });
        } else {
          if (isExcluded(node.initializer.code)) {
            node.initializer = null;
          }
        }
      }

      for (let rule of node.rules) {
        visit(rule);
      }
    },

    action: function(node) {
      node.code = transform(node.code);
      visit(node.expression);
    },

    semantic_and: function(node) {
      node.code = transform(node.code);
    },

    semantic_not: function(node) {
      node.code = transform(node.code);
    },
  });

  visit(ast);
}

module.exports = transformCommonLang;
