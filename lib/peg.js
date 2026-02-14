"use strict";

var objects = require("./utils/objects");

var PEG = {
  /* WikiPEG version (uses semantic versioning). */
  VERSION: "6.1.0-git",

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
      let converted = {};

      Object.getOwnPropertyNames(passes).forEach((stage) => {
        converted[stage] = Object.values(passes[stage]);
      });

      return converted;
    }

    var options = arguments.length > 1 ? objects.clone(arguments[1]) : {};

    var defaultPasses = {
      check: this.compiler.passes.check,
      transform: this.compiler.passes.transform,
      generate: this.compiler.passes.generate
    };

    var plugins = "plugins" in options ? options.plugins : [],
        config  = {
          parser: this.parser,
          passes: convertPasses(defaultPasses)
        };

    plugins.forEach( (p) => { p.use(config, options); });

    return this.compiler.compile(
      config.parser.parse(grammar),
      config.passes,
      options
    );
  }
};

module.exports = PEG;
