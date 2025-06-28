"use strict";
/*eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */

var visitor        = require("../visitor"),
    classNode      = require("../charsets").classNode,
    objects        = require("../../utils/objects");

// Optimize character classes:
//   [...] / [...] => union
//  ![...] [...] => subtraction

function optimizeCharacterClass(ast, options) {
  options = options || {};

  if (options.noOptimizeCharacterClass) {
    return;
  }

  function isSingleChar(node) {
    return node.type === 'class' ||
      node.type === 'any' ||
      (node.type === 'literal' && node.value.length === 1);
  }

  function toDesc(node) {
    if (node.type === 'class') {
      return node.rawText;
    } else if (node.type === 'any') {
      return ".";
    } else if (node.type === 'literal') {
      return "\"" + node.value + "\"";
    } else {
      throw new Error("unreachable");
    }
  }

  function toList(arr) {
    return (arr.length > 1) ?
      (arr.slice(0, -1).join(", ") + " or " + arr[arr.length - 1]) :
      arr[0];
  }

  function toCharset(node) {
    if (node.type === 'class') {
      return classNode.sort(objects.clone(node));
    } else if (node.type === 'any') {
      return classNode.any();
    } else if (node.type === 'literal') {
      return classNode.sort({
        type: "class",
        parts: [node.value],
        inverted: false,
        ignoreCase: node.ignoreCase,
      });
    }
    throw new Error('unreachable');
  }

  const checkCharacterClass = visitor.build({
    choice: function(node) {
      // First optimize children.
      node.alternatives.forEach((alt) => checkCharacterClass(alt));
      // Check for [...] / [... ]
      if (node.alternatives.every((alt) => isSingleChar(alt))) {
        let newClass = node.alternatives.reduce(
          (acc, alt) => classNode.union(acc, toCharset(alt)),
          classNode.empty()
        );
        let newDesc = toList(node.alternatives.map((alt) => toDesc(alt)));
        // Remove all properties of node
        Object.keys(node).forEach((name) => {
          if (name !== 'location' && name !== 'picked') {
            delete node[name];
          }
        });
        // Create a new class
        Object.assign(node, newClass);
        node.rawText = newDesc;
        return;
      }
    },
    sequence: function(node) {
      // First optimize children.
      node.elements.forEach((el) => checkCharacterClass(el));
      // Check for ![...] [...]
      let removed = 0;
      for (let i = node.elements.length - 2; i >= 0; i--) {
        let next = i + 1;
        while (node.elements[next].optimizeCharClass) {
          // Skip over synthetic nodes previously added.
          next++;
        }
        if (node.elements[i].type === 'simple_not' &&
            !node.elements[i].picked &&
            isSingleChar(node.elements[i].expression) &&
            isSingleChar(node.elements[next])) {
          let newClass = classNode.subtract(
            toCharset(node.elements[next]),
            toCharset(node.elements[i].expression)
          );
          let newDesc =
              toDesc(node.elements[next]) + ' but not ' + toDesc(node.elements[i].expression);
          let newPicked = node.elements[next].picked;
          // create a trivial node just to ensure the same # of elements
          // in the sequence.
          let newTest = {
            type: 'simple_and',
            location: node.elements[i].location,
            expression: {
              type: 'literal',
              value: '',
              location: node.elements[i].location,
            },
            optimizeCharClass: true, // mark synthetic node
          };
          let newChar = Object.assign({
            location: node.elements[next].location,
            rawText: newDesc,
            picked: newPicked,
          }, newClass);
          node.elements[i] = newTest;
          node.elements[next] = newChar;
          removed++;
        }
      }
      // optimize sequence if picked to allow repeated char class
      let last = node.elements[node.elements.length - 1];
      if (node.elements.length === (removed + 1) && last.picked) {
        // Remove all properties of node.
        Object.keys(node).forEach((name) => {
          if (name !== 'location' && name !== 'picked') {
            delete node[name];
          }
        });
        // Create a new class
        delete last.picked;
        delete last.location;
        Object.assign(node, last);
        return;
      }
    },
  });

  checkCharacterClass(ast);
}

module.exports = optimizeCharacterClass;
