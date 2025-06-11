"use strict";

const objects = require("./utils/objects");

var compiler = {
  /*
   * Compiler passes.
   *
   * Each pass is a function that is passed the AST. It can perform checks on it
   * or modify it as needed. If the pass encounters a semantic error, it throws
   * |PEG.GrammarError|.
   */
  passes: {
    check: {
      reportMissingRules:  require("./compiler/passes/report-missing-rules"),
      reportLeftRecursion: require("./compiler/passes/report-left-recursion"),
      reportInfiniteLoops: require("./compiler/passes/report-infinite-loops")
    },
    transform: {
      removeProxyRules:    require("./compiler/passes/remove-proxy-rules"),
      inlineSimpleRules:   require("./compiler/passes/inline-simple-rules"),
      analyzeParams:       require("./compiler/passes/analyze-params"),
      transformCommonLang: require("./compiler/passes/transform-common-lang"),
    },
    generate: {
      astToCode:   require("./compiler/passes/ast-to-code")
    }
  },

  /*
   * Generates a parser from a specified grammar AST. Throws |PEG.GrammarError|
   * if the AST contains a semantic error. Note that not all errors are detected
   * during the generation and some may protrude to the generated parser and
   * cause its malfunction.
   */
  compile: function(ast, passes) {
    let options = arguments.length > 2 ? objects.clone(arguments[2]) : {};

    objects.defaults(options, {
      allowedStartRules:  [ast.rules[0].name],
      allowedStreamRules: [],
      cache:              false,
      trace:              false,
      optimize:           "speed",
      output:             "parser"
    });

    Object.getOwnPropertyNames(passes).forEach((stage) => {
      let stagePasses = passes[stage];
      if (typeof(stagePasses) === 'object') {
        stagePasses = Object.values(stagePasses);
      }
      stagePasses.forEach( (p) => { p(ast, options); });
    });

    switch (options.output) {
      case "parser": return eval(ast.code);
      case "source": return ast.code;
    }
  }
};

module.exports = compiler;
