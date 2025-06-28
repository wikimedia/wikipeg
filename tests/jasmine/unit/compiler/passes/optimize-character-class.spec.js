/* global describe, expect, it, PEG */

"use strict";

describe("compiler pass |optimizeCharacterClass|", function() {
  var pass = PEG.compiler.passes.transform.optimizeCharacterClass;

  describe("optimizes rules with choice of character classes", function() {
    it("simple choice", function() {
      expect(pass).toChangeAST(
        [
          'start = abc',
          'abc = [a-c] / [b-e]',
        ].join("\n"),
        { allowedStartRules: ["start"] },
        {
          type : 'grammar',
          rules : [
            {
              type : 'rule',
              name : 'start',
              expression: {
                type: 'rule_ref',
              },
            },
            {
              type : 'rule',
              name : 'abc',
              expression: {
                type: 'class',
                parts: [ ['a', 'e'] ],
                inverted: false,
                ignoreCase: false,
              },
            },
          ],
        }
      );
    });
    it("nested choice", function() {
      expect(pass).toChangeAST(
        [
          'start = abc',
          'abc = [a-c] / ("b" / "z")',
        ].join("\n"),
        { allowedStartRules: ["start"] },
        {
          type : 'grammar',
          rules : [
            {
              type : 'rule',
              name : 'start',
              expression: {
                type: 'rule_ref',
              },
            },
            {
              type : 'rule',
              name : 'abc',
              expression: {
                type: 'class',
                parts: [ ['a', 'c'], 'z' ],
                inverted: false,
                ignoreCase: false,
              },
            },
          ],
        }
      );
    });
    it("nested choice with inverted classes", function() {
      expect(pass).toChangeAST(
        [
          'start = abc',
          'abc = [^a-c] / ("b" / "z")',
        ].join("\n"),
        { allowedStartRules: ["start"] },
        {
          type : 'grammar',
          rules : [
            {
              type : 'rule',
              name : 'start',
              expression: {
                type: 'rule_ref',
              },
            },
            {
              type : 'rule',
              name : 'abc',
              expression: {
                type: 'class',
                parts: [ 'a', 'c' ],
                inverted: true,
                ignoreCase: false,
              },
            },
          ],
        }
      );
    });
  });
  describe("optimizes rules with negated character classes", function() {
    it("simple subtraction", function() {
      expect(pass).toChangeAST(
        [
          'start = abc',
          'abc = ![a-c] [b-e]',
        ].join("\n"),
        { allowedStartRules: ["start"] },
        {
          type : 'grammar',
          rules : [
            {
              type : 'rule',
              name : 'start',
              expression: {
                type: 'rule_ref',
              },
            },
            {
              type : 'rule',
              name : 'abc',
              expression: {
                type: 'sequence',
                elements: [
                  {
                    type: "simple_and",
                  },
                  {
                    type: 'class',
                    parts: [ ['d', 'e'] ],
                    inverted: false,
                    ignoreCase: false,
                  },
                ]
              },
            },
          ],
        }
      );
    });
    it("repeated subtraction", function() {
      expect(pass).toChangeAST(
        [
          'start = abc',
          'abc = ![a-c] !"e" [b-e]',
        ].join("\n"),
        { allowedStartRules: ["start"] },
        {
          type : 'grammar',
          rules : [
            {
              type : 'rule',
              name : 'start',
              expression: {
                type: 'rule_ref',
              },
            },
            {
              type : 'rule',
              name : 'abc',
              expression: {
                type: 'sequence',
                elements: [
                  {
                    type: "simple_and",
                  },
                  {
                    type: "simple_and",
                  },
                  {
                    type: 'class',
                    parts: [ 'd' ],
                    inverted: false,
                    ignoreCase: false,
                  },
                ]
              },
            },
          ],
        }
      );
    });
    it("eliminate unnecessary nodes if picked", function() {
      expect(pass).toChangeAST(
        [
          'start = abc',
          'abc = (![a-c] !"e" @[b-e])+',
        ].join("\n"),
        { allowedStartRules: ["start"] },
        {
          type : 'grammar',
          rules : [
            {
              type : 'rule',
              name : 'start',
              expression: {
                type: 'rule_ref',
              },
            },
            {
              type : 'rule',
              name : 'abc',
              expression: {
                type: 'one_or_more',
                expression: {
                  type: 'class',
                  parts: [ 'd' ],
                  inverted: false,
                  ignoreCase: false,
                },
              },
            },
          ],
        }
      );
    });
  });
});
