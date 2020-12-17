"use strict";

var arrays  = require("./utils/arrays"),
    objects = require("./utils/objects");

var PEG = {
  /* WikiPEG version (uses semantic versioning). */
  VERSION: "2.0.5",

  GrammarError: require("./grammar-error"),
  parser:       require("./parser"),
  compiler:     require("./compiler"),

  /*
   * Generates a parser from a specified grammar and returns it.
   *
   * The grammar must be a string in the format described by the metagramar in
   * the parser.pegjs file.
   *
   * Throws |PEG.parser.SyntaxError| if the grammar contains a syntax error or
   * |PEG.GrammarError| if it contains a semantic error. Note that not all
   * errors are detected during the generation and some may protrude to the
   * generated parser and cause its malfunction.
   */
  buildParser: function(grammar) {
    function convertPasses(passes) {
      var converted = {}, stage;

      for (stage in passes) {
        if (passes.hasOwnProperty(stage)) {
          converted[stage] = objects.values(passes[stage]);
        }
      }

      return converted;
    }

    var options = arguments.length > 1 ? objects.clone(arguments[1]) : {};

    var defaultPasses = {
      check: this.compiler.passes.check,
      transform: this.compiler.passes.transform,
      generate: this.compiler.passes.generate
    };

    if (options.allowLoops) {
      defaultPasses.check = objects.clone(defaultPasses.check);
      delete defaultPasses.check.reportInfiniteLoops;
    }

    var plugins = "plugins" in options ? options.plugins : [],
        config  = {
          parser: this.parser,
          passes: convertPasses(defaultPasses)
        };

    arrays.each(plugins, function(p) { p.use(config, options); });

    return this.compiler.compile(
      config.parser.parse(grammar),
      config.passes,
      options
    );
  }
};

module.exports = PEG;
