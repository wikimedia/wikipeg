/* global describe, expect, it, PEG */

"use strict";

describe("compiler pass |analyzeFirst|", function() {
  var pass = PEG.compiler.passes.transform.analyzeFirst;

  describe("provides analysis results in |nullable| and |firstSet|", function() {
    it("basic operation", function() {
      expect(pass).toChangeAST(
        [
          'start = abc',
          'abc = "ab" / optional "cd"',
          'optional = [xyz]?'
        ].join("\n"),
        { allowedStartRules: ["start"], optimizeFirstSet: 'analyze' },
        {
          type : 'grammar',
          rules : [
            {
              type : 'rule',
              name : 'start',
              nullable: false,
              firstSet: {
                type: "class",
                parts: [ 'a', 'c', ['x', 'z'] ],
                inverted: false,
                ignoreCase: false,
              }
            },
            {
              type : 'rule',
              name : 'abc',
              nullable: false,
              firstSet: {
                type: "class",
                parts: [ 'a', 'c', ['x', 'z'] ],
                inverted: false,
                ignoreCase: false,
              }
            },
            {
              type : 'rule',
              name : 'optional',
              nullable: true,
              firstSet: {
                type: "class",
                parts: [ ['x', 'z'] ],
                inverted: false,
                ignoreCase: false,
              }
            }
          ],
        }
      );
    });
    it("merging overlapping ranges", function() {
      expect(pass).toChangeAST(
        [
          'start = [b-ex-z] / [a-cd-fw-y]',
        ].join("\n"),
        { allowedStartRules: ["start"], optimizeFirstSet: 'analyze' },
        {
          type : 'grammar',
          rules : [
            {
              type : 'rule',
              name : 'start',
              nullable: false,
              firstSet: {
                type: "class",
                parts: [ ['a', 'f'], ['w', 'z'] ],
                inverted: false,
                ignoreCase: false,
              }
            },
          ],
        }
      );
    });
    it("case-insensitive ranges", function() {
      expect(pass).toChangeAST(
        [
          'start = [b-ex-z]i / [a-cd-fw-y]',
        ].join("\n"),
        { allowedStartRules: ["start"], optimizeFirstSet: 'analyze' },
        {
          type : 'grammar',
          rules : [
            {
              type : 'rule',
              name : 'start',
              nullable: false,
              firstSet: {
                type: "class",
                parts: [ ['B', 'E'], ['X','Z'], ['a', 'f'], ['w', 'z'] ],
                inverted: false,
                ignoreCase: false,
              }
            },
          ],
        }
      );
    });
    it("inverted ranges", function() {
      expect(pass).toChangeAST(
        [
          'start = [b-ex-z] / [^a-ce-gw-y]',
        ].join("\n"),
        { allowedStartRules: ["start"], optimizeFirstSet: 'analyze' },
        {
          type : 'grammar',
          rules : [
            {
              type : 'rule',
              name : 'start',
              nullable: false,
              firstSet: {
                type: "class",
                parts: [ 'a', [ 'f', 'g'], 'w' ],
                inverted: true,
                ignoreCase: false,
              }
            },
          ],
        }
      );
    });
    it("intersection of simple_and expressions", function() {
      expect(pass).toChangeAST(
        [
          'start = "a"? &[c-ex-z] "y"* [a-d]',
        ].join("\n"),
        { allowedStartRules: ["start"], optimizeFirstSet: 'analyze' },
        {
          type : 'grammar',
          rules : [
            {
              type : 'rule',
              name : 'start',
              nullable: false,
              firstSet: {
                type: "class",
                parts: [ 'a', [ 'c', 'd'], 'y' ],
                inverted: false,
                ignoreCase: false,
              }
            },
          ],
        }
      );
    });
  });
  describe("optimizes rule definitions", function() {
    it("basic operation", function() {
      expect(pass).toChangeAST(
        [
          'start = abc',
          'abc = "ab" / optional "cd"',
          'optional = [xyz]?'
        ].join("\n"),
        { allowedStartRules: ["start"], optimizeFirstSet: 'def' },
        {
          type : 'grammar',
          rules : [
            {
              type : 'rule',
              name : 'start',
              expression: {
                type: 'sequence',
                elements: [
                  {
                    type: 'simple_and',
                    // this is the firstSet
                    expression: {
                      type: "class",
                      parts: [ 'a', 'c', ['x', 'z'] ],
                      inverted: false,
                      ignoreCase: false,
                    },
                  },
                  {
                    type: 'rule_ref',
                    name: 'abc',
                  }
                ],
                returnLast: true,
              },
            },
            {
              type : 'rule',
              name : 'abc',
              expression: {
                type: 'sequence',
                elements: [
                  {
                    type: 'simple_and',
                    // this is the firstSet
                    expression: {
                      type: "class",
                      parts: [ 'a', 'c', ['x', 'z'] ],
                      inverted: false,
                      ignoreCase: false,
                    },
                  },
                  {
                    type: 'choice',
                  }
                ],
                returnLast: true,
              },
            },
            {
              type : 'rule',
              name : 'optional',
              expression: {
                // No optimization here, since this rule is nullable.
                type: 'optional',
              },
              nullable: true,
            }
          ],
        }
      );
    });
  });
  describe("optimizes rule references", function() {
    it("basic operation", function() {
      expect(pass).toChangeAST(
        [
          'start = abc',
          'abc = "ab" / optional? "cd"',
          'optional = [xyz]'
        ].join("\n"),
        { allowedStartRules: ["start"], optimizeFirstSet: 'call' },
        {
          type : 'grammar',
          rules : [
            {
              type : 'rule',
              name : 'start',
              expression: {
                type: 'sequence',
                elements: [
                  {
                    type: 'simple_and',
                    // this is the firstSet of 'abc'
                    expression: {
                      type: "class",
                      parts: [ 'a', 'c', ['x', 'z'] ],
                      inverted: false,
                      ignoreCase: false,
                    },
                  },
                  {
                    type: 'rule_ref',
                    name: 'abc',
                  }
                ],
                returnLast: true,
              },
            },
            {
              type : 'rule',
              name : 'abc',
              expression: {
                type: 'choice',
                alternatives: [
                  {
                    type: 'literal',
                    value: 'ab',
                  },
                  {
                    type: 'sequence',
                    elements: [
                      {
                        type: 'optional',
                        expression: {
                          type: 'sequence',
                          elements: [
                            {
                              type: 'simple_and',
                              // this is the firstSet of 'optional'
                              expression: {
                                type: "class",
                                parts: [ ['x', 'z'] ],
                                inverted: false,
                                ignoreCase: false,
                              },
                            },
                            {
                              type: 'rule_ref',
                              name: 'optional',
                            },
                          ],
                          returnLast: true,
                        },
                      },
                      {
                        type: 'literal',
                        value: 'cd',
                      },
                    ],
                  },
                ],
              },
            },
            {
              type : 'rule',
              name : 'optional',
              expression: {
                // no rule references => no optimization
                type: 'class',
              }
            },
          ],
        }
      );
    });
  });
});
