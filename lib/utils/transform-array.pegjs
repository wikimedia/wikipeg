// PHP associative array literal → JavaScript object literal transformer.
//
// Parses PHP action/predicate code and converts all-associative array
// literals to JavaScript object literals:
//   [ 'key' => expr, ... ]  →  { key: expr, ... }
//
// List arrays (no => items), string literals, and all other text pass
// through unchanged.  Applied recursively so nested arrays are converted
// independently.

start = Code

// -----------------------------------------------------------------------
// Top-level: pass everything through, transforming arrays
// -----------------------------------------------------------------------

Code = toks:Part* { return toks.join(''); }

Part
  = $String     // string literal - verbatim
  / Array       // array literal - transform
  / $[^\['"]+   // anything else - verbatim
  / $.          // "broken" - allow verbatim after trying to match string/array

// -----------------------------------------------------------------------
// String literals: passed through verbatim including escape sequences
// -----------------------------------------------------------------------

String "string literal"
  = $("'" ( "\\" . / [^\'\\] )* "'")
  / $('"' ( "\\" . / [^\"\\] )* '"')

// -----------------------------------------------------------------------
// Array literals: PHP syntax transformed into JS syntax
//
// There's ambiguity with an empty array `[]`, but the action author can
// disambiguate: PHP `[]` => JS `{}`, while PHP `[/*array*/]` => `[]`
// because this simplistic grammar treats the /*comment*/ as a list item.
// -----------------------------------------------------------------------

Array "array"
  = "[" sp:_ "]"
    { return "{" + sp + "}"; }
  / "[" toks:( _ AssocPairs _ OptTrailingComma ) "]"
    { return "{" + toks.join('') + "}"; }
  / toks:( "[" _ ListItems _ OptTrailingComma "]" )
    { return toks.join(''); }

OptTrailingComma = $( "," _ ) / ""

AssocPairs
  = first:AssocPair toks:(_ "," _ AssocPairs )?
    { return first + (toks || []).join(''); }

AssocPair
  // This is the actual transformation! Keys get unquoted, arrow turns into :
  = toks:( QuotedKey (_ "=>" { return ":"; }) _ ValueNoComma )
    { return toks.join(''); }

// Unquote the key. This should be a plain identifier.
QuotedKey = &(['"] [a-z0-9_]i+ ['"]) s:String { return s.slice(1,-1); }

ListItems
  = first:ValueNoComma toks:(_ "," _ ListItems )?
    { return first + (toks || []).join(''); }

// A Value is everything up to an unescaped comma or closing bracket at
// bracket depth 0.  String literals and nested brackets are tracked to
// prevent false stops.
ValueNoComma
  = toks:( !"," @ValuePart)+ { return toks.join(''); }

ValuePart
  = String
  / Array
  / "(" inner:ValueParts ")" { return "(" + inner + ")"; }
  / "{" inner:ValueParts "}" { return "{" + inner + "}"; }
  / $( [^,\[\](){}\'\"]+ )
  / "," // disallowed in ValuePartNoComma, though!

ValueParts
  = toks:ValuePart* { return toks.join(''); }

_ "whitespace"
  = $([ \t\n\r]*)
