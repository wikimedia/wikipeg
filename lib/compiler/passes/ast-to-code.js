"use strict";

var js      = require("../language/javascript"),
    php     = require("../language/php"),
    visitor = require("../visitor"),
    objects = require('../../utils/objects'),
    classNode = require("../charsets").classNode,
    asts    = require("../asts"),
    fs      = require("fs");

function generateJavascript(ast, options) {
  var rulesToGenerate = [];
  var generatedRuleNames = {};

  /**
   * An array of blocks which define numbered variables, containing error
   * message information, to be added to the top of peg$parse
   */
  var expectations = [];

  /**
   * A map of definition code to variable number, for deduplication of expectations
   */
  var expectationIndexes = {};

  /**
   * An array of code blocks containing action and semantic predicate code
   */
  var actions = [];

  /**
   * A map of action code to variable number, for deduplication of actions
   */
  var actionIndexes = {};

  /**
   * An array of registers which are used by the current rule function, for
   * use in the "var" declaration.
   */
  var allocatedRegList = [];

  /**
   * A list of unused result registers available for reuse.
   */
  var freeRegList = [];

  /**
   * A list of unused position registers available for reuse.
   */
  var freePosRegList = [];

  /**
   * The highest allocated register index. This is reset each time a new rule
   * is entered.
   */
  var regIndex = 0;

  /**
   * The highest allocated sequence label index, for labeled breaks.
   */
  var seqIndex = 0;

  /**
   * The highest allocated choice label index, for labeled breaks.
   */
  var choiceIndex = 0;

  /**
   * The current rule node
   */
  var currentRule = {};

  /**
   * The language object
   */
  var language;

  if (options.language === 'php') {
    language = php;
  } else {
    language = js;
  }

  var className = options.className || 'PEGParser';
  var namespace = '';
  var matches = className.match(/^(.*)\\([^\\]*)$/);
  if (matches) {
    className = matches[2];
    namespace = `namespace ${matches[1]};`;
  }

  var refsSet = {};
  var getRefs = visitor.build({
    rule_ref: function(node) {
      for (let i = 0; i < node.assignments.length; i++) {
        let assignment = node.assignments[i];
        if (assignment.isref) {
          refsSet[assignment.name] = true;
        }
      }
    }
  });
  getRefs(ast);
  var references = Object.keys(refsSet);

  /**
   * The default init cache hook
   */
  var initCache = language.initCache;

  /**
   * The default cache rule hook
   */
  var generateCacheRule = language.generateCacheRule;

  function indent2(code)  { return code.replace(/^(.+)$/gm, '  $1');       }

  /**
   * The Context class.
   *
   * This is used to hold context for passing information from nodes to their
   * children and siblings. It has a collection of cloning mutator methods
   * which can be chained.
   */
  function Context() {
    /**
     * The current environment, which is a map of PEG labels to the register
     * names in which they are stored.
     */
    this.env = {};

    /**
     * The types of the environment variables
     */
    this.envTypes = {};

    this.resultReg_ = false;
    this.silence_ = language.silence;
    this.discard_ = false;
    this.savedPosRefState_ = null;
    this.shouldFreePosRefState_ = false;
  }
  Context.prototype = {
    clone: function() {
      return Object.create(this);
    },

    /**
     * Get the result register specified owned by the caller, or create a new
     * register owned by the callee if there was none. Set the expression of
     * the specified result to this register.
     */
    getResultReg: function(result) {
      if (this.resultReg_ === false) {
        this.resultReg_ = allocReg(result.free);
      }
      result.expression = this.resultReg_;
      return this.resultReg_;
    },

    /**
     * This function fixes a result which has an incorrect expression. If the
     * context specifies a result register, the expression must be set to it.
     */
    fixResult: function(result) {
      if (this.resultReg_ !== false && this.resultReg_ !== result.expression) {
        result.resolveBlock();
        result.block.push(`${this.resultReg_} = ${result.expression};`);
        result.expression = this.resultReg_;
        freeReg(result.free, result);
        result.free = [];
      }
    },

    /**
     * Get a JavaScript expression which evaluates to true at runtime if
     * collection of failure information should be suppressed. This may be a
     * compile-time constant "true", in which the call to peg$fail() can be
     * omitted.
     */
    getSilence: function() {
      return this.silence_;
    },

    /**
     * Clone the object and set the silence flag to true in the clone.
     */
    silence: function() {
      var obj = this.clone();
      obj.silence_ = 'true';
      return obj;
    },

    /**
     * Clone the object and set the result register to the name given. This
     * forces subexpressions to assign their result to this register.
     */
    resultReg: function(value) {
      var obj = this.clone();
      obj.resultReg_ = value;
      return obj;
    },

    /**
     * Clone the object, and clone the environment map so that labels defined
     * in the returned context will not be propagated into the original context.
     */
    cloneEnv: function() {
      var obj = this.clone();
      obj.env = objects.clone(obj.env);
      obj.envTypes = objects.clone(obj.envTypes);
      return obj;
    },

    /**
     * Clone the object, and clear the result register in the cloned object
     * instead of passing through the current result register. Children will
     * thus allocate their own result register if necessary.
     */
    noPassThru: function() {
      var obj = this.clone();
      obj.resultReg_ = false;
      return obj;
    },

    /**
     * Clone the object, and set the discard flag in the cloned object. This
     * indicates that the caller is only interested in success or failure, and
     * some subexpressions will use this information to return true instead of
     * the match result.
     */
    discard: function(value) {
      var obj = this.clone();
      if (typeof value === 'undefined') {
        value = true;
      }
      obj.discard_ = value;
      return obj;
    },

    /**
     * Get the discard flag.
     */
    getDiscard: function() {
      return this.discard_;
    },

    /**
     * Return a saved pos/ref state, or null if none can be reused.
     */
    getPosRefState() {
      return this.savedPosRefState_;
    },

    /**
     * Indicate that the pos/ref state of this context can't be reused by
     * children.
     */
    resetPosRefState() {
      if (this.savedPosRefState_ === null) {
        return this;
      }
      var obj = this.clone();
      obj.savedPosRefState_ = null;
      return obj;
    },

    /**
     * Ensure we have a saved pos/ref state, reusing the saved parent state
     * where that can be reused.
     */
    savePosRefState(node, result) {
      let obj;
      if (this.savedPosRefState_ !== null) {
        if (this.shouldFreePosRefState_) {
          // We can reuse the parent state, but don't free it in the child!
          obj = this.clone();
          obj.shouldFreePosRefState_ = false;
          return obj;
        }
        return this;
      }
      // Save current position
      // (should be later freed with a matching call to freePosRefState)
      let saved = {
        dst: allocPosReg(),
        src: language.currPos,
        refs: [],
      };
      let rule = currentRule;
      // Add reference variables
      for (let name in rule.passedParams) {
        if (rule.passedParams[name].type === 'reference') {
          saved.refs.push({reg: allocReg([]), name: name});
        }
      }
      result.block.push(`${saved.dst} = ${saved.src};`);
      for(let ref of saved.refs) {
        result.block.push(language.cacheSaveRef(ref.reg, ref.name));
      }
      obj = this.clone();
      obj.savedPosRefState_ = saved;
      obj.shouldFreePosRefState_ = true;
      return obj;
    },

    /**
     * Restore the saved pos/ref state.
     */
    restorePosRefState() {
      let saved = this.savedPosRefState_;
      let block = [];
      block.push(`${saved.src} = ${saved.dst};`);
      for(let ref of saved.refs) {
        block.push(language.cacheRestoreRef(ref.reg, ref.name));
      }
      return block;
    },

    /**
     * Free this context's pos/ref state, if necessary.
     */
    freePosRefState(result) {
      if (this.savedPosRefState_ !== null && this.shouldFreePosRefState_) {
        let saved = this.savedPosRefState_;
        let regList = [ saved.dst ].concat(saved.refs.map((ref)=>ref.reg));
        freeReg(regList, result);
      }
    },

  };

  /**
   * A result object has the following structure:
   *   - block: An array of lines of code which are executed initially
   *   - expression: JavaScript expression which gives the result
   *   - condition: The condition of an if/else statement following the block.
   *     If this is null, the default condition is used, which tests the
   *     expression for success.
   *   - successBlock: An array of lines executed if the condition succeeds.
   *   - failBlock: An array of lines executed if the condition fails.
   *   - epilogue: An array of lines executed after the end of the if/else
   *   - free: An array of registers which the expression may depend on, to be
   *     freed after all code referring to the expression has been output.
   *
   * So in summary:
   *
   * block
   * if (condition) {
   *   successBlock
   * } else {
   *   failBlock
   * }
   * epilogue
   * return expression;
   *
   * The condition and epilogue may be bundled into "block", generating code
   * like the pseudocode above, by calling resolveBlock().
   *
   * Execution of the expression may be reordered with other expressions, so
   * it cannot have side effects or depend on peg$currPos.
   *
   * Visitor functions returning Result objects are required to ensure that the
   * condition reflects success or failure of the node. If no condition is
   * explicitly set, a condition will automatically be generated, which
   * compares the returned expression to peg$FAILED.
   *
   * Visitor functions are also required to ensure that the result register (if
   * any) is set to the match result in the successBlock and failBlock,
   * allowing the caller to append to these blocks. This means that it is not
   * acceptable to modify the result register in the epilogue.
   */
  function Result() {
    this.block = [];
    this.condition = null;
    this.expression = '';
    this.successBlock = [];
    this.failBlock = [];
    this.epilogue = [];
    this.free = [];
  }
  Result.prototype = {
    /**
     * Concatenate the parts of the current block into a single array of lines,
     * which will be assigned to this.block and also returned. Clear the part
     * arrays so that the call can be safely repeated.
     */
    resolveBlock: function() {
      if (this.condition === 'true') {
        this.block = this.block.concat(this.successBlock);
      } else if (this.condition === 'false') {
        this.block = this.block.concat(this.failBlock);
      } else if (this.successBlock.length) {
        if (this.condition !== null) {
          this.block.push(['if (', this.condition, ') {'].join(''));
        } else {
          this.block.push(['if (', this.expression, '!==', language.failed, ') {'].join(''));
        }
        this.block.push(indent2(this.successBlock.join('\n')));
        if (this.failBlock.length) {
          this.block.push(
            '} else {',
            indent2(this.failBlock.join('\n')));
        }
        this.block.push('}');
      } else if (this.failBlock.length) {
        if (this.condition !== null) {
          this.block.push(['if (!(', this.condition, ')) {'].join(''));
        } else {
          this.block.push(['if (', this.expression, '===', language.failed, ') {'].join(''));
        }
        this.block.push(
          indent2(this.failBlock.join('\n')),
          '}');
      }
      this.block = this.block.concat(this.epilogue);
      this.successBlock = [];
      this.failBlock = [];
      this.condition = null;
      this.epilogue = [];
      return this.block;
    },

    /**
     * Add an array of lines of code to the success block. This block will be
     * executed if the node matches.
     */
    onSuccess: function(b) {
      if (!Array.isArray(b)) {
        throw new Error("onSuccess() must be given an array");
      }
      this.successBlock = this.successBlock.concat(b);
      return this;
    },

    /**
     * Add an array of lines of code to the failure block. This block will be
     * executed if the node fails to match.
     */
    onFailure: function(b) {
      if (!Array.isArray(b)) {
        throw new Error("onFailure() must be given an array");
      }
      this.failBlock = this.failBlock.concat(b);
      return this;
    },

    /**
     * Join another block after this one, assuming that the other block
     * will use the expression of the existing block, if any. So the blocks
     * are concatenated, and the expression is replaced. The old conditional
     * part is resolved, and the conditional part of the other becomes the
     * conditional part of the new result.
     */
    append: function(other) {
      this.free = this.free.concat(other.free);
      this.expression = other.expression;
      this.block = this.resolveBlock().concat(other.block);
      this.condition = other.condition;
      this.successBlock = other.successBlock;
      this.failBlock = other.failBlock;
      this.epilogue = other.epilogue;
    }
  };

  /**
   * Add a rule to the list of rules to generate, and return its name
   */
  function addRule(name, discard) {
    var funcName = language.ruleFuncName(name, discard, false);
    rulesToGenerate.push({
      name: name,
      discard: discard,
      funcName: funcName
    });
    return funcName;
  }

  function allocReg(free) {
    var reg;
    if (!Array.isArray(free)) {
      throw new Error("allocReg() must be given a free list");
    }
    if (freeRegList.length) {
      reg = freeRegList.pop();
    } else {
      reg = language.regName(++regIndex);
      allocatedRegList.push(reg);
    }
    free.push(reg);
    return reg;
  }

  function allocPosReg() {
    var reg;
    if (freePosRegList.length) {
      reg = freePosRegList.pop();
    } else {
      reg = language.posRegName(++regIndex);
      allocatedRegList.push(reg);
    }
    return reg;
  }

  /**
   * Free a register or array of registers. Note that this is a kind of
   * compile-time allocation. By calling this function, you are promising
   * that no more code will be generated that refers to the freed register.
   *
   * If the result object is supplied, a comment will be added to the source.
   */
  function freeReg(reg, result) {
    if (!Array.isArray(reg)) {
      reg = [reg];
    }
    var i;
    for (i = 0; i < reg.length; i++) {
      if (language.getRegType(reg[i]) === 'p') {
        freePosRegList.push(reg[i]);
      } else {
        freeRegList.push(reg[i]);
      }
    }
    if (result && reg.length) {
      result.epilogue.push('// free ' + reg.join(','));
    }
  }

  /**
   * Add a compile-time constant and return the variable name which holds it.
   */
  function addExpectation(obj) {
    var str = language.stringify(obj);
    if (str in expectationIndexes) {
      return language.expectationExpression(expectationIndexes[str]);
    } else {
      var index = expectations.length;
      expectationIndexes[str] = index;
      expectations.push(language.expectationDeclaration(index, str));
      return language.expectationExpression(index);
    }
  }

  /**
   * Create a function definition for code which was specified in the grammar,
   * and return the resulting function index.
   */
  function makeActionFunc(code, context) {
    var argNames = [];
    Object.keys(context.env).forEach(function(argName) {
      if (context.envTypes[argName] === 'reference') {
        argNames.push(language.refArgActionDeclarator(argName));
      } else {
        argNames.push(language.valueArgActionDeclarator(argName));
      }
    });
    var key = argNames.concat([code]).join('\n');
    if (key in actionIndexes) {
      return actionIndexes[key];
    } else {
      var index = actions.length;
      actionIndexes[key] = index;
      actions.push(language.actionDeclaration(index, argNames, code));
      return index;
    }
  }

  /**
   * Return an expression which calls code which was defined in the grammar.
   * funcId is the index of the function returned by makeActionFunc().
   */
  function makeActionCall(funcId, context) {
    return language.actionCall(funcId, Object.values(context.env));
  }

  /**
   * Return a JS block which calls peg$fail, conditional on the current
   * value of the silence expression. If silence is known to be true at
   * compile time, this returns an empty string.
   */
  function makeFailCall(value, context) {
    var silence = context.getSilence();
    if (silence === 'true') {
      // This should not be reached in practice.
      return '';
    }
    var expectation = addExpectation(value);
    var call = language.libraryCall('fail', [expectation]);
    return `if (!${silence}) { ${call}; }`;
  }

  /**
   * Make an expression which gives the value of a parameter
   */
  function makeParamExpression(info) {
    if (!currentRule || !currentRule.passedParams[info.name]) {
      return makeInitialParamValue(info, false);
    }
    if (info.type === undefined) {
      throw new Error("Undefined parameter type");
    } else if (info.type === 'boolean') {
      return [
        '/*', info.name, '*/',
        '(', language.boolParams, ' & 0x', (1 << info.index).toString(16), ') !== 0'].join('');
    } else if (info.type === 'reference') {
      return language.refParamValue(info.name);
    } else {
      return language.paramArgName(info.name);
    }
  }

  /**
   * Return an expression which gives the parameter reference object
   */
  function makeParamRefExpression(info) {
    if (info.type !== 'reference') {
      throw new Error('Cannot make reference object for non-reference parameter ' + info.name);
    }
    return language.paramArgName(info.name);
  }

  /**
   * Get an expression giving the initial value of a parameter
   */
  function makeInitialParamValue(info, isref) {
    let type = info.type;
    if (type === 'boolean') {
      return 'false';
    } else if (type === 'integer') {
      return '0';
    } else if (type === 'string') {
      return '""';
    } else if (type === 'reference') {
      if (isref) {
        return language.newRef('null');
      } else {
        return 'null';
      }
    } else {
      throw new Error('Unknown param type: ' + type);
    }
  }

  /**
   * Recursively generate a Result object for a given node. This must be used
   * instead of generate() since it is responsible for ensuring that the
   * expression is assigned to the correct register.
   */
  function recurse(node, context) {
    var result = generate(node, context);
    context.fixResult(result);
    return result;
  }

  /**
   * Handler for simple_and and simple_not.
   */
  function buildSimplePredicate(node, context) {
    var result = new Result();
    var negate = node.type === 'simple_not';
    var reg = context.getResultReg(result);
    var newContext = context.silence().cloneEnv().discard()
      .savePosRefState(node, result);
    result.append(recurse(node.expression, newContext));
    if (negate) {
      result.resolveBlock();
      result.condition = `${reg} === ${language.failed}`;
      result.onFailure([`${reg} = ${language.failed};`]);
    }
    result.onSuccess([`${reg} = ${language.assertionSuccess};`]);
    if (node.isFirstSetTest && context.getSilence() !== 'true') {
      result.onFailure([makeFailCall({
        type: 'other',
        description: node.isFirstSetTest,
      }, context)]);
    }
    if (negate) {
      result.onFailure(newContext.restorePosRefState());
    } else {
      result.onSuccess(newContext.restorePosRefState());
    }
    newContext.freePosRefState(result);
    return result;
  }

  /**
   * Handler for semantic_and and semantic_not
   */
  function buildSemanticPredicate(node, context) {
    var result = new Result();
    var negate = node.type === 'semantic_not';
    var reg = context.getResultReg(result);
    result.block = [`${language.savedPos} = ${language.currPos};`];
    var funcId = makeActionFunc(node.code, context);
    var call = makeActionCall(funcId, context);
    result.block = [
      `${language.savedPos} = ${language.currPos};`,
      `${reg} = ${call};`
    ];
    if (negate) {
      result.condition = '!' + reg;
    } else {
      result.condition = reg;
    }
    result.onSuccess([`${reg} = ${language.assertionSuccess};`]);
    result.onFailure([`${reg} = ${language.failed};`]);
    return result;
  }

  /**
   * Handler for parameter_and and parameter_not
   */
  function buildParameterPredicate(node, context) {
    var result = new Result();
    var negate = node.type === 'parameter_not';
    var reg = context.getResultReg(result);
    var paramExpression = makeParamExpression(node.paramInfo);
    if (negate) {
      result.condition = `!(${paramExpression})`;
    } else if (!node.paramInfo.value || node.paramInfo.value.type === 'boolean') {
      result.condition = paramExpression;
    } else {
      result.condition = language.toBool(paramExpression);
    }
    result.onSuccess([`${reg} = ${language.assertionSuccess};`]);
    result.onFailure([`${reg} = ${language.failed};`]);
    return result;
  }

  /**
   * Handler for one_or_more of a character class
   */
  function buildRepeatedCharacterClass(node, context, atLeastOne) {
    var result = new Result();
    var reg = context.getResultReg(result);
    var classExpr = classNode.caseSensitive(node.expression);
    language.matchRepeatedClass(classExpr, reg, result, atLeastOne, context.getDiscard());
    result.onFailure([`${reg} = ${language.failed};`]);
    if (context.getSilence() !== 'true') {
      result.onFailure([makeFailCall({
        type: "class",
        value: node.expression.rawText,
        description: node.expression.rawText
      }, context)]);
    }
    return result;
  }

  function makeGenerator(node, context) {
    if (node.type !== 'zero_or_more') {
      throw new Error('Iterable rules must be a single starred subexpression');
    }
    var result = new Result();
    var partReg = allocReg([]);
    var newContext = context.resultReg(partReg).cloneEnv();
    var subresult = recurse(node.expression, newContext);
    subresult.onSuccess([`yield ${subresult.expression};`]);
    subresult.onFailure([
      `if (${language.currPos} < ${language.inputLength}) {`,
      indent2( makeFailCall({ type: "end", description: 'end of input' }, newContext) ),
      indent2(`throw ${language.libraryCall('buildParseException')};`),
      '}',
      'break;'
    ]);

    result.condition = 'true';
    result.block = [
      'for (;;) {',
      indent2(subresult.resolveBlock().join('\n')),
      '}'
    ];
    return result;
  }

  /**
   * Get the names of the arguments to the given rule function
   */
  function getRuleArgNames(rule, discard) {
    var args;
    if (discard || !rule.reportsFailure) {
      // these rules never report failure, so silence argument isn't needed
      args = [];
    } else {
      args = [language.silence];
    }

    if (rule.hasBoolParams) {
      args.push(language.boolParams);
    }

    for (let name in rule.passedParams) {
      let type = rule.passedParams[name].type;
      if (type === undefined || type === 'boolean') {
        continue;
      } else if (type === 'reference') {
        args.push(language.refParamArgDeclarator(name));
      } else {
        args.push(language.paramArgName(name));
      }
    }
    return args;
  }

  /**
   * Get the list of arguments to a given rule function, giving initial values
   * for all required parameters
   */
  function getStartArgs(ruleName) {
    var rule = asts.findRule(ast, ruleName);
    var argNames = getRuleArgNames(rule, false);
    var args = [];

    for (let i = 0; i < argNames.length; i++) {
      let argName = argNames[i];
      if (argName === language.silence) {
        args.push('false');
      } else if (argName === language.boolParams) {
        args.push('0');
      } else {
        let paramName = language.paramNameFromArg(argName);
        let type = rule.passedParams[paramName].type;
        if (type === 'integer') {
          args.push('0');
        } else if (type === 'boolean') {
          args.push('false');
        } else if (type === 'string') {
          args.push('""');
        } else if (type === 'reference') {
          args.push(language.newRef('null'));
        } else {
          throw new Error('Unknown param type: ' + type);
        }
      }
    }
    return args;
  }

  /**
   * Get a list of expressions which can be combined together to make a cache
   * key identifying the parameter values passed to the specified rule
   * function.
   */
  function getParamsForCacheKey(rule) {
    var args = [];
    var boolMask = 0;
    for (let name in rule.passedParams) {
      if (rule.passedParams[name].type === 'boolean') {
        boolMask |= 1 << rule.passedParams[name].index;
      }
    }

    if (boolMask !== 0) {
      args.push(language.boolParams + ' & 0x' + boolMask.toString(16));
    }

    for (let name in rule.passedParams) {
      let type = rule.passedParams[name].type;
      if (type === undefined || type === 'boolean') {
        continue;
      } else if (type === 'reference') {
        args.push(language.refParamValue(name));
      } else {
        args.push(language.paramArgName(name));
      }
    }

    return args;
  }

  /**
   * Get a block which retrieves stored ref transitions from the cache and
   * modifies the parameter accordingly.
   */
  function getCacheLoadRefs(rule) {
    var block = [];
    for (let name in rule.passedParams) {
      if (rule.passedParams[name].type === 'reference') {
        block.push(language.cacheLoadRef(name));
      }
    }
    return indent2(block.join('\n'));
  }

  /**
   * Get the list of expressions or statements returned by cacheStoreRef() for
   * refs which may have changed.
   */
  function getCacheStoreRefs(rule, saved) {
    var regMap = {};
    for (let ref of saved.refs) {
      regMap[ref.name] = ref.reg;
    }
    return references.map(function(name) {
      return language.cacheStoreRef(regMap[name], name);
    });
  }

  function expandTemplate(template, vars) {
    for (let name in vars) {
      let value = vars[name];
      let encName = name.replace(/\*/g, '\\*');
      template = template.replace(new RegExp(`(^ *)?${encName}`, 'mg'), function(match, spaces) {
        if (spaces) {
          return value.replace(/^/mg, spaces);
        } else {
          return value;
        }
      });
    }
    return template;
  }

  /**
   * The visitor
   */
  var generate = visitor.build({
    rule: function(node, funcName, discard, iterable) {
      if (node.passedParams === undefined) {
        throw new Error("The analyze-params pass has not been executed");
      }

      // Reset tracking variables which are local to the rule function
      allocatedRegList = [];
      freeRegList = [];
      freePosRegList = [];
      regIndex = 0;
      seqIndex = 0;
      choiceIndex = 0;
      currentRule = node;

      // Set up the Context and save the position and reference state
      var context = (new Context()).discard(discard);
      if (discard || !node.reportsFailure) {
        context = context.silence();
      }

      var topSaveState = new Result();
      if (!iterable && options.cache) {
        context = context.savePosRefState(node, topSaveState);
      }

      // Generate the Result
      var result;
      if (iterable) {
        result = makeGenerator(node.expression, context);
      } else {
        result = recurse(node.expression, context);
      }
      result.resolveBlock();

      // Make the function body
      var body = [];
      if (allocatedRegList.length) {
        body = body.concat(body, language.varDeclaration(allocatedRegList));
      }
      if (iterable) {
        body.push(result.block.join('\n'));
      } else {
        var ruleIndexCode = asts.indexOfRule(ast, node.name);
        var cacheBits;
        if (options.cache) {
          var cacheFunc = options.cacheRuleHook || generateCacheRule;
          cacheBits = cacheFunc({
            startPos: language.currPos,
            endPos: language.currPos,
            ruleIndex: ruleIndexCode,
            ruleCount: ast.rules.length,
            variantIndex: discard ? 1 : 0,
            variantCount: 2,
            variantName: discard ? 'discard' : 'normal',
            result: result.expression,
            params: getParamsForCacheKey(node),
            loadRefs: getCacheLoadRefs(node),
            storeRefs: getCacheStoreRefs(node, context.getPosRefState()),
            saveRefs: topSaveState.block.join('\n'),
            className: className,
          });
          body.push(cacheBits.start);
        }
        body.push(result.block.join('\n'));

        if (options.cache) {
          body.push(cacheBits.store);
        }
        body.push(`return ${result.expression};`);
      }
      body = indent2(body.join('\n'));

      let argNames = getRuleArgNames(node, discard);
      let args = argNames.join(', ');

      // Wrap the function body in a trace decorator if requested.
      if (!iterable && options.trace) {
        body = 'return ' +
          language.libraryCall('traceCall', [
            `function(${args}) {\n${body}\n}`,
            language.stringify(node.name),
            language.stringify(argNames),
            `[${args}]`
          ]) +
          ';\n';
      }
      if (iterable) {
        return language.streamFuncDeclaration(funcName, argNames, body);
      } else {
        return language.ruleFuncDeclaration(funcName, argNames, body);
      }
    },

    rule_ref: function(node, context) {
      var result = new Result();

      var newParamValues = {};
      var boolSetMask = 0;
      var boolClearMask = 0;
      for (let i = 0; i < node.assignments.length; i++) {
        let assignment = node.assignments[i];
        let newValue;

        if (assignment.isref) {
          if (assignment.type === 'increment') {
            newValue = `${language.refParamValue(assignment.name)} + ${assignment.value}`;
          } else if (assignment.type === 'boolean') {
            newValue = assignment.value ? 'true' : 'false';
          } else if (assignment.type === 'string') {
            newValue = js.stringify(assignment.value);
          } else {
            newValue = assignment.value;
          }
          newParamValues[assignment.name] = language.newRef(newValue);
        } else {
          if (assignment.type === 'boolean') {
            if (assignment.value) {
              boolSetMask |= 1 << assignment.paramInfo.index;
            } else {
              boolClearMask |= 1 << assignment.paramInfo.index;
            }
          } else {
            if (assignment.type === 'increment') {
              newValue = `${language.paramArgName(assignment.name)} + ${assignment.value}`;
            } else if (assignment.type === 'string') {
              newValue = js.stringify(assignment.value);
            } else {
              newValue = assignment.value;
            }
            newParamValues[assignment.name] = newValue;
          }
        }
      }

      let rule = asts.findRule(ast, node.name);
      let argNameList = getRuleArgNames(rule, context.getDiscard());
      let args = [];
      for (let i = 0; i < argNameList.length; i++) {
        let argName = argNameList[i];
        if (argName === language.silence) {
          args.push(context.getSilence());
        } else if (argName === language.boolParams) {
          if (!currentRule.hasBoolParams) {
            args.push('0x' + boolSetMask.toString(16));
          } else {
            let argValue = language.boolParams;
            if (boolClearMask) {
              argValue = argValue + ' & ~0x' + boolClearMask.toString(16);
            }
            if (boolSetMask) {
              if (boolClearMask) {
                argValue = '(' + argValue + ')';
              }
              argValue = argValue + ' | 0x' + boolSetMask.toString(16);
            }
            args.push(argValue);
          }
        } else {
          let paramName = language.paramNameFromArg(argName);
          if (newParamValues[paramName] === undefined) {
            if (currentRule.passedParams[paramName] === undefined) {
              args.push(makeInitialParamValue(rule.passedParams[paramName], true));
            } else {
              // Pass back through paramArgName() to drop the ampersand from the PHP declaration
              args.push(language.paramArgName(paramName));
            }
          } else {
            args.push(newParamValues[paramName]);
          }
        }
      }

      let funcName = addRule(node.name, context.getDiscard());
      if (context.getDiscard() && node.alwaysMatch) {
        result.block = [`${language.ruleFuncCall(funcName, args)};`];
        result.expression = 'true';
      } else {
        const reg = context.getResultReg(result);
        result.block = [`${reg} = ${language.ruleFuncCall(funcName, args)};`];
      }
      return result;
    },

    named: function(node, context) {
      var result = new Result();
      // Named rules suppress failure reporting in their subexpression; instead
      // any failure is going to be reported at this node.  (That is, if
      // `foo := bar bat` and we fail to match `bat` weren't not going to
      // report it as "didn't find bat" we're going to report it as "didn't
      // find foo", unless "foo" is a start rule.)
      result.append(recurse(node.expression, context.silence()));
      // but if there was a failure, report it as a failure of this rule.
      if (context.getSilence() !== 'true') {
        result.onFailure([makeFailCall({type: 'other', description: node.name}, context)]);
      }
      return result;
    },

    choice: function(node, context) {
      if (node.alternatives.length === 1) {
        return recurse(node.alternatives[0]);
      } else {
        var result = new Result();
        var label = 'choice_' + (++choiceIndex);
        result.block = [language.blockStart(label)];
        var i;
        var reg = context.getResultReg(result);
        var newContext = context.cloneEnv().resultReg(reg);
        for (i = 0; i < node.alternatives.length; i++) {
          result.append(recurse(node.alternatives[i], newContext), 2);
          if (i !== node.alternatives.length - 1) {
            result.onSuccess([language.gotoBlockEnd(label)]);
          }
        }
        result.resolveBlock();
        result.block.push(language.blockEnd(label));
        return result;
      }
    },

    action: function(node, context) {
      var result = new Result();
      var reg = context.getResultReg(result);
      var newContext = context.cloneEnv().discard();
      var saved = context.getPosRefState();
      var savedPos, freePos = [];
      if (saved !== null) {
        savedPos = saved.dst;
      } else {
        savedPos = allocPosReg();
        freePos = [ savedPos ];
        result.block = [`${savedPos} = ${language.currPos};`];
      }
      var subresult = recurse(node.expression, newContext);
      var funcId = makeActionFunc(node.code, newContext);
      result.append(subresult);
      if (node.alwaysMatch) {
        result.condition = 'true';
      }
      result.onSuccess([
        `${language.savedPos} = ${savedPos};`,
        `${reg} = ${makeActionCall(funcId, newContext)};`
      ]);
      freeReg(freePos, result);
      return result;
    },

    sequence: function(node, context) {
      if (node.elements.length === 1) {
        return recurse(node.elements[0], context);
      } else {
        var result = new Result();
        var resultReg = context.getResultReg(result);
        var label = `seq_${++seqIndex}`;
        result.block = [
          language.blockStart(label),
        ];
        var parts = [], partFree = [], i;
        var subcontext;

        if (!node.alwaysMatch) {
          context = context.savePosRefState(node, result);
        }
        subcontext = context;
        for (i = 0; i < node.elements.length; i++) {
          var subresult = recurse(node.elements[i], subcontext.noPassThru());
          partFree.push(...subresult.free);
          subresult.free = [];
          result.append(subresult);
          parts.push(subresult.expression);

          if (i === 0) {
            // After the first element, it's not safe to reuse parent pos/ref
            // state any more.
            subcontext = subcontext.resetPosRefState();
          }
          if (!(node.alwaysMatch || node.elements[i].alwaysMatch)) {
            if (i > 0) {
              // On failure, backtrack to the start of the sequence. If this is
              // the first element of the sequence, it's not necessary to backtrack
              // since failing subexpressions do not increment the position
              // nor affect reference parameters
              result.onFailure(context.restorePosRefState());
            }
            // On failure, set the result register and exit the sequence
            result.onFailure([
              `${resultReg} = ${language.failed};`,
              language.gotoBlockEnd(label)
            ]);
          }
          result.resolveBlock();
        }
        if (context.getDiscard()) {
          result.block.push(`${resultReg} = true;`);
        } else if (node.returnLast) {
          result.block.push(`${resultReg} = ${parts[parts.length-1]};`);
        } else {
          result.block.push(`${resultReg} = [${parts.join(',')}];`);
        }
        result.block.push(language.blockEnd(label));
        result.expression = resultReg;
        freeReg(partFree, result);
        context.freePosRefState(result);
        return result;
      }
    },

    labeled: function(node, context) {
      var reg = allocReg([]);
      var newContext = context.cloneEnv().resultReg(reg).discard(false);
      var subresult = recurse(node.expression, newContext);
      subresult.block.push(`// ${node.label} <- ${reg}`);
      context.env[node.label] = reg;
      context.envTypes[node.label] = 'value';
      return subresult;
    },

    labeled_param: function(node, context) {
      var result = new Result();
      if (node.isref) {
        context.env[node.label] = makeParamRefExpression(node.paramInfo);
      } else {
        context.env[node.label] = makeParamExpression(node.paramInfo);
      }
      context.envTypes[node.label] = node.paramInfo.type;
      result.condition = 'true';
      result.expression = language.assertionSuccess;
      return result;
    },

    text: function(node, context) {
      if (context.getDiscard()) {
        // text does nothing if we're already discarding
        return recurse(node.expression, context.cloneEnv());
      }
      var startPos = allocPosReg();
      var result = new Result();
      var reg = context.getResultReg(result);
      result.block = [`${startPos} = ${language.currPos};`];
      // Note that here we are 'discarding' but not 'silenced'
      result.append(recurse(node.expression, context.cloneEnv().discard()));
      result.onSuccess([
        `${reg} = ${language.inputSubstring(startPos, language.currPos)};`
      ]);
      result.onFailure([`${reg} = ${language.failed};`]);
      freeReg([startPos], result);
      return result;
    },

    simple_and: buildSimplePredicate,
    simple_not: buildSimplePredicate,

    optional: function(node, context) {
      var result = new Result();
      var reg = context.getResultReg(result);
      result.append(recurse(node.expression, context.cloneEnv()));
      result.onFailure([`${reg} = null;`]);
      // failure of the subexpression doesn't propagate back, so resolve the
      // block to prevent failure block concatenation.
      result.resolveBlock();
      // Always succeed
      result.condition = 'true';
      return result;
    },

    zero_or_more: function(node, context) {
      // Special case zero_or_more of a character class
      if (node.expression.type === 'class') {
        return buildRepeatedCharacterClass(node, context, false);
      }
      // Pseudocode for the non-discard case:
      //
      // let r1 = [];
      // while (true) {
      //   let r2 = expr();
      //   if (r2 !== failed) {
      //     r1.push(r2);
      //   } else {
      //     break;
      //   }
      // }
      //
      // Pseudocode for the discard case:
      //
      // while (true) {
      //   let r2 = expr();
      //   if (r2 === failed) {
      //      break;
      //   }
      // }
      // let r1 = true;

      var result = new Result();
      var resultReg = context.getResultReg(result);
      var partReg = allocReg([]);
      var newContext = context.resultReg(partReg).cloneEnv().resetPosRefState();
      var subresult = recurse(node.expression, newContext);
      if (!context.getDiscard()) {
        result.block.push(`${resultReg} = [];`);
        subresult.onSuccess([language.push(resultReg, partReg)]);
      }
      subresult.onFailure(['break;']);

      result.block.push(
        `for (;;) {`,
        indent2(subresult.resolveBlock().join('\n')),
        '}');

      freeReg(partReg, result);
      freeReg(subresult.free, result);
      // Always succeed
      result.condition = 'true';
      if (context.getDiscard()) {
        result.expression = 'true';
      }
      return result;
    },

    one_or_more: function(node, context) {
      // Special case one_or_more of a character class
      if (node.expression.type === 'class') {
        return buildRepeatedCharacterClass(node, context, true);
      }
      // Pseudocode for the non-discard case:
      //
      // let r1 = [];
      // while (true) {
      //   let r2 = expr();
      //   if (r2 !== failed) {
      //     r1.push(r2);
      //   } else {
      //     break;
      //   }
      // }
      // if (r1.length === 0) {
      //   r1 = failed;
      // }
      //
      // Pseudocode for the discard case:
      //
      // let r1 = failed;
      // while (true) {
      //   let r2 = expr();
      //   if (r2 !== failed) {
      //     r1 = true;
      //   } else {
      //     break;
      //   }
      // }

      var result = new Result();
      var resultReg = context.getResultReg(result);
      var initialFree = result.free;
      result.free = [];
      var partReg = allocReg([]);
      var newContext = context.resultReg(partReg).cloneEnv().resetPosRefState();
      var subresult = recurse(node.expression, newContext);
      if (!context.getDiscard()) {
        result.block.push(`${resultReg} = [];`);
        subresult.onSuccess([`${language.push(resultReg, partReg)}`]);
      } else {
        result.block.push(`${resultReg} = ${language.failed};`);
        subresult.onSuccess( [`${resultReg} = true;`]);
      }
      subresult.onFailure(['break;']);

      result.block.push(
        `for (;;) {`,
        indent2(subresult.resolveBlock().join('\n')),
        '}');
      if (!context.getDiscard()) {
        result.block.push(
          `if (${language.arrayLength(resultReg)} === 0) {`,
          `  ${resultReg} = ${language.failed};`,
          '}');
      }

      // Free the partReg and any registers which were allocated by the
      // subexpression and aggregated into result.free
      freeReg(partReg, result);
      freeReg(result.free, result);
      result.free = initialFree;

      return result;
    },

    semantic_and: buildSemanticPredicate,
    semantic_not: buildSemanticPredicate,

    parameter_and: buildParameterPredicate,
    parameter_not: buildParameterPredicate,

    literal: function(node, context) {
      var result = new Result();
      // Special case: empty string always matches
      if (node.value.length === 0) {
        result.expression = context.getDiscard() ? "true" : "''";
        result.condition = 'true';
        return result;
      }

      var reg = context.getResultReg(result);
      language.matchLiteral(node, reg, result, context.getDiscard());
      if (context.getSilence() !== 'true') {
        result.onFailure([
          makeFailCall({
            type: 'literal',
            value: node.value,
            description: js.stringify(node.value)
          }, context)]);
      }
      result.onFailure([`${reg} = ${language.failed};`]);
      return result;
    },

    class: function(node, context) {
      var result = new Result();
      var reg = context.getResultReg(result);
      var classExpr = classNode.caseSensitive(node);
      language.matchClass(classExpr, reg, result, context.getDiscard());
      result.onFailure([`${reg} = ${language.failed};`]);
      if (context.getSilence() !== 'true') {
        result.onFailure([makeFailCall({
          type: "class",
          value: node.rawText,
          description: node.rawText
        }, context)]);
      }
      return result;
    },

    any: function(node, context) {
      var result = new Result();
      var reg = context.getResultReg(result);
      result.condition = `${language.currPos} < ${language.inputLength}`;
      result.onSuccess(context.getDiscard() ? [
        `${language.advanceInputChar};`,
        `${reg} = true;`,
      ]: [
        `${reg} = ${language.consumeInputChar};`,
      ]);
      result.onFailure([`${reg} = ${language.failed};`]);
      if (context.getSilence() !== 'true') {
        result.onFailure([makeFailCall({
          type: "any",
          description: "any character"}, context)]);
      }
      return result;
    }
  });

  var generated = [];
  var defaultStartRule;

  var templateVars = {};

  templateVars['/*END_EXPECTATION*/'] = addExpectation({ type: "end", description: "end of input" });

  let startCases = [];
  for (let name of options.allowedStartRules) {
    let encName = language.stringify(name);
    let funcName = addRule(name, false);
    if (defaultStartRule === undefined) {
      defaultStartRule = name;
    }

    startCases.push(
      name === defaultStartRule ? "case '(DEFAULT)':" : '',
      `case ${encName}:`,
      `  ${language.result} = ${language.ruleFuncCall(funcName, getStartArgs(name))};`,
      `  break;`);
  }
  templateVars['/*START_CASES*/'] = startCases.join('\n');

  let streamCases = [];
  for (let i = 0; i < options.allowedStreamRules.length; i++) {
    let name = options.allowedStreamRules[i];
    let encName = language.stringify(name);
    let rule = asts.findRule(ast, name);
    let funcName = language.ruleFuncName(name, false, true);
    generated.push(generate(rule, funcName, false, true));
    streamCases.push(
      i === 0 ? "case '(DEFAULT)':" : '',
      `case ${encName}:`,
      `  return ${language.ruleFuncCall(funcName, getStartArgs(name))};`,
      `  break;`
    );
  }
  templateVars['/*STREAM_CASES*/'] = streamCases.join('\n');

  while (rulesToGenerate.length) {
    var ruleInfo = rulesToGenerate.shift();
    if (ruleInfo.funcName in generatedRuleNames) {
      continue;
    }
    generatedRuleNames[ruleInfo.funcName] = true;
    var rule = asts.findRule(ast, ruleInfo.name);
    generated.push(generate(rule, ruleInfo.funcName, ruleInfo.discard, false));
  }

  templateVars['/*EXPECTATIONS*/'] = expectations.join('\n');
  templateVars['/*ACTIONS*/'] = actions.join('\n');

  let initializer;
  if (!ast.initializer) {
    initializer = [];
  } else if (Array.isArray(ast.initializer)) {
    initializer = ast.initializer;
  } else {
    initializer = [ast.initializer];
  }

  if (initializer.length === 0) {
    templateVars['/*INITIALIZER0*/'] = '';
    templateVars['/*INITIALIZER*/'] = '';
  } else if (initializer.length === 1) {
    templateVars['/*INITIALIZER0*/'] = '';
    templateVars['/*INITIALIZER*/'] = initializer[0].code;
  } else {
    templateVars['/*INITIALIZER0*/'] = initializer[0].code;
    templateVars['/*INITIALIZER*/'] = initializer[1].code;
  }
  templateVars['/*GENERATED*/'] = generated.join('\n');

  templateVars['CLASS_NAME'] = className;
  templateVars['/*NAMESPACE*/'] = namespace;

  var cacheInitCode = '';
  var cacheInitHook;
  if (options.cache) {
    cacheInitHook = options.cacheInitHook || initCache;
    cacheInitCode = indent2(cacheInitHook({
      ruleCount: ast.rules.length,
      variantCount: 2
    }));
  }
  templateVars['/*CACHE_INIT*/'] = cacheInitCode;

  var headerComment = '';
  if (options.headerComment) {
    headerComment = options.headerComment + '\n';
  } else {
    headerComment = '/*\n' +
                    ' * Generated by WikiPEG\n' +
                    ' */\n\n';
  }
  templateVars['/*HEADER_COMMENT*/'] = headerComment;

  var template;
  if (options.language === 'php') {
    template = fs.readFileSync(__dirname + '/../../runtime/template.php', 'utf8');
    if (options.cache) {
      templateVars['/*CACHE_ENTRY_BEGIN*/'] = '';
      templateVars['/*CACHE_ENTRY_END*/'] = '';
      templateVars['/*CACHE_ENTRY_DECLARE*/'] = '';
      templateVars['/*CACHE_ENTRY_ARGS*/'] = '';
      templateVars['/*CACHE_ENTRY_INIT*/'] = '';
      references.forEach(function(name) {
        templateVars['/*CACHE_ENTRY_DECLARE*/'] += `\tpublic $${name};\n`;
        templateVars['/*CACHE_ENTRY_ARGS*/'] += `, $${name}`;
        templateVars['/*CACHE_ENTRY_INIT*/'] += `\t\t$this->${name} = $${name};\n`;
      });
    } else {
      template = template.replace(
        /\/\*CACHE_ENTRY_BEGIN\*\/[^]+?\/\*CACHE_ENTRY_END\*\//, ''
      );
    }
  } else {
    template = fs.readFileSync(__dirname + '/../../runtime/template.js', 'utf8');
  }
  var code = expandTemplate(template, templateVars);
  ast.code = code;
}

module.exports = generateJavascript;
