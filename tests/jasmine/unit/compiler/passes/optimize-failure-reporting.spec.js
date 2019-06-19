/* global describe, expect, it, PEG */

"use strict";

describe("compiler pass |optimizeFailureReporting|", function() {
  var pass = PEG.compiler.passes.transform.optimizeFailureReporting;

  describe("provides analysis results in |reportsFailure|", function() {
    it("is true for start rules", function() {
      expect(pass).toChangeAST(
        [
          'start = abc',
          'abc = "a" &simple "c"',
          'simple = [bc]'
        ].join("\n"),
        { allowedStartRules: ["start"] },
        {
          type : 'grammar',
          rules : [
            {
              type : 'rule',
              name : 'start',
              reportsFailure : true
            },
            {
              type : 'rule',
              name : 'abc',
            },
            {
              type : 'rule',
              name : 'simple',
            }
          ],
        }
      );
    });
    it("is false for rules only invoked via assertion", function() {
      expect(pass).toChangeAST(
        [
          'start = abc',
          'abc = "a" &simple "c"',
          'simple = [bc]'
        ].join("\n"),
        { allowedStartRules: ["start"] },
        {
          type : 'grammar',
          rules : [
            {
              type : 'rule',
              name : 'start',
            },
            {
              type : 'rule',
              name : 'abc',
            },
            {
              type : 'rule',
              name : 'simple',
              reportsFailure : false
            }
          ],
        }
      );
    });
    it("is true for rules invoked by a rule which reports failure (1)", function() {
      expect(pass).toChangeAST(
        [
          'start = abc',
          'abc = "a" &simple "c"',
          'simple = [bc]'
        ].join("\n"),
        { allowedStartRules: ["start"] },
        {
          type : 'grammar',
          rules : [
            {
              type : 'rule',
              name : 'start',
            },
            {
              type : 'rule',
              name : 'abc',
              reportsFailure : true
            },
            {
              type : 'rule',
              name : 'simple',
            }
          ],
        }
      );
    });
    it("is true for rules invoked by a rule which reports failure (2)", function() {
      expect(pass).toChangeAST(
        [
          'start = abc simple',
          'abc = "a" &simple "c"',
          'simple = [bc]'
        ].join("\n"),
        { allowedStartRules: ["start"] },
        {
          type : 'grammar',
          rules : [
            {
              type : 'rule',
              name : 'start',
            },
            {
              type : 'rule',
              name : 'abc',
              reportsFailure : true
            },
            {
              type : 'rule',
              name : 'simple',
              reportsFailure : true
            }
          ],
        }
      );
    });
    it("is false for rules invoked only by named rules", function() {
      expect(pass).toChangeAST(
        [
          'start = abc',
          'abc "named" = "a" simple "c"',
          'simple = [bc]'
        ].join("\n"),
        { allowedStartRules: ["start"] },
        {
          type : 'grammar',
          rules : [
            {
              type : 'rule',
              name : 'start',
              reportsFailure : true
            },
            {
              type : 'rule',
              name : 'abc',
              reportsFailure : true,
            },
            {
              type : 'rule',
              name : 'simple',
              reportsFailure : false
            }
          ],
        }
      );
    });
  });
});
