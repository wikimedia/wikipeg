"use strict";

var GrammarError = require("../../grammar-error"),
    visitor      = require("../visitor");

/* Checks that all rule attributes are known. (Catches typos.) */
function reportUnknownAttributes(ast) {
  const KNOWN_ATTRIBUTES = {
    name: 'string',
    inline: 'boolean',
    cache: 'boolean',
    empty: 'boolean',
    unreachable: 'boolean',
    pure: 'boolean',
  };

  var check = visitor.build({
    rule: function(rule) {
      for (const attr of rule.attributes || []) {
        if (!KNOWN_ATTRIBUTES[attr.name]) {
          throw new GrammarError(
            "Rule \"" + rule.name + "\" contains unknown attribute \"" + attr.name + "\".",
            attr.location
          );
        }
        if (typeof(attr.value) !== KNOWN_ATTRIBUTES[attr.name]) {
          throw new GrammarError(
            "Rule \"" + rule.name + "\" attribute \"" + attr.name + "\" has " +
            typeof(attr.value) + " value but expected " + KNOWN_ATTRIBUTES[attr.name] + ".",
            attr.location
          );
        }
      }
    }
  });

  check(ast);
}

module.exports = reportUnknownAttributes;
