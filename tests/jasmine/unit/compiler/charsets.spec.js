/* global describe, expect, it, beforeEach */

"use strict";

const classNode = require("../../../../lib/compiler/charsets").classNode;

// Ensure tests have a consistent setting for `caseless restrict`.
beforeEach(() => classNode.setCaselessRestrict(false));

describe("charsets.classNode", function() {

  function build(props) {
    return Object.assign({
      type: "class",
      parts: [],
      inverted: false,
      ignoreCase: false,
    }, props);
  }

  describe(".any", function() {
    it("has no parts", function() {
      expect(classNode.any()).toHaveInvertedParts([]);
    });
  });

  describe(".isAny", function() {
    it("matches .any()", function() {
      expect(classNode.isAny(classNode.any())).toBe(true);
    });
    it("doesn't match .empty()", function() {
      expect(classNode.isAny(classNode.empty())).toBe(false);
    });
  });

  describe(".empty", function() {
    it("has no parts", function() {
      expect(classNode.empty()).toHaveParts([]);
    });
  });

  describe(".isEmpty", function() {
    it("doesn't match .any()", function() {
      expect(classNode.isEmpty(classNode.any())).toBe(false);
    });
    it("matches .empty()", function() {
      expect(classNode.isEmpty(classNode.empty())).toBe(true);
    });
  });

  // As per
  // https://tc39.es/ecma262/multipage/text-processing.html#sec-runtime-semantics-canonicalize-ch
  // /[a-z]/ui should match U+212A KELVIN SIGN and
  // U+017F LATIN SMALL LETTER LONG S
  describe(".caseSensitive", function() {
    it("handles simple ranges like [a-c]", function() {
      expect(classNode.caseSensitive(build({
        parts: [["a","c"]],
        ignoreCase: true,
      }))).toHaveParts([ ["A","C"], ["a","c"] ]);
    });
    it("handles ranges with mismatched case like [Y-b]", function() {
      expect(classNode.caseSensitive(build({
        parts: [["Y","b"]],
        ignoreCase: true,
      }))).toHaveParts([  [ 'A', 'B' ], [ 'Y', 'b' ], [ 'y', 'z' ] ]);
    });
    it("[k]i includes KELVIN SIGN", function() {
      expect(classNode.caseSensitive(build({
        parts: ["k"],
        ignoreCase: true,
      }))).toHaveParts([ "K", "k", "\u212A" ]);
    });
    it("[s]i includes LATIN SMALL LETTER LONG S", function() {
      expect(classNode.caseSensitive(build({
        parts: ["s"],
        ignoreCase: true,
      }))).toHaveParts([ "S", "s", "\u017F" ]);
    });
    it("[0-9a-f]i is still the normal thing", function() {
      expect(classNode.caseSensitive(build({
        parts: [["0","9"],["a","f"]],
        ignoreCase: true,
      }))).toHaveParts([[ '0', '9' ], [ 'A', 'F' ], [ 'a', 'f' ] ]);
    });
    it("Non-ascii matching can be suppressed", function() {
      classNode.setCaselessRestrict(true);
      expect(classNode.caseSensitive(build({
        parts: [["a","z"]],
        ignoreCase: true,
      }))).toHaveParts([[ 'A', 'Z' ], [ 'a', 'z' ] ]);
    });
  });

  describe(".union", function() {
    it("handles non-overlapping ranges", function() {
      expect(classNode.union(
        build({ parts: [["A","C"]] }),
        build({ parts: [["X","Z"]] })
      )).toHaveParts([["A","C"],["X","Z"]]);
    });
    it("handles overlapping ranges", function() {
      expect(classNode.union(
        build({ parts: [["A","C"]] }),
        build({ parts: [["B","D"]] })
      )).toHaveParts([["A","D"]]);
    });
    it("handles non-overlapping inverted ranges", function() {
      expect(classNode.union(
        build({ parts: [["A","C"]], inverted: true }),
        build({ parts: [["X","Z"]], inverted: true })
      )).toHaveInvertedParts([]);
    });
    it("handles overlapping inverted ranges", function() {
      expect(classNode.union(
        build({ parts: [["A","C"]], inverted: true }),
        build({ parts: [["B","D"]], inverted: true })
      )).toHaveInvertedParts([["B","C"]]);
    });
    it("handles mixed inverted and uninverted ranges (1)", function() {
      expect(classNode.union(
        build({ parts: [["A","C"]], inverted: true }),
        build({ parts: [["B","D"]], inverted: false })
      )).toHaveInvertedParts(["A"]);
    });
    it("handles mixed inverted and uninverted ranges (2)", function() {
      expect(classNode.union(
        build({ parts: [["B","D"]], inverted: false }),
        build({ parts: [["A","C"]], inverted: true })
      )).toHaveInvertedParts(["A"]);
    });
    it("handles case-insensitive classes", function() {
      expect(classNode.union(
        build({ parts: ["S"], ignoreCase: true }),
        build({ parts: ["k"], ignoreCase: true })
      )).toHaveParts(['K', 'S', 'k', 's', "\u017F", "\u212A"]);
    });
  });

  describe(".intersection", function() {
    it("handles non-overlapping ranges", function() {
      expect(classNode.intersection(
        build({ parts: [["A","C"]] }),
        build({ parts: [["X","Z"]] })
      )).toHaveParts([]);
    });
    it("handles overlapping ranges", function() {
      expect(classNode.intersection(
        build({ parts: [["A","C"]] }),
        build({ parts: [["B","D"]] })
      )).toHaveParts([["B","C"]]);
    });
    it("handles non-overlapping inverted ranges", function() {
      expect(classNode.intersection(
        build({ parts: [["A","C"]], inverted: true }),
        build({ parts: [["X","Z"]], inverted: true })
      )).toHaveInvertedParts([["A","C"],["X","Z"]]);
    });
    it("handles overlapping inverted ranges", function() {
      expect(classNode.intersection(
        build({ parts: [["A","C"]], inverted: true }),
        build({ parts: [["B","D"]], inverted: true })
      )).toHaveInvertedParts([["A","D"]]);
    });
    it("handles mixed inverted and uninverted ranges (1)", function() {
      expect(classNode.intersection(
        build({ parts: [["A","C"]], inverted: true }),
        build({ parts: [["B","D"]], inverted: false })
      )).toHaveParts(["D"]);
    });
    it("handles mixed inverted and uninverted ranges (2)", function() {
      expect(classNode.intersection(
        build({ parts: [["B","D"]], inverted: false }),
        build({ parts: [["A","C"]], inverted: true })
      )).toHaveParts(["D"]);
    });
    it("handles case-insensitive classes", function() {
      expect(classNode.intersection(
        build({ parts: [["a","z"]], ignoreCase: true }),
        build({ parts: ["k"], ignoreCase: true })
      )).toHaveParts(['K', 'k', "\u212A"]);
    });
  });
});
