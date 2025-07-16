/* global describe, expect, it, PEG, spyOn */

"use strict";

describe("generated parser API", function() {
  describe("parse", function() {
    it("parses input", function() {
      var parser = PEG.buildParser('start = "a"');

      expect(parser.parse("a")).toBe("a");
    });

    it("throws an exception on syntax error", function() {
      var parser = PEG.buildParser('start = "a"');

      expect(function() { parser.parse("b"); }).toThrow();
    });

    describe("start rule", function() {
      var parser = PEG.buildParser([
            'a = "x" { return "a"; }',
            'b = "x" { return "b"; }',
            'c = "x" { return "c"; }'
          ].join("\n"), { allowedStartRules: ["b", "c"] });

      describe("when |startRule| is not set", function() {
        it("starts parsing from the first allowed rule", function() {
          expect(parser.parse("x")).toBe("b");
        });
      });

      describe("when |startRule| is set to an allowed rule", function() {
        it("starts parsing from specified rule", function() {
          expect(parser.parse("x", { startRule: "b" })).toBe("b");
          expect(parser.parse("x", { startRule: "c" })).toBe("c");
        });
      });

      describe("when |startRule| is set to a disallowed start rule", function() {
        it("throws an exception", function() {
          expect(
            function() { parser.parse("x", { startRule: "a" }); }
          ).toThrow();
        });
      });
    });

    describe("tracing", function() {
      var parser = PEG.buildParser([
            'Start = Alpha / OptionalAlpha Beta',
            'Alpha = "a"',
            'Beta = "b"',
            'OptionalAlpha = Alpha?',
      ].join("\n"), { trace: true, noInlining: true, noOptimizeFirstSet: true });

      describe("default tracer", function() {
        it("traces using console.log", function() {
          spyOn(console, "log");

          parser.parse("b");

          expect(console.log).toHaveBeenCalledWith("1:1-1:1             rule.enter Start");
          expect(console.log).toHaveBeenCalledWith("1:1-1:1             rule.enter   Alpha");
          expect(console.log).toHaveBeenCalledWith("1:1-1:1             rule.fail    Alpha");
          expect(console.log).toHaveBeenCalledWith("1:1-1:1             rule.enter   OptionalAlpha");
          expect(console.log).toHaveBeenCalledWith("1:1-1:1             rule.fail      Alpha");
          expect(console.log).toHaveBeenCalledWith("1:1-1:1             rule.match   OptionalAlpha");
          expect(console.log).toHaveBeenCalledWith("1:1-1:1             rule.enter   Beta");
          expect(console.log).toHaveBeenCalledWith("1:1-1:2             rule.match   Beta");
          expect(console.log).toHaveBeenCalledWith("1:1-1:2             rule.match Start");
        });
      });

      describe("custom tracers", function() {
        describe("trace", function() {
          it("receives tracing events", function() {
            var tracer = { trace: function() { } };

            spyOn(tracer, "trace");

            parser.parse("b", { tracer: tracer });

            expect(tracer.trace).toHaveBeenCalledWith({
              type:     'rule.enter',
              rule:     'Start',
              location: {
                start: { offset: 0, line: 1, column: 1 },
                end:   { offset: 0, line: 1, column: 1 }
              },
              args: { silence: false }
            });
            expect(tracer.trace).toHaveBeenCalledWith({
              type:     'rule.enter',
              rule:     'Alpha',
              location: {
                start: { offset: 0, line: 1, column: 1 },
                end:   { offset: 0, line: 1, column: 1 }
              },
              args: { silence: false }
            });
            expect(tracer.trace).toHaveBeenCalledWith({
              type:     'rule.fail',
              rule:     'Alpha',
              location: {
                start: { offset: 0, line: 1, column: 1 },
                end:   { offset: 0, line: 1, column: 1 }
              }
            });
            expect(tracer.trace).toHaveBeenCalledWith({
              type:     'rule.enter',
              rule:     'OptionalAlpha',
              location: {
                start: { offset: 0, line: 1, column: 1 },
                end:   { offset: 0, line: 1, column: 1 }
              },
              args: { silence: false }
            });
            expect(tracer.trace).toHaveBeenCalledWith({
              type:     'rule.enter',
              rule:     'Alpha',
              location: {
                start: { offset: 0, line: 1, column: 1 },
                end:   { offset: 0, line: 1, column: 1 }
              },
              args: { silence: false }
            });
            expect(tracer.trace).toHaveBeenCalledWith({
              type:     'rule.fail',
              rule:     'Alpha',
              location: {
                start: { offset: 0, line: 1, column: 1 },
                end:   { offset: 0, line: 1, column: 1 }
              }
            });
            expect(tracer.trace).toHaveBeenCalledWith({
              type:     'rule.match',
              rule:     'OptionalAlpha',
              result:   null,
              location: {
                start: { offset: 0, line: 1, column: 1 },
                end:   { offset: 0, line: 1, column: 1 }
              }
            });
            expect(tracer.trace).toHaveBeenCalledWith({
              type:     'rule.enter',
              rule:     'Beta',
              location: {
                start: { offset: 0, line: 1, column: 1 },
                end:   { offset: 0, line: 1, column: 1 }
              },
              args: { silence: false }
            });
            expect(tracer.trace).toHaveBeenCalledWith({
              type:     'rule.match',
              rule:     'Beta',
              result:   'b',
              location: {
                start: { offset: 0, line: 1, column: 1 },
                end:   { offset: 1, line: 1, column: 2 }
              }
            });
            expect(tracer.trace).toHaveBeenCalledWith({
              type:     'rule.match',
              rule:     'Start',
              result:   [null, 'b'],
              location: {
                start: { offset: 0, line: 1, column: 1 },
                end:   { offset: 1, line: 1, column: 2 }
              }
            });
          });
        });
      });
    });

    it("accepts custom options", function() {
      var parser = PEG.buildParser('start = "a"');

      parser.parse("a", { foo: 42 });
    });
  });
});
