/* global describe, expect, it, PEG */

"use strict";

describe("compiler pass |reportUnknownAttributes|", function() {
  var pass = PEG.compiler.passes.check.reportUnknownAttributes;

  it("reports unknown attribute 'foo' as first attribute", function() {
    expect(pass).toReportError('start [foo] = "abc"', {
      message:  'Rule "start" contains unknown attribute "foo".',
      location: {
        start: { offset:  7, line: 1, column:  8 },
        end:   { offset: 10, line: 1, column: 11 }
      }
    });
  });

  it("reports unknown attribute 'foo' as last attribute", function() {
    expect(pass).toReportError('start [name="start", foo] = "abc"', {
      message:  'Rule "start" contains unknown attribute "foo".',
      location: {
        start: { offset:  21, line: 1, column:  22 },
        end:   { offset: 24, line: 1, column: 25 }
      }
    });
  });

  it("does not report known attribute 'name'", function() {
    expect(pass).not.toReportError('start [name="foo"] = "abc"');
  });

  it("reports 'name' with non-string value", function() {
    expect(pass).toReportError('start [name] = "abc"', {
      message: 'Rule "start" attribute "name" has boolean value but expected string.',
    });
  });

  it("does not report known attribute 'inline'", function() {
    expect(pass).not.toReportError('start [inline] = "abc"');
  });

  it("reports 'inline' with non-boolean value", function() {
    expect(pass).toReportError('start [inline="abc"] = "abc"', {
      message: 'Rule "start" attribute "inline" has string value but expected boolean.',
    });
  });

  it("does not report known attribute 'cache'", function() {
    expect(pass).not.toReportError('start [cache=false] = "abc"');
  });

  it("reports 'cache' with non-boolean value", function() {
    expect(pass).toReportError('start [cache="abc"] = "abc"', {
      message: 'Rule "start" attribute "cache" has string value but expected boolean.',
    });
  });

  it("does not report known attribute 'empty'", function() {
    expect(pass).not.toReportError('start [empty] = "abc"');
  });

  it("reports 'empty' with non-boolean value", function() {
    expect(pass).toReportError('start [empty="abc"] = "abc"', {
      message: 'Rule "start" attribute "empty" has string value but expected boolean.',
    });
  });

  it("does not report known attribute 'unreachable'", function() {
    expect(pass).not.toReportError('start [unreachable] = "abc"');
  });

  it("reports 'unreachable' with non-boolean value", function() {
    expect(pass).toReportError('start [unreachable="abc"] = "abc"', {
      message: 'Rule "start" attribute "unreachable" has string value but expected boolean.',
    });
  });

});
