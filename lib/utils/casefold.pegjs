/*
 * Grammar for parsing Unicode case folding definitions
 * from https://unicode.org/Public/UCD/latest/ucd/CaseFolding.txt
 *
 */
File = Comment* e:Entry+ Comment* { return e; }

Comment = ("#" [^\n]*)? "\n"

Entry = code:HexNumber __ ";" __ status:StatusChar __ ";" __ mapped:HexNumberList __ ";" __ Comment {
    return { code, status, mapped };
}

HexNumber = s:$[0-9A-Fa-f]+ { return parseInt(s, 16); }

HexNumberList = first:HexNumber rest:( [ \t]+ h:HexNumber { return h; })* {
  return [ first ].concat(rest);
}

StatusChar = $[CFST]

__ = [ \t]*
