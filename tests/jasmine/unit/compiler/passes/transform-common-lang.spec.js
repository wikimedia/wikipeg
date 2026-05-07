/* global describe, expect, it, PEG */

"use strict";

function checkAction(pass, before, after) {
  expect(pass).toChangeAST(
	'start = "" {return ' + before + ';}',
	{
      allowedStartRules: [ "start" ],
      commonLang: true,
      language: 'javascript'
    },
	{
      rules: [
        {
          name:       "start",
          expression: {
            type: "action",
            code: "return " + after + ";",
          }
        }
      ]
	}
  );
}

describe("compiler pass |transformCommonLang|", function() {
  var pass = PEG.compiler.passes.transform.transformCommonLang;

  // -----------------------------------------------------------------------
  // Associative arrays → JS objects
  // -----------------------------------------------------------------------

  it("converts a flat associative array to a JS object", function() {
    checkAction(
      pass,
      "[ 'type' => 'pipe', 'left' => $left, 'right' => $right ]",
      "{ type: 'pipe', left: left, right: right }"
    );
  });

  it("handles a single key-value pair", function() {
    checkAction(
      pass,
      "[ 'type' => 'identity' ]",
      "{ type: 'identity' }"
    );
  });

  it("preserves surrounding whitespace around keys and values", function() {
    checkAction(
      pass,
      "[ 'a' =>  $x ,  'b'  => $y ]",
      "{ a:  x ,  b: y }"
    );
  });

  it("converts an empty array to an object", function() {
    checkAction(
      pass,
      "[]",
      "{}"
    );
  });

  // -----------------------------------------------------------------------
  // List arrays — left unchanged
  // -----------------------------------------------------------------------

  it("workaround syntax for an empty array", function() {
    checkAction(pass,"[ /*array*/ ]","[ /*array*/ ]");
  });

  it("leaves a list array with variables unchanged", function() {
    checkAction(
      pass,
      "[ $first, ...$rest ]",
      "[ first, ...rest ]"
    );
  });

  it("leaves a list array with a single element unchanged", function() {
    checkAction(
      pass,
      "[ $x ]",
      "[ x ]"
    );
  });

  // -----------------------------------------------------------------------
  // Nesting
  // -----------------------------------------------------------------------

  it("converts nested associative arrays", function() {
    checkAction(
      pass,
      "[ 'type' => 'foo', 'sub' => [ 'x' => $y ] ]",
      "{ type: 'foo', sub: { x: y } }"
    );
  });

  it("keeps nested list arrays as arrays within an object", function() {
    checkAction(
      pass,
      "[ 'type' => 'arr', 'elems' => [ $a, $b ] ]",
      "{ type: 'arr', elems: [ a, b ] }"
    );
  });

  it("converts deeply nested structures", function() {
    checkAction(
      pass,
      "[ 'a' => [ 'b' => [ 'c' => $v ] ] ]",
      "{ a: { b: { c: v } } }"
    );
  });

  // -----------------------------------------------------------------------
  // String literals
  // -----------------------------------------------------------------------

  it("passes string values through unchanged", function() {
    checkAction(
      pass,
      "[ 'type' => 'literal', 'value' => 'hello' ]",
      "{ type: 'literal', value: 'hello' }"
    );
  });

  it("does not confuse brackets or => inside string values", function() {
    checkAction(
      pass,
      "[ 'type' => 'literal', 'value' => '[a=>b]' ]",
      "{ type: 'literal', value: '[a=>b]' }"
    );
  });

  it("A bare string value with no => is treated as a list item", function() {
    checkAction(
      pass,
      "[ 'hello', 'world' ]",
      "[ 'hello', 'world' ]"
    );
  });

  it("Embedded => in a string doesn't confuse anything", function() {
    checkAction(
      pass,
      "[ 'hello => world', 'world' ]",
      "[ 'hello => world', 'world' ]"
    );
  });

  // -----------------------------------------------------------------------
  // Index-access brackets (e.g. $arr['key'] or $arr[0])
  // -----------------------------------------------------------------------

  it("converts index-access string keys to list-array notation", function() {
    // $arr['key'] → the ['key'] parses as a list array containing 'key'
    checkAction(
      pass,
      "$arr['key']",
      "arr['key']"
    );
  });

  it("converts index-access integer keys to list-array notation", function() {
    checkAction(
      pass,
      "$arr[ 0 ]",
      "arr[ 0 ]"
    );
  });

  it("converts multilevel index-access string keys to list-array notation", function() {
    // $arr['key'] → the ['key'] parses as a list array containing 'key'
    checkAction(
      pass,
      "$arr['key'][ 0 ]['foo'][1]",
      "arr['key'][ 0 ]['foo'][1]"
    );
  });

  it("converts multilevel index-access arrays inside array literals", function() {
    checkAction(
      pass,
      "[ 'foo' => $arr[ 0 ][1], 'bar' => 'bat' ]",
      "{ foo: arr[ 0 ][1], bar: 'bat' }"
    );
  });

  // -----------------------------------------------------------------------
  // Inner parentheses and braces
  // -----------------------------------------------------------------------

  it("commas are allowed inside inner parens or brackets", function() {
    checkAction(
      pass,
      "[ 'type' => 'literal', 'value' => implode( '', $chars ) ]",
      "{ type: 'literal', value: implode( '', chars ) }"
    );
  });

  // -----------------------------------------------------------------------
  // Surrounding code is preserved
  // -----------------------------------------------------------------------

  it("preserves surrounding code outside array literals", function() {
    checkAction(
      pass,
      "return [ 'type' => 'foo' ]; // comment",
      "return { type: 'foo' }; // comment"
    );
  });

  it("array-transformation doesn't touch code that contains no array literals", function() {
    checkAction(
      pass,
      "$x + $y",
      "x + y"
    );
  });

});
