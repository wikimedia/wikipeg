// trace-helpers.js
function peg$traceDecorator(parseFunc, name, argNames) {
  return function() {
    var argMap = {};
    for (let i = 0; i < arguments.length; i++) {
      argMap[argNames[i]] = arguments[i];
    }
    var startPos = peg$currPos;
    peg$tracer.trace({
      type:     "rule.enter",
      rule:     name,
      location: peg$computeLocation(startPos, startPos),
      args: argMap
    });
    var result = parseFunc.apply(null, arguments);
    if (result !== peg$FAILED) {
      peg$tracer.trace({
        type:     "rule.match",
        rule:     name,
        result:   result,
        location: peg$computeLocation(startPos, peg$currPos)
      });
    } else {
      peg$tracer.trace({
        type: "rule.fail",
        rule: name,
        location: peg$computeLocation(startPos, startPos)
      });
    }
    return result;
  };
}
