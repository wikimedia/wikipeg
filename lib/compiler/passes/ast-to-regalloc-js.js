"use strict";

var arrays  = require("../../utils/arrays"),
    js      = require("../javascript"),
    visitor = require("../visitor"),
    objects = require('../../utils/objects'),
    asts    = require("../asts");

if (typeof window === 'undefined') {
  var fs = require('fs');
  var readSource = function (moduleName) {
    var fileName = __dirname + '/' + moduleName + '.js';
    return fs.readFileSync(fileName, 'utf8');
  };
}

function initCache(/*opts*/) {
  return 'var peg$resultsCache = {}';
}

function generateCacheRule(opts) {
  var keyParts = [
    opts.variantIndex + opts.variantCount * ( opts.ruleIndex + opts.ruleCount ),
    opts.startPos
  ];
  if (opts.params.length) {
    keyParts = keyParts.concat(opts.params);
  }
  var key;
  if (keyParts.length === 1) {
    key = keyParts[0];
  } else {
    key = '[' + keyParts.join(', ') + '].join(":")';
  }
  return {
    start: [
      'var key = ' + key + ',',
      '    cached = peg$resultsCache[key];',
      opts.saveRefs,
      '  if (cached) {',
      '    peg$currPos = cached.nextPos',
      opts.loadRefs,
      '    return cached.result;',
      '  }',
    ].join('\n'),
    store: [
      'peg$resultsCache[key] = {',
      '  nextPos: peg$currPos, ',
      '  result: ', opts.result,
      opts.storeRefs,
      '};'].join('')
  };
}

function generateJavascript(ast, options) {
  var rulesToGenerate = [];
  var generatedRuleNames = {};

  /**
   * An array of blocks which define numbered variables, to be added to the top
   * of peg$parse
   */
  var consts = [];

  /**
   * A map of definition code to variable number, for deduplication of consts
   */
  var constIndexes = {};

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

  function indent2(code)  { return code.replace(/^(.+)$/gm, '  $1');       }
  function indent4(code)  { return code.replace(/^(.+)$/gm, '    $1');       }

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

    this.resultReg_ = false;
    this.silence_ = 'silence';
    this.discard_ = false;
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
        result.block.push(this.resultReg_ + ' = ' + result.expression + ';');
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
    }

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
          this.block.push(['if (', this.expression, '!== peg$FAILED) {'].join(''));
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
          this.block.push(['if (', this.expression, ' === peg$FAILED) {'].join(''));
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

  function addRule(name, discard) {
    var funcName = ['peg$', discard ? 'discard' : 'parse', name].join('');
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
      reg = 'r' + (++regIndex);
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
      reg = 'p' + (++regIndex);
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
      if (/^p/.test(reg[i])) {
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
  function addConst(obj) {
    var str = js.stringify(obj);
    if (str in constIndexes) {
      return 'peg$c' + constIndexes[str];
    } else {
      var index = consts.length;
      constIndexes[str] = index;
      consts.push(['var peg$c', index, ' = ', str, ';'].join(''));
      return 'peg$c' + index;
    }
  }

  /**
   * Create a function definition for code which was specified in the grammar,
   * and return the resulting function name.
   */
  function makeActionFunc(code, context) {
    code = '(' + objects.keys(context.env).join(', ') + ') {\n'
        + code + '\n' + '}';
    if (code in constIndexes) {
      return 'peg$c' + constIndexes[code];
    } else {
      var index = consts.length;
      constIndexes[code] = index;
      consts.push('function peg$c' + index + code);
      return 'peg$c' + index;
    }
  }

  /**
   * Return an expression which calls code which was defined in the grammar.
   * func is the name of the function returned by makeActionFunc().
   */
  function makeActionCall(func, context) {
    return [func, '(', objects.values(context.env).join(','), ')'].join('');
  }

  /**
   * Return a JS block which calls peg$fail, conditional on the current
   * value of the silence expression. If silence is known to be true at
   * compile time, this returns an empty string.
   */
  function makeFailCall(value, context) {
    var silence = context.getSilence();
    if (silence === 'true') {
      return '';
    }
    var constValue = addConst(value);
    var call = ['peg$fail(', constValue, ')'].join('');
    if (silence === 'false') {
      return call + ';';
    } else {
      return ['if (!', silence, ') {', call, ';}'].join('');
    }
  }

  /**
   * Make an expression which gives the value of a parameter
   */
  function makeParamExpression(info) {
    if (!currentRule || !currentRule.passedParams[info.name]) {
      return makeInitialParamValue(info);
    }
    if (info.type === undefined) {
      throw new Error("Undefined parameter type");
    } else if (info.type === 'boolean') {
      return [
        '/*', info.name, '*/',
        '(boolParams & 0x', (1 << info.index).toString(16), ') !== 0'].join('');
    } else if (info.type === 'reference') {
      return 'param_' + info.name + '.value';
    } else {
      return 'param_' + info.name;
    }
  }

  /**
   * Return an expression which gives the parameter reference object
   */
  function makeParamRefExpression(info) {
    if (info.type !== 'reference') {
      throw new Error('Cannot make reference object for non-reference parameter ' + info.name);
    }
    return 'param_' + info.name;
  }

  /**
   * Get an expression giving the initial value of a parameter
   */
  function makeInitialParamValue(info) {
    let type = info.type;
    if (type === 'boolean') {
      return 'false';
    } else if (type === 'integer') {
      return '0';
    } else if (type === 'string') {
      return '""';
    } else if (type === 'reference') {
      return 'new peg$Reference(null)';
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
    var posReg = allocPosReg();
    var reg = context.getResultReg(result);
    result.block = [posReg + ' = peg$currPos;'];
    var newContext = context.silence().cloneEnv().discard();
    result.append(recurse(node.expression, newContext));
    if (negate) {
      result.resolveBlock();
      result.condition = reg + ' === peg$FAILED';
      result.onFailure([reg + ' = peg$FAILED;']);
    }
    result.onSuccess([reg + ' = void 0;']);
    if (negate) {
      result.onFailure([['peg$currPos = ', posReg, ';'].join('')]);
    } else {
      result.onSuccess([['peg$currPos = ', posReg, ';'].join('')]);
    }
    freeReg(posReg, result);
    return result;
  }

  /**
   * Handler for semantic_and and semantic_not
   */
  function buildSemanticPredicate(node, context) {
    var result = new Result();
    var negate = node.type === 'semantic_not';
    var reg = context.getResultReg(result);
    result.block = ['peg$savedPos = peg$currPos;'];
    var func = makeActionFunc(node.code, context);
    var call = makeActionCall(func, context);
    result.block = [
      'peg$savedPos = peg$currPos;',
      [reg, ' = ', call, ';'].join('')
    ];
    if (negate) {
      result.condition = '!' + reg;
    } else {
      result.condition = reg;
    }
    result.onSuccess([reg + ' = void 0;']);
    result.onFailure([reg + ' = peg$FAILED;']);
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
      result.condition = '!(' + paramExpression + ')';
    } else if (!node.paramInfo.value || node.paramInfo.value.type === 'boolean') {
      result.condition = paramExpression;
    } else {
      result.condition = '!!(' + paramExpression + ')';
    }
    result.onSuccess([reg + ' = void 0;']);
    result.onFailure([reg + ' = peg$FAILED;']);
    return result;
  }

  function makeExceptionThrower() {
    return [
      'throw peg$buildException(',
      '  null,',
      '  peg$maxFailExpected,',
      '  peg$maxFailPos < input.length ? input.charAt(peg$maxFailPos) : null,',
      '  peg$maxFailPos < input.length',
      '    ? peg$computeLocation(peg$maxFailPos, peg$maxFailPos + 1)',
      '    : peg$computeLocation(peg$maxFailPos, peg$maxFailPos)',
      ');'].join('\n');
  }

  function makeIteratorExpression(node, context) {
    if (node.type !== 'zero_or_more') {
      throw new Error('Iterable rules must be a single starred subexpression');
    }
    var result = recurse(node.expression, context);
    result.onSuccess(['return {done: false, value: ' + result.expression + '};']);
    result.onFailure([
      'if (peg$currPos < input.length) {',
      '  peg$fail({ type: "end", description: "end of input ( " + input.length + ")" });',
      indent2(makeExceptionThrower()),
      '}',
      'return {done: true};'
    ]);
    return [
      '{',
      '  next: function() {',
      indent4(result.resolveBlock().join('\n')),
      '  }',
      '}'].join('\n');
  }

  /**
   * Get the names of the arguments to the given rule function
   */
  function getRuleArgNames(rule) {
    var args = ['silence'];

    if (rule.hasBoolParams) {
      args.push('boolParams');
    }

    for (let name in rule.passedParams) {
      let type = rule.passedParams[name].type;
      if (type === undefined || type === 'boolean') {
        continue;
      } else {
        args.push('param_' + name);
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
    var argNames = getRuleArgNames(rule);
    var args = [];

    for (let i = 0; i < argNames.length; i++) {
      let argName = argNames[i];
      if (argName === 'silence') {
        args.push(false);
      } else if (argName === 'boolParams') {
        args.push('0');
      } else {
        let matches = /^param_(.*)$/.exec(argName);
        if (!matches) {
          throw new Error('Unexpected rule argument name: ' + argName);
        }
        let paramName = matches[1];
        let type = rule.passedParams[paramName].type;
        if (type === 'integer') {
          args.push('0');
        } else if (type === 'boolean') {
          args.push('false');
        } else if (type === 'string') {
          args.push('""');
        } else if (type === 'reference') {
          args.push('new peg$Reference(null)');
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
      args.push('boolParams & 0x' + boolMask.toString(16));
    }

    for (let name in rule.passedParams) {
      let type = rule.passedParams[name].type;
      if (type === undefined || type === 'boolean') {
        continue;
      } else if (type === 'reference') {
        args.push('param_' + name + '.value');
      } else {
        args.push('param_' + name);
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
        block.push(
          [
            '    if (cached.refs.', name, ' !== undefined) ',
            'param_', name, '.value = cached.refs.', name, ';'
          ].join('')
        );
      }
    }
    return block;
  }

  /**
   * Get a block which determines which refs have changed, if any. Any changed
   * refs are stored in cached.refs.
   */
  function getCacheStoreRefs(rule) {
    var block = [];
    for (let name in rule.passedParams) {
      if (rule.passedParams[name].type === 'reference') {
        block.push([
          '  if (saved_', name, ' !== param_', name, '.value) ',
          'cached.refs.', name, ' = param_', name, '.value;'
        ].join(''));
      }
    }
    return block;
  }

  /**
   * Get a block which saves ref values to a temporary variable for later
   * comparison in getCacheStoreRefs().
   */
  function getCacheSaveRefs(rule) {
    var parts = [];
    for (let name in rule.passedParams) {
      if (rule.passedParams[name].type === 'reference') {
        parts.push(['saved_', name, '=param_', name, '.value'].join(''));
      }
    }
    if (parts.length) {
      return ['  var ' + parts.join(', ') + ';'];
    } else {
      return [];
    }
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

      // Generate the Result
      var context = (new Context()).discard(discard);
      var result;
      if (iterable) {
        result = makeIteratorExpression(node.expression, context);
      } else {
        result = recurse(node.expression, context);
        result.resolveBlock();
      }

      // Make the function body
      var body = [];
      if (allocatedRegList.length) {
        body.push(['var ', allocatedRegList.join(','), ';'].join(''));
      }
      if (iterable) {
        body.push(
          ['return ', result, ';'].join(''),
          '');
      } else {
        var ruleIndexCode = asts.indexOfRule(ast, node.name);
        var cacheBits;
        if (options.cache) {
          var cacheFunc = options.cacheRuleHook || generateCacheRule;
          cacheBits = cacheFunc({
            startPos: 'peg$currPos',
            endPos: 'peg$currPos',
            ruleIndex: ruleIndexCode,
            ruleCount: ast.rules.length,
            variantIndex: discard ? 1 : 0,
            variantCount: 2,
            variantName: discard ? 'discard' : 'normal',
            result: result.expression,
            params: getParamsForCacheKey(node),
            loadRefs: getCacheLoadRefs(node),
            saveRefs: getCacheSaveRefs(node),
            storeRefs: getCacheStoreRefs(node),
          });
          body.push(cacheBits.start);
        }
        body.push(result.block.join('\n'));

        if (options.cache) {
          body.push(cacheBits.store);
        }
        body.push(
          ['return ', result.expression, ';'].join(''),
          '');
      }
      body = indent2(body.join('\n'));

      let argNames = getRuleArgNames(node);
      let args = argNames.join(', ');

      // Wrap the function body in a trace decorator if requested.
      if (!iterable && options.trace) {
        var closure = ['function(', args, ') {\n', body, '}'].join('');
        if (options.trace) {
          closure = [
            'peg$traceDecorator(', [
              closure, js.stringify(node.name), JSON.stringify(argNames),
            ].join(', '),
            ')'
          ].join('');
        }
        return ['var ', funcName, ' = ', closure, ';'].join('');
      } else {
        return ['function ', funcName, '(', args, ') {\n', body, '}'].join('');
      }
    },

    rule_ref: function(node, context) {
      var result = new Result();
      var reg = context.getResultReg(result);

      var newParamValues = {};
      var boolSetMask = 0;
      var boolClearMask = 0;
      for (let i = 0; i < node.assignments.length; i++) {
        let assignment = node.assignments[i];
        let newValue;

        if (assignment.isref) {
          if (assignment.type === 'increment') {
            newValue = ['param_', assignment.name, '.value+', assignment.value].join('');
          } else if (assignment.type === 'boolean') {
            newValue = assignment.value ? 'true' : 'false';
          } else if (assignment.type === 'string') {
            newValue = js.stringify(assignment.value);
          } else {
            newValue = assignment.value;
          }
          newParamValues[assignment.name] = ['new peg$Reference(', newValue, ')'].join('');
        } else {
          if (assignment.type === 'boolean') {
            if (assignment.value) {
              boolSetMask |= 1 << assignment.paramInfo.index;
            } else {
              boolClearMask |= 1 << assignment.paramInfo.index;
            }
          } else {
            if (assignment.type === 'increment') {
              newValue = ['param_', assignment.name, '+', assignment.value].join('');
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
      let argNameList = getRuleArgNames(rule);
      let args = [];
      for (let i = 0; i < argNameList.length; i++) {
        let argName = argNameList[i];
        if (argName === 'silence') {
          args.push(context.getSilence());
        } else if (argName === 'boolParams') {
          if (!currentRule.hasBoolParams) {
            args.push('0x' + boolSetMask.toString(16));
          } else {
            let argValue = 'boolParams';
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
          let matches = /^param_(.*)$/.exec(argName);
          if (!matches) {
            throw new Error('Unexpected rule argument name: ' + argName);
          }
          let paramName = matches[1];
          if (newParamValues[paramName] === undefined) {
            if (currentRule.passedParams[paramName] === undefined) {
              args.push(makeInitialParamValue(rule.passedParams[paramName]));
            } else {
              args.push(argName);
            }
          } else {
            args.push(newParamValues[paramName]);
          }
        }
      }

      let funcName = addRule(node.name, context.getDiscard());
      result.block = [
        [reg, ' = ', funcName, '(', args.join(', '), ');'].join('')];
      return result;
    },

    named: function(node, context) {
      var result = new Result();
      result.append(recurse(node.expression, context.silence()));
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
        result.block = [label + ': {'];
        var i;
        var reg = context.getResultReg(result);
        var newContext = context.cloneEnv().resultReg(reg);
        for (i = 0; i < node.alternatives.length; i++) {
          result.append(recurse(node.alternatives[i], newContext), 2);
          if (i !== node.alternatives.length - 1) {
            result.onSuccess([['break ', label, ';'].join('')]);
          }
        }
        result.resolveBlock();
        result.block.push('} // ' + label);
        return result;
      }
    },

    action: function(node, context) {
      var result = new Result();
      var reg = context.getResultReg(result);
      var newContext = context.cloneEnv().discard();
      var savedPos = allocPosReg();
      var subresult = recurse(node.expression, newContext);
      var func = makeActionFunc(node.code, newContext);
      result.block = [[savedPos, ' = peg$currPos;'].join('')];
      result.append(subresult);
      result.onSuccess([
        ['peg$savedPos = ', savedPos, ';'].join(''),
        [reg, ' = ', makeActionCall(func, newContext), ';'].join('')
      ]);
      return result;
    },

    sequence: function(node, context) {
      if (node.elements.length === 1) {
        return recurse(node.elements[0], context);
      } else {
        var posReg = allocPosReg();
        var result = new Result();
        var resultReg = context.getResultReg(result);
        var label = 'seq_' + (++seqIndex);
        result.block = [
          label + ': {',
          [posReg + ' = peg$currPos;'].join('')];
        var parts = [], i;

        for (i = 0; i < node.elements.length; i++) {
          var subresult = recurse(node.elements[i], context.noPassThru());
          subresult.free = [];
          result.append(subresult);
          parts.push(subresult.expression);

          // On failure, backtrack to the start of the sequence. If this is
          // the first element of the sequence, it's not necessary to backtrack
          // since failing subexpressions do not increment the position.
          if (i > 0) {
            result.onFailure([['peg$currPos = ', posReg, ';'].join('')]);
          }
          // On failure, set the result register and exit the sequence
          result.onFailure([
            [resultReg, ' = peg$FAILED;'].join(''),
            ['break ', label, ';'].join('')
          ]);
          result.resolveBlock();
        }
        if (context.getDiscard()) {
          result.block.push(resultReg + ' = true;');
        } else {
          result.block.push(
            [resultReg, ' = [', parts.join(','), '];'].join(''));
        }
        result.block.push('} // ' + label );
        result.expression = resultReg;
        freeReg(result.free.concat([posReg]), result);
        result.free = [];
        return result;
      }
    },

    labeled: function(node, context) {
      var reg = allocReg([]);
      context.env[node.label] = reg;
      var newContext = context.cloneEnv().resultReg(reg).discard(false);
      var subresult = recurse(node.expression, newContext);
      subresult.block.push(['// ', node.label, ' <- ', reg].join(''));
      return subresult;
    },

    labeled_param: function(node, context) {
      var result = new Result();
      if (node.isref) {
        context.env[node.label] = makeParamRefExpression(node.paramInfo);
      } else {
        context.env[node.label] = makeParamExpression(node.paramInfo);
      }
      result.condition = 'true';
      result.expression = '(void 0)';
      return result;
    },

    text: function(node, context) {
      var startPos = allocPosReg();
      var result = new Result();
      var reg = context.getResultReg(result);
      result.block = [startPos + ' = peg$currPos;'];
      result.append(recurse(node.expression, context.cloneEnv().discard()));
      result.onSuccess([
        [reg, ' = input.substring(', startPos, ',peg$currPos);'].join('')
      ]);
      result.onFailure([reg + ' = peg$FAILED;']);
      freeReg([startPos], result);
      return result;
    },

    simple_and: buildSimplePredicate,
    simple_not: buildSimplePredicate,

    optional: function(node, context) {
      var result = new Result();
      var reg = context.getResultReg(result);
      result.append(recurse(node.expression, context.cloneEnv()));
      result.onFailure([reg + ' = null;']);
      // failure of the subexpression doesn't propagate back, so resolve the
      // block to prevent failure block concatenation.
      result.resolveBlock();
      // Always succeed
      result.condition = 'true';
      return result;
    },

    zero_or_more: function(node, context) {
      var result = new Result();
      var resultReg = context.getResultReg(result);
      var partReg = allocReg([]);
      var newContext = context.resultReg(partReg).cloneEnv();
      var subresult = recurse(node.expression, newContext);
      if (!context.getDiscard()) {
        result.block.push(resultReg + ' = [];');
      }
      result.block = result.block.concat(subresult.resolveBlock());

      // Generate the subresult again for the loop body
      subresult = recurse(node.expression, newContext);
      result.block.push(['while (', partReg, ' !== peg$FAILED) {'].join(''));
      if (!context.getDiscard()) {
        result.block.push(['  ', resultReg, '.push(', partReg, ');'].join(''));
      }
      result.block.push(
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
      var result = new Result();
      var resultReg = context.getResultReg(result);
      var initialFree = result.free;
      result.free = [];
      var partReg = allocReg([]);
      var newContext = context.resultReg(partReg).cloneEnv();
      var subresult = recurse(node.expression, newContext);
      result.append(subresult);
      result.onFailure([[resultReg, ' = peg$FAILED;'].join('')]);

      // Generate the subresult again for the loop body
      subresult = recurse(node.expression, newContext);
      var successBlock = [];
      if (context.getDiscard()) {
        successBlock.push(resultReg + ' = true;');
      } else {
        successBlock.push(resultReg + ' = [];');
      }
      successBlock.push(['while (', partReg, ' !== peg$FAILED) {'].join(''));
      if (!context.getDiscard()) {
        successBlock.push(['  ', resultReg, '.push(', partReg, ');'].join(''));
      }
      successBlock.push(
        indent2(subresult.resolveBlock().join('\n')),
        '}');
      result.onSuccess(successBlock);

      // Prevent propagation of the success condition and expression of the
      // last executed subexpression, which were set by result.append().
      result.resolveBlock();
      result.expression = resultReg;

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
        result.expression = "''";
        result.condition = 'true';
        return result;
      }

      var reg = context.getResultReg(result);
      if (node.value.length === 1 && !node.ignoreCase) {
        result.condition = 'input.charCodeAt(peg$currPos) === ' + node.value.charCodeAt(0);
        result.onSuccess([[reg, ' = ', js.stringify(node.value), ';'].join('')]);
      } else {
        if (node.value.length === 1) {
          result.block.push([reg, ' = input.charAt(peg$currPos);'].join(''));
        } else {
          result.block.push([reg, ' = ',
            'input.substr(peg$currPos,', node.value.length, ');'].join(''));
        }
        if (node.ignoreCase) {
          result.condition = [reg, '.toLowerCase() === ',
            js.stringify(node.value)].join('');
        } else {
          result.condition = [reg, ' === ',
            js.stringify(node.value)].join('');
        }
      }
      result.onSuccess([['peg$currPos += ', node.value.length, ';'].join('')]);
      if (context.getSilence() !== 'true') {
        result.onFailure([
          makeFailCall({
            type: 'literal',
            value: node.value,
            description: js.stringify(node.value)
          }, context)]);
      }
      result.onFailure([reg + ' = peg$FAILED;']);
      return result;
    },

    "class": function(node, context) {
      var regexp;
      if (node.parts.length > 0) {
        regexp = '/^['
          + (node.inverted ? '^' : '')
          + arrays.map(node.parts, function(part) {
            return part instanceof Array
              ? js.regexpClassEscape(part[0])
                + '-'
                + js.regexpClassEscape(part[1])
              : js.regexpClassEscape(part);
          }).join('')
          + ']/' + (node.ignoreCase ? 'i' : '');
      } else {
        /*
         * IE considers regexps /[]/ and /[^]/ as syntactically invalid, so we
         * translate them into euqivalents it can handle.
         */
        regexp = node.inverted ? '/^[\\S\\s]/' : '/^(?!)/';
      }
      var result = new Result();
      var reg = context.getResultReg(result);
      result.block = [reg + ' = input.charAt(peg$currPos);'];
      result.condition = [regexp, '.test(', reg, ')'].join('');
      result.onSuccess(['peg$currPos++;']);
      result.onFailure([reg + ' = peg$FAILED;']);
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
      result.condition = 'peg$currPos < input.length';
      result.onSuccess([reg + ' = input.charAt(peg$currPos++);']);
      result.onFailure([reg + ' = peg$FAILED;']);
      if (context.getSilence() !== 'true') {
        result.onFailure([makeFailCall({
          type: "any",
          description: "any character"}, context)]);
      }
      return result;
    }
  });

  var generated = [];
  var startRules = [];
  var streamRules = [];
  var defaultStartRule;

  arrays.each(options.allowedStartRules, function(name) {
    let func = [
      name, ': function() { return ',
      addRule(name, false),
      '(',
      getStartArgs(name).join(', '),
      '); }'
    ].join('');
    startRules.push(func);
    if (defaultStartRule === undefined) {
      defaultStartRule = 'peg$startRuleFunctions.' + name;
    }
  });

  arrays.each(options.allowedStreamRules, function(name) {
    var rule = asts.findRule(ast, name);
    generated.push(generate(rule, 'peg$stream' + name, false, true));
    streamRules.push(
      [
        name, ': function() {',
        'return peg$stream' + name,
        '(',
        getStartArgs(name).join(', '),
        ');}',
      ].join('')
    );
  });

  while (rulesToGenerate.length) {
    var ruleInfo = rulesToGenerate.shift();
    if (ruleInfo.funcName in generatedRuleNames) {
      continue;
    }
    generatedRuleNames[ruleInfo.funcName] = true;
    var rule = asts.findRule(ast, ruleInfo.name);
    generated.push(generate(rule, ruleInfo.funcName, ruleInfo.discard, false));
  }


  var code = readSource('../../runtime/wrapper');
  var parts = [];

  var cacheInitCode = '';
  var cacheInitHook;
  if (options.cache) {
    cacheInitHook = options.cacheInitHook || initCache;
    cacheInitCode = indent2(cacheInitHook({
      ruleCount: ast.rules.length,
      variantCount: 2
    }));
  }

  parts.push('function peg$parse(input) {',
    '  var options = arguments.length > 1 ? arguments[1] : {},',
    '      parser = this,',
    '      peg$currPos = 0,',
    '      peg$savedPos = 0,',
    '      peg$FAILED = {};',
    '',
    cacheInitCode,
    '',
    indent2(readSource('../../runtime/common-helpers')),
    '');

  if (options.trace) {
    parts.push(
      indent2(readSource('../../runtime/trace-helpers')),
      '');
  }

  parts.push(
    '// consts',
    consts.join('\n'),
    '',
    '// generated',
    generated.join('\n\n'),
    '',
    '  // start',
    '',
    '  var peg$startRuleFunctions = {' + startRules.join(',\n        ') + '},',
    '      peg$startRuleFunction = ' + defaultStartRule + ',',
    '      peg$streamRuleFunctions = {' + streamRules.join(',\n        ') + '},',
    '      peg$streamRuleFunction;',
    '');

  if (options.allowedStreamRules.length) {
    parts.push(
      '  if (options.stream) {',
      '    peg$streamRuleFunction = peg$stream' + options.allowedStreamRules[0] + ';',
      '    if ("startRule" in options) {',
      '      if (!(options.startRule in peg$streamRuleFunctions)) {',
      '        throw new Error("Can\'t stream rule \\"" + options.startRule + "\\".");',
      '      }',
      '      peg$streamRuleFunction = peg$streamRuleFunctions[options.startRule];',
      '    }',
      '  } else if ("startRule" in options) {',
      '    if (!(options.startRule in peg$startRuleFunctions)) {',
      '      throw new Error("Can\'t start parsing from rule \\"" + options.startRule + "\\".");',
      '    }',
      '',
      '    peg$startRuleFunction = peg$startRuleFunctions[options.startRule];',
      '  }');
  } else {
    parts.push(
      '  if ("startRule" in options) {',
      '    if (!(options.startRule in peg$startRuleFunctions)) {',
      '      throw new Error("Can\'t start parsing from rule \\"" + options.startRule + "\\".");',
      '    }',
      '    peg$startRuleFunction = peg$startRuleFunctions[options.startRule];',
      '  }');
  }

  if (options.trace) {
    parts.push(
      '  var peg$tracer = "tracer" in options ? options.tracer : new peg$DefaultTracer();');
  }
  if (ast.initializer) {
    parts.push(indent2(ast.initializer.code));
    parts.push('');
  }

  parts.push(
    '  peg$currPos = 0;',
    '',
    '  if (options.stream) {',
    '    return peg$streamRuleFunction();',
    '  }',
    '',
    '  var peg$result = peg$startRuleFunction();',
    '',
    '  if (peg$result !== peg$FAILED && peg$currPos === input.length) {',
    '    return peg$result;',
    '  } else {',
    '    if (peg$result !== peg$FAILED && peg$currPos < input.length) {',
    '      peg$fail({ type: "end", description: "end of input" });',
    '    }',
    '',
    indent4(makeExceptionThrower()),
    '  }',
    '}',
    'exports.parse = peg$parse;');

  code = code.replace('/*$PARSER*/', function() {return indent2(parts.join('\n'));});
  code = code.replace('/*$TRACER*/', function() {
    return options.trace ? readSource('../../runtime/tracer') : '';
  });
  ast.code = code;
}

generateJavascript.defaultCacheRuleHook = generateCacheRule;
generateJavascript.defaultCacheInitHook = initCache;

module.exports = generateJavascript;
