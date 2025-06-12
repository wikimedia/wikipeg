/* global describe, expect, it, PEG */

"use strict";

describe("compiler pass |analyzeAlwaysMatch|", function() {
  var pass = PEG.compiler.passes.transform.analyzeAlwaysMatch;

  describe("provides analysis results in |alwaysMatch|", function() {
    it("is true for optional expressions", function() {
      expect(pass).toChangeAST(
        [
          'start = abc',
          'abc = "a" simple "c"',
          'simple = [b]?'
        ].join("\n"),
        { allowedStartRules: ["start"] },
        {
          type : 'grammar',
          rules : [
            {
              type : 'rule',
              name : 'start',
              alwaysMatch : false,
            },
            {
              type : 'rule',
              name : 'abc',
              alwaysMatch: false,
              expression: {
                type: 'sequence',
                alwaysMatch: false,
                elements: [
                  { alwaysMatch: false },
                  { alwaysMatch: true },
                  { alwaysMatch: false },
                ]
              }
            },
            {
              type : 'rule',
              name : 'simple',
              alwaysMatch: true,
            }
          ],
        }
      );
    });
    it("is true for zero-or-more expressions", function() {
      expect(pass).toChangeAST(
        [
          'start = abc',
          'abc = "a" simple "c"',
          'simple = [b]*'
        ].join("\n"),
        { allowedStartRules: ["start"] },
        {
          type : 'grammar',
          rules : [
            {
              type : 'rule',
              name : 'start',
              alwaysMatch : false,
            },
            {
              type : 'rule',
              name : 'abc',
              alwaysMatch: false,
              expression: {
                type: 'sequence',
                alwaysMatch: false,
                elements: [
                  { alwaysMatch: false },
                  { alwaysMatch: true },
                  { alwaysMatch: false },
                ]
              }
            },
            {
              type : 'rule',
              name : 'simple',
              alwaysMatch: true,
            }
          ],
        }
      );
    });
    it("is true for empty literals", function() {
      expect(pass).toChangeAST(
        [
          'start = abc',
          'abc = "a" simple "c"',
          'simple = ""'
        ].join("\n"),
        { allowedStartRules: ["start"] },
        {
          type : 'grammar',
          rules : [
            {
              type : 'rule',
              name : 'start',
              alwaysMatch : false,
            },
            {
              type : 'rule',
              name : 'abc',
              alwaysMatch: false,
              expression: {
                type: 'sequence',
                alwaysMatch: false,
                elements: [
                  { alwaysMatch: false },
                  { alwaysMatch: true },
                  { alwaysMatch: false },
                ]
              }
            },
            {
              type : 'rule',
              name : 'simple',
              alwaysMatch: true,
            }
          ],
        }
      );
    });
    it("is true for a choice with an alwaysMatch clause", function() {
      expect(pass).toChangeAST(
        [
          'start = abc',
          'abc = "a" / simple',
          'simple = [b]*'
        ].join("\n"),
        { allowedStartRules: ["start"] },
        {
          type : 'grammar',
          rules : [
            {
              type : 'rule',
              name : 'start',
              alwaysMatch : true,
            },
            {
              type : 'rule',
              name : 'abc',
              alwaysMatch: true,
              expression: {
                type: 'choice',
              }
            },
            {
              type : 'rule',
              name : 'simple',
              alwaysMatch: true,
            }
          ],
        }
      );
    });
  });
  describe("error reporting", function() {
    it("reports an unreachable choice", function() {
      expect(pass).toReportError(
        [
          'start = abc',
          'abc = "a" / simple / "c"',
          'simple = [b]*'
        ].join("\n"),
        { allowedStartRules: ["start"] },
        {
          'message': 'Unreachable alternative.',
        }
      );
    });
  });
});
