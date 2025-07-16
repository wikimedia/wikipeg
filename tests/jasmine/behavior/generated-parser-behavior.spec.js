/* global beforeEach, describe, expect, it, jasmine, PEG */

"use strict";

describe("generated parser behavior", function() {
  function varyOptimizationOptions(block) {
    function clone(object) {
      var result = {}, key;

      for (key in object) {
        if (object.hasOwnProperty(key)) {
          result[key] = object[key];
        }
      }

      result.noOptimizeFirstSet = true;
      return result;
    }

    var optionsVariants = [
          { cache: false },
          { cache: true },
        ],
        i;

    for (i = 0; i < optionsVariants.length; i++) {
      describe(
        "with options " + jasmine.pp(optionsVariants[i]),
        function() { block(clone(optionsVariants[i])); }
      );
    }
  }

  beforeEach(function() {
    this.addMatchers({
      toParse: function(input) {
        var options  = arguments.length > 2 ? arguments[1] : {},
            expected = arguments[arguments.length - 1],
            result;

        try {
          result = this.actual.parse(input, options);

          if (arguments.length > 1) {
            this.message = function() {
              return "Expected " + jasmine.pp(input) + " "
                   + "with options " + jasmine.pp(options) + " "
                   + (this.isNot ? "not " : "")
                   + "to parse as " + jasmine.pp(expected) + ", "
                   + "but it parsed as " + jasmine.pp(result) + ".";
            };

            return this.env.equals_(result, expected);
          } else {
            return true;
          }
        } catch (e) {
          this.message = function() {
            return "Expected " + jasmine.pp(input) + " "
                 + "with options " + jasmine.pp(options) + " "
                 + "to parse" + (arguments.length > 1 ? " as " + jasmine.pp(expected) : "") + ", "
                 + "but it failed to parse with message "
                 + jasmine.pp(e.message) + ".";
          };

          return false;
        }
      },

      toFailToParse: function(input) {
        var options = arguments.length > 2 ? arguments[1] : {},
            details = arguments.length > 1
                        ? arguments[arguments.length - 1]
                        : undefined,
            result;

        try {
          result = this.actual.parse(input, options);

          this.message = function() {
            return "Expected " + jasmine.pp(input) + " "
                 + "with options " + jasmine.pp(options) + " "
                 + "to fail to parse"
                 + (details ? " with details " + jasmine.pp(details) : "") + ", "
                 + "but it parsed as " + jasmine.pp(result) + ".";
          };

          return false;
        } catch (e) {
          /*
           * Should be at the top level but then JSHint complains about bad for
           * in variable.
           */
          var key;

          if (this.isNot) {
            this.message = function() {
              return "Expected " + jasmine.pp(input)
                   + "with options " + jasmine.pp(options) + " "
                   + "to parse, "
                   + "but it failed with message "
                   + jasmine.pp(e.message) + ".";
            };
          } else {
            if (details) {
              for (key in details) {
                if (details.hasOwnProperty(key)) {
                  if (!this.env.equals_(e[key], details[key])) {
                    this.message = function() {
                      return "Expected " + jasmine.pp(input) + " "
                           + "with options " + jasmine.pp(options) + " "
                           + "to fail to parse"
                           + (details ? " with details " + jasmine.pp(details) : "") + ", "
                           + "but " + jasmine.pp(key) + " "
                           + "is " + jasmine.pp(e[key]) + ".";
                    };

                    return false;
                  }
                }
              }
            }
          }

          return true;
        }
      }
    });
  });

  varyOptimizationOptions(function(options) {
    describe("initializer", function() {
      it("executes the code before parsing starts", function() {
        var parser = PEG.buildParser([
              '{ var result = 42; }',
              'start = "a" { return result; }'
            ].join("\n"), options);

        expect(parser).toParse("a", 42);
      });

      describe("available variables and functions", function() {
        it("|parser| contains the parser object", function() {
          var parser = PEG.buildParser([
                '{ var result = parser; }',
                'start = "a" { return result; }'
              ].join("\n"), options);

          expect(parser).toParse("a", parser);
        });

        it("|options| contains options", function() {
          var parser = PEG.buildParser([
                '{ var result = options; }',
                'start = "a" { return result; }'
              ].join("\n"), options);

          expect(parser).toParse("a", { a: 42 }, { a: 42 });
        });
      });
    });

    describe("rule", function() {
      if (options.cache) {
        it("caches rule match results", function() {
          var parser = PEG.buildParser([
                '{ var n = 0; }',
                'start = (a "b") {return "b";} / (a "c") { return n; }',
                'a = "a" { n++; }'
              ].join("\n"), options);

          expect(parser).toParse("ac", 1);
        });
      } else {
        it("doesn't cache rule match results", function() {
          var parser = PEG.buildParser([
                '{ var n = 0; }',
                'start = (a "b") / (a "c") { return n; }',
                'a = "a" { n++; }'
              ].join("\n"), options);

          expect(parser).toParse("ac", 2);
        });
      }

      describe("when the expression matches", function() {
        it("returns its match result", function() {
          var parser = PEG.buildParser('start = "a"');

          expect(parser).toParse("a", "a");
        });
      });

      describe("when the expression doesn't match", function() {
        describe("without display name", function() {
          it("reports match failure and doesn't record any expectation", function() {
            var parser = PEG.buildParser('start = "a"');

            expect(parser).toFailToParse("b", {
              expected: [{ type: "literal", value: "a", description: '"a"' }]
            });
          });
        });

        describe("with display name", function() {
          it("reports match failure and records an expectation of type \"other\"", function() {
            var parser = PEG.buildParser('start "start" = "a"');

            expect(parser).toFailToParse("b", {
              expected: [{ type: "other", description: "start" }]
            });
          });

          it("discards any expectations recorded when matching the expression", function() {
            var parser = PEG.buildParser('start "start" = "a"');

            expect(parser).toFailToParse("b", {
              expected: [{ type: "other", description: "start" }]
            });
          });
        });
      });
    });

    describe("non-start rule", function() {

      describe("when the expression doesn't match", function() {
        describe("without display name", function() {
          it("reports match failure and records an expectation", function() {
            var parser = PEG.buildParser(
              'start = alpha "b";\n' +
              'alpha = a+;\n' +
              'a = "a";\n',
              { noOptimizeFirstSet: true }
            );

            expect(parser).toFailToParse("b", {
              expected: [{ type: "literal", value: "a", description: '"a"' }]
            });
          });
        });

        describe("with display name", function() {
          it("silences any expectations recorded when matching the expression", function() {
            var parser = PEG.buildParser(
              'start = alpha "b";\n' +
              'alpha "alpha" = a+;\n' +
              'a = "a";\n',
              { noOptimizeFirstSet: true }
            );

            expect(parser).toFailToParse("c", {
              expected: [{ type : 'other', description : 'alpha' }]
            });
          });
        });
      });
    });

    describe("positive semantic predicate", function() {
      describe("initializer variables & functions", function() {
        it("can access variables defined in the initializer", function() {
          var parser = PEG.buildParser([
                '{ var v = 42 }',
                'start = &{ return v === 42; }'
              ].join("\n"), options);

          expect(parser).toParse("");
        });

        it("can access functions defined in the initializer", function() {
          var parser = PEG.buildParser([
                '{ function f() { return 42; } }',
                'start = &{ return f() === 42; }'
              ].join("\n"), options);

          expect(parser).toParse("");
        });
      });

      describe("available variables & functions", function() {
        it("|parser| contains the parser object", function() {
          var parser = PEG.buildParser([
                '{ var result; }',
                'start = &{ result = parser; return true; } { return result; }'
              ].join("\n"), options);

          expect(parser).toParse("", parser);
        });

        it("|options| contains options", function() {
          var parser = PEG.buildParser([
                '{ var result; }',
                'start = &{ result = options; return true; } { return result; }'
              ].join("\n"), options);

          expect(parser).toParse("", { a: 42 }, { a: 42 });
        });

        it("|location| returns current location info", function() {
          var parser = PEG.buildParser([
                '{ var result; }',
                'start  = line (nl+ line)* { return result; }',
                'line   = thing (" "+ thing)*',
                'thing  = digit / mark',
                'digit  = [0-9]',
                'mark   = &{ result = location(); return true; } "x"',
                'nl     = [\\r"\\n\\u2028\\u2029]'
              ].join("\n"), options);

          expect(parser).toParse("1\n2\n\n3\n\n\n4 5 x", {
            start: { offset: 13, line: 7, column: 5 },
            end:   { offset: 13, line: 7, column: 5 },
          });

          /* Non-Unix newlines */
          expect(parser).toParse("1\rx", {     // Old Mac
            start: { offset: 2, line: 2, column: 1 },
            end:   { offset: 2, line: 2, column: 1 },
          });
          expect(parser).toParse("1\r\nx", {   // Windows
            start: { offset: 3, line: 2, column: 1 },
            end:   { offset: 3, line: 2, column: 1 },
          });
          expect(parser).toParse("1\n\rx", {   // mismatched
            start: { offset: 3, line: 3, column: 1 },
            end:   { offset: 3, line: 3, column: 1 },
          });

          /* Strange newlines */
          expect(parser).toParse("1\u2028x", {   // line separator
            start: { offset: 2, line: 2, column: 1 },
            end:   { offset: 2, line: 2, column: 1 },
          });
          expect(parser).toParse("1\u2029x", {   // paragraph separator
            start: { offset: 2, line: 2, column: 1 },
            end:   { offset: 2, line: 2, column: 1 },
          });
        });
      });
    });

    describe("negative semantic predicate", function() {
      describe("initializer variables & functions", function() {
        it("can access variables defined in the initializer", function() {
          var parser = PEG.buildParser([
                '{ var v = 42 }',
                'start = !{ return v !== 42; }'
              ].join("\n"), options);

          expect(parser).toParse("");
        });

        it("can access functions defined in the initializer", function() {
          var parser = PEG.buildParser([
                '{ function f() { return 42; } }',
                'start = !{ return f() !== 42; }'
              ].join("\n"), options);

          expect(parser).toParse("");
        });
      });

      describe("available variables & functions", function() {
        it("|parser| contains the parser object", function() {
          var parser = PEG.buildParser([
                '{ var result; }',
                'start = !{ result = parser; return false; } { return result; }'
              ].join("\n"), options);

          expect(parser).toParse("", parser);
        });

        it("|options| contains options", function() {
          var parser = PEG.buildParser([
                '{ var result; }',
                'start = !{ result = options; return false; } { return result; }'
              ].join("\n"), options);

          expect(parser).toParse("", { a: 42 }, { a: 42 });
        });

        it("|location| returns current location info", function() {
          var parser = PEG.buildParser([
                '{ var result; }',
                'start  = line (nl+ line)* { return result; }',
                'line   = thing (" "+ thing)*',
                'thing  = digit / mark',
                'digit  = [0-9]',
                'mark   = !{ result = location(); return false; } "x"',
                'nl     = [\\r"\\n\\u2028\\u2029]'
              ].join("\n"), options);

          expect(parser).toParse("1\n2\n\n3\n\n\n4 5 x", {
            start: { offset: 13, line: 7, column: 5 },
            end:   { offset: 13, line: 7, column: 5 },
          });

          /* Non-Unix newlines */
          expect(parser).toParse("1\rx", {     // Old Mac
            start: { offset: 2, line: 2, column: 1 },
            end:   { offset: 2, line: 2, column: 1 },
          });
          expect(parser).toParse("1\r\nx", {   // Windows
            start: { offset: 3, line: 2, column: 1 },
            end:   { offset: 3, line: 2, column: 1 },
          });
          expect(parser).toParse("1\n\rx", {   // mismatched
            start: { offset: 3, line: 3, column: 1 },
            end:   { offset: 3, line: 3, column: 1 },
          });

          /* Strange newlines */
          expect(parser).toParse("1\u2028x", {   // line separator
            start: { offset: 2, line: 2, column: 1 },
            end:   { offset: 2, line: 2, column: 1 },
          });
          expect(parser).toParse("1\u2029x", {   // paragraph separator
            start: { offset: 2, line: 2, column: 1 },
            end:   { offset: 2, line: 2, column: 1 },
          });
        });
      });
    });

    describe("action", function() {
        describe("initializer variables & functions", function() {
          it("can access variables defined in the initializer", function() {
            var parser = PEG.buildParser([
                  '{ var v = 42 }',
                  'start = "a" { return v; }'
                ].join("\n"), options);

            expect(parser).toParse("a", 42);
          });

          it("can access functions defined in the initializer", function() {
            var parser = PEG.buildParser([
                  '{ function f() { return 42; } }',
                  'start = "a" { return f(); }'
                ].join("\n"), options);

            expect(parser).toParse("a", 42);
          });
        });

        describe("available variables & functions", function() {
          it("|parser| contains the parser object", function() {
            var parser = PEG.buildParser(
                  'start = "a" { return parser; }',
                  options
                );

            expect(parser).toParse("a", parser);
          });

          it("|options| contains options", function() {
            var parser = PEG.buildParser(
                  'start = "a" { return options; }',
                  options
                );

            expect(parser).toParse("a", { a: 42 }, { a: 42 });
          });

          it("|text| returns text matched by the expression", function() {
            var parser = PEG.buildParser(
                  'start = "a" { return text(); }',
                  options
                );

            expect(parser).toParse("a", "a");
          });

          it("|location| returns location info of the expression", function() {
            var parser = PEG.buildParser([
                  '{ var result; }',
                  'start  = line (nl+ line)* { return result; }',
                  'line   = thing (" "+ thing)*',
                  'thing  = digit / mark',
                  'digit  = [0-9]',
                  'mark   = "x" { result = location(); }',
                  'nl     = [\\r\\n\\u2028\\u2029]'
                ].join("\n"), options);

            expect(parser).toParse("1\n2\n\n3\n\n\n4 5 x", {
              start: { offset: 13, line: 7, column: 5 },
              end:   { offset: 14, line: 7, column: 6 },
            });

            /* Non-Unix newlines */
            expect(parser).toParse("1\rx", {     // Old Mac
              start: { offset: 2, line: 2, column: 1 },
              end:   { offset: 3, line: 2, column: 2 },
            });
            expect(parser).toParse("1\r\nx", {   // Windows
              start: { offset: 3, line: 2, column: 1 },
              end:   { offset: 4, line: 2, column: 2 },
            });
            expect(parser).toParse("1\n\rx", {   // mismatched
              start: { offset: 3, line: 3, column: 1 },
              end:   { offset: 4, line: 3, column: 2 },
            });

            /* Strange newlines */
            expect(parser).toParse("1\u2028x", {   // line separator
              start: { offset: 2, line: 2, column: 1 },
              end:   { offset: 3, line: 2, column: 2 },
            });
            expect(parser).toParse("1\u2029x", {   // paragraph separator
              start: { offset: 2, line: 2, column: 1 },
              end:   { offset: 3, line: 2, column: 2 },
            });
          });

          it("|expected| terminates parsing and throws an exception", function() {
            var parser = PEG.buildParser(
                  'start = "a" { expected("a"); }',
                  options
                );

            expect(parser).toFailToParse("a", {
              message:  'Expected a but "a" found.',
              expected: [{ type: "other", description: "a" }],
              found:    "a",
              location: {
                start: { offset: 0, line: 1, column: 1 },
                end:   { offset: 1, line: 1, column: 2 }
              }
            });
          });

          it("|error| terminates parsing and throws an exception", function() {
            var parser = PEG.buildParser(
                  'start = "a" { error("a"); }',
                  options
                );

            expect(parser).toFailToParse("a", {
              message:  "a",
              expected: null,
              found:    "a",
              location: {
                start: { offset: 0, line: 1, column: 1 },
                end:   { offset: 1, line: 1, column: 2 }
              }
            });
          });
        });
      });

    describe("error reporting", function() {
      describe("found string reporting", function() {
        it("reports found string correctly at the end of input", function() {
          var parser = PEG.buildParser('start = "a"', options);

          expect(parser).toFailToParse("", { found: null });
        });

        it("reports found string correctly in the middle of input", function() {
          var parser = PEG.buildParser('start = "a"', options);

          expect(parser).toFailToParse("b", { found: "b" });
        });
      });

      describe("message building", function() {
        it("builds message correctly with no alternative", function() {
          var parser = PEG.buildParser('start = "a"', options);

          expect(parser).toFailToParse("ab", {
            message: 'Expected end of input but "b" found.'
          });
        });

        it("builds message correctly with one alternative", function() {
          var parser = PEG.buildParser('start = "a"', options);

          expect(parser).toFailToParse("b", {
            message: 'Expected "a" but "b" found.'
          });
        });

        it("builds message correctly with multiple alternatives", function() {
          var parser = PEG.buildParser('start = "a" / "b" / "c"', options);

          expect(parser).toFailToParse("d", {
            message: 'Expected "a", "b" or "c" but "d" found.'
          });
        });

        it("builds message correctly at the end of input", function() {
          var parser = PEG.buildParser('start = "a"', options);

          expect(parser).toFailToParse("", {
            message: 'Expected "a" but end of input found.'
          });
        });

        it("builds message correctly in the middle of input", function() {
          var parser = PEG.buildParser('start = "a"', options);

          expect(parser).toFailToParse("b", {
            message: 'Expected "a" but "b" found.'
          });
        });
      });

      describe("position reporting", function() {
        it("reports position correctly at the end of input", function() {
          var parser = PEG.buildParser('start = "a"', options);

          expect(parser).toFailToParse("", {
            location: {
              start: { offset: 0, line: 1, column: 1 },
              end:   { offset: 0, line: 1, column: 1 }
            }
          });
        });

        it("reports position correctly in the middle of input", function() {
          var parser = PEG.buildParser('start = "a"', options);

          expect(parser).toFailToParse("b", {
            location: {
              start: { offset: 0, line: 1, column: 1 },
              end:   { offset: 1, line: 1, column: 2 }
            }
          });
        });

        it("reports position correctly with trailing input", function() {
          var parser = PEG.buildParser('start = "a"', options);

          expect(parser).toFailToParse("aa", {
            location: {
              start: { offset: 1, line: 1, column: 2 },
              end:   { offset: 2, line: 1, column: 3 }
            }
          });
        });

        it("reports position correctly in complex cases", function() {
          var parser = PEG.buildParser([
                'start  = line (nl+ line)*',
                'line   = digit (" "+ digit)*',
                'digit  = [0-9]',
                'nl     = [\\r\\n\\u2028\\u2029]'
              ].join("\n"), options);

          expect(parser).toFailToParse("1\n2\n\n3\n\n\n4 5 x", {
            location: {
              start: { offset: 13, line: 7, column: 5 },
              end:   { offset: 14, line: 7, column: 6 }
            }
          });

          /* Non-Unix newlines */
          expect(parser).toFailToParse("1\rx", {     // Old Mac
            location: {
              start: { offset: 2, line: 2, column: 1 },
              end:   { offset: 3, line: 2, column: 2 }
            }
          });
          expect(parser).toFailToParse("1\r\nx", {   // Windows
            location: {
              start: { offset: 3, line: 2, column: 1 },
              end:   { offset: 4, line: 2, column: 2 }
            }
          });
          expect(parser).toFailToParse("1\n\rx", {   // mismatched
            location: {
              start: { offset: 3, line: 3, column: 1 },
              end:   { offset: 4, line: 3, column: 2 }
            }
          });

          /* Strange newlines */
          expect(parser).toFailToParse("1\u2028x", {   // line separator
            location: {
              start: { offset: 2, line: 2, column: 1 },
              end:   { offset: 3, line: 2, column: 2 }
            }
          });
          expect(parser).toFailToParse("1\u2029x", {   // paragraph separator
            location: {
              start: { offset: 2, line: 2, column: 1 },
              end:   { offset: 3, line: 2, column: 2 }
            }
          });
        });
      });
    });

    /*
     * Following examples are from Wikipedia, see
     * http://en.wikipedia.org/w/index.php?title=Parsing_expression_grammar&oldid=335106938.
     */
    describe("complex examples", function() {
      it("handles arithmetics example correctly", function() {
        /*
         * Value   ← [0-9]+ / '(' Expr ')'
         * Product ← Value (('*' / '/') Value)*
         * Sum     ← Product (('+' / '-') Product)*
         * Expr    ← Sum
         */
        var parser = PEG.buildParser([
              'Expr    = Sum',
              'Sum     = first:Product rest:(("+" / "-") Product)* {',
              '            var result = first, i;',
              '            for (i = 0; i < rest.length; i++) {',
              '              if (rest[i][0] == "+") { result += rest[i][1]; }',
              '              if (rest[i][0] == "-") { result -= rest[i][1]; }',
              '            }',
              '            return result;',
              '          }',
              'Product = first:Value rest:(("*" / "/") Value)* {',
              '            var result = first, i;',
              '            for (i = 0; i < rest.length; i++) {',
              '              if (rest[i][0] == "*") { result *= rest[i][1]; }',
              '              if (rest[i][0] == "/") { result /= rest[i][1]; }',
              '            }',
              '            return result;',
              '          }',
              'Value   = digits:[0-9]+     { return parseInt(digits.join(""), 10); }',
              '        / "(" @Expr ")"'
            ].join("\n"), options);

        /* The "value" rule */
        expect(parser).toParse("0",       0);
        expect(parser).toParse("123",     123);
        expect(parser).toParse("(42+43)", 42+43);

        /* The "product" rule */
        expect(parser).toParse("42",          42);
        expect(parser).toParse("42*43",       42*43);
        expect(parser).toParse("42*43*44*45", 42*43*44*45);
        expect(parser).toParse("42/43",       42/43);
        expect(parser).toParse("42/43/44/45", 42/43/44/45);

        /* The "sum" rule */
        expect(parser).toParse("42*43",                   42*43);
        expect(parser).toParse("42*43+44*45",             42*43+44*45);
        expect(parser).toParse("42*43+44*45+46*47+48*49", 42*43+44*45+46*47+48*49);
        expect(parser).toParse("42*43-44*45",             42*43-44*45);
        expect(parser).toParse("42*43-44*45-46*47-48*49", 42*43-44*45-46*47-48*49);

        /* The "expr" rule */
        expect(parser).toParse("42+43", 42+43);

        /* Complex test */
        expect(parser).toParse("(1+2)*(3+4)", (1+2)*(3+4));
      });

      it("handles non-context-free language correctly", function() {
        /* The following parsing expression grammar describes the classic
         * non-context-free language { a^n b^n c^n : n >= 1 }:
         *
         * S ← &(A c) a+ B !(a/b/c)
         * A ← a A? b
         * B ← b B? c
         */
        var parser = PEG.buildParser([
              'S = &(A "c") a:"a"+ B:B !("a" / "b" / "c") { return a.join("") + B; }',
              'A = a:"a" A:A? b:"b" { return [a, A, b].join(""); }',
              'B = b:"b" B:B? c:"c" { return [b, B, c].join(""); }'
            ].join("\n"), options);

        expect(parser).toParse("abc",       "abc");
        expect(parser).toParse("aaabbbccc", "aaabbbccc");
        expect(parser).toFailToParse("aabbbccc");
        expect(parser).toFailToParse("aaaabbbccc");
        expect(parser).toFailToParse("aaabbccc");
        expect(parser).toFailToParse("aaabbbbccc");
        expect(parser).toFailToParse("aaabbbcc");
        expect(parser).toFailToParse("aaabbbcccc");
      });

      it("handles nested comments example correctly", function() {
        /*
         * Begin ← "(*"
         * End ← "*)"
         * C ← Begin N* End
         * N ← C / (!Begin !End Z)
         * Z ← any single character
         */
        var parser = PEG.buildParser([
              'C     = begin:Begin ns:N* end:End { return begin + ns.join("") + end; }',
              'N     = C',
              '      / !Begin !End @Z',
              'Z     = .',
              'Begin = "(*"',
              'End   = "*)"'
            ].join("\n"), options);

        expect(parser).toParse("(**)",     "(**)");
        expect(parser).toParse("(*abc*)",  "(*abc*)");
        expect(parser).toParse("(*(**)*)", "(*(**)*)");
        expect(parser).toParse(
          "(*abc(*def*)ghi(*(*(*jkl*)*)*)mno*)",
          "(*abc(*def*)ghi(*(*(*jkl*)*)*)mno*)"
        );
      });
    });
  });
});
