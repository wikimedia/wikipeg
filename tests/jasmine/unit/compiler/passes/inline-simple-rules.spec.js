/* global describe, expect, it, PEG */

"use strict";

describe("compiler pass |inlineSimpleRules|", function() {
  var pass = PEG.compiler.passes.transform.inlineSimpleRules;

  describe("when a simple rule isn't listed in |allowedStartRules|", function() {
    it("updates references and removes it (class)", function() {
      expect(pass).toChangeAST(
        [
          'start = abc',
          'abc = "a" simple* "c"',
          'simple = [b]'
        ].join("\n"),
        { allowedStartRules: ["start"] },
        {
          rules: [
            {
              name:       "start",
              expression: { type: "rule_ref", name: "abc" }
            },
            {
              name: "abc",
              expression: {
                type: "sequence",
                elements: [
                  { type: "literal", value: "a" },
                  {
                    type: "zero_or_more",
                    expression: { type: "class", parts: [ "b" ] },
                  },
                  { type: "literal", value: "c" },
                ]
              }
            }
          ]
        }
      );
    });

    it("updates references and removes it (repeated class)", function() {
      expect(pass).toChangeAST(
        [
          'start = abc',
          'abc = "a" simple "c"',
          'simple = [b]*'
        ].join("\n"),
        { allowedStartRules: ["start"] },
        {
          rules: [
            {
              name:       "start",
              expression: { type: "rule_ref", name: "abc" }
            },
            {
              name: "abc",
              expression: {
                type: "sequence",
                elements: [
                  { type: "literal", value: "a" },
                  {
                    type: "zero_or_more",
                    expression: { type: "class", parts: [ "b" ] },
                  },
                  { type: "literal", value: "c" },
                ]
              }
            }
          ]
        }
      );
    });

    it("updates references and removes it (text repeated class)", function() {
      expect(pass).toChangeAST(
        [
          'start = abc',
          'abc = "a" simple "c"',
          'simple = $[b]*'
        ].join("\n"),
        { allowedStartRules: ["start"] },
        {
          rules: [
            {
              name:       "start",
              expression: { type: "rule_ref", name: "abc" }
            },
            {
              name: "abc",
              expression: {
                type: "sequence",
                elements: [
                  { type: "literal", value: "a" },
                  {
                    type: "text",
                    expression: {
                      type: "zero_or_more",
                      expression: { type: "class", parts: [ "b" ] },
                    }
                  },
                  { type: "literal", value: "c" },
                ]
              }
            }
          ]
        }
      );
    });

    it("should leave it alone if it has parameters", function() {
      expect(pass).toChangeAST(
        [
          'start = abc',
          'abc = "a" simple<param> "c"',
          'simple = ""'
        ].join("\n"),
        { allowedStartRules: ["start"] },
        {
          rules: [
            {
              name:       "start",
              expression: { type: "rule_ref", name: "abc" }
            },
            {
              name: "abc",
              expression: {
                type: "sequence",
                elements: [
                  { type: "literal", value: "a" },
                  { type: "rule_ref", name: "simple" },
                  { type: "literal", value: "c" },
                ]
              }
            },
            { name: "simple" }
          ]
        }
      );
    });
  });

  describe("when a simple rule is listed in |allowedStartRules|", function() {
    it("updates references but doesn't remove it", function() {
      expect(pass).toChangeAST(
        [
          'start = abc',
          'abc = "a" simple* "c"',
          'simple = [b]'
        ].join("\n"),
        { allowedStartRules: ["start", "simple"] },
        {
          rules: [
            {
              name:       "start",
              expression: { type: "rule_ref", name: "abc" }
            },
            {
              name: "abc",
              expression: {
                type: "sequence",
                elements: [
                  { type: "literal", value: "a" },
                  {
                    type: "zero_or_more",
                    expression: { type: "class", parts: [ "b" ] },
                  },
                  { type: "literal", value: "c" },
                ]
              }
            },
            { name: "simple" }
          ]
        }
      );
    });
  });

});
