(function() {
  "use strict";
  /*
   * Generated by PEG.js 0.8.0.
   *
   * http://pegjs.org/
   */

  function peg$subclass(child, parent) {
    function ctor() { this.constructor = child; }
    ctor.prototype = parent.prototype;
    child.prototype = new ctor();
  }

  function peg$SyntaxError(message, expected, found, location) {
    this.message  = message;
    this.expected = expected;
    this.found    = found;
    this.location = location;

    this.name     = "SyntaxError";
  }

  peg$subclass(peg$SyntaxError, Error);

  var exports = {
    SyntaxError:   peg$SyntaxError,
  };

/*$TRACER*/
/*$PARSER*/

  return exports;
})();
