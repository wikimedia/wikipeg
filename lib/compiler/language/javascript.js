function hex(ch) { return ch.charCodeAt(0).toString(16).toUpperCase(); }

let javascript = {
  silence: 'silence',
  boolParams: 'boolParams',
  failed: 'peg$FAILED',
  currPos: 'peg$currPos',
  savedPos: 'peg$savedPos',
  maxFailExpected: 'peg$maxFailExpected',
  maxFailPos: 'peg$maxFailPos',
  inputLength: 'input.length',
  assertionSuccess: 'void 0',
  advanceInputChar: 'peg$currPos++',
  consumeInputChar: 'input.charAt(peg$currPos++)',
  result: 'peg$result',
  actionArgPrefix: '',

  regName(index) {
    return `r${index}`;
  },

  posRegName(index) {
    return `p${index}`;
  },

  getRegType(regName) {
    return regName.charAt(0);
  },

  ruleFuncName(name, discard, iterable) {
    if (iterable) {
      return 'peg$stream' + name;
    } else if (discard) {
      return 'peg$discard' + name;
    } else {
      return 'peg$parse' + name;
    }
  },

  ruleFuncCall(name, args) {
    return `${name}(${args.join(', ')})`;
  },

  ruleFuncDeclaration(funcName, args, body) {
    return `function ${funcName}(${args.join(', ')}) {\n${body}\n}`;
  },

  streamFuncDeclaration(funcName, args, body) {
    return `function* ${funcName}(${args.join(', ')}) {\n${body}\n}`;
  },

  varDeclaration(vars) {
    return [`var ${vars.join(',')};`];
  },

  expectationExpression(index) {
    return `peg$c${index}`;
  },

  expectationDeclaration(index, expression) {
    return `var peg$c${index} = ${expression};`;
  },

  actionDeclaration(index, argNames, code) {
    return `function peg$a${index}(${argNames.join(', ')}) {\n${code}\n}`;
  },

  actionCall(index, args) {
    return `peg$a${index}(${args.join(', ')})`;
  },

  libraryCall(name, args = []) {
    return `peg$${name}(${args.join(', ')})`;
  },

  paramArgName(name) {
    return `param_${name}`;
  },

  refParamArgDeclarator(name) {
    return `param_${name}`;
  },

  paramNameFromArg(argName) {
    let matches = /^param_(.*)$/.exec(argName);
    if (!matches) {
      throw new Error('Unexpected rule argument name: ' + argName);
    }
    return matches[1];
  },

  refParamValue(name) {
    return `param_${name}.value`;
  },

  newRef(value /*, index*/) {
    return `new peg$Reference(${value})`;
  },

  valueArgActionDeclarator(name) {
    return name;
  },

  refArgActionDeclarator(name) {
    return name;
  },

  inputSubstring(start, end) {
    return `input.substring(${start}, ${end})`;
  },

  blockStart(label) {
    return `${label}: {`;
  },

  blockEnd(label) {
    return `} // ${label}`;
  },

  gotoBlockEnd(label) {
    return `break ${label};`;
  },

  push(array, ...rest) {
    return `${array}.push(${rest.join(', ')});`;
  },

  arrayLength(expression) {
    return `${expression}.length`;
  },

  toBool(expression) {
    return `!!(${expression})`;
  },

  stringify(v) {
    return JSON.stringify(v)
      .replace(/[\x80-\xFF]/g, function(ch) { return '\\x'  + hex(ch); })
      .replace(/[\u0100-\u0FFF]/g,      function(ch) { return '\\u0' + hex(ch); })
      .replace(/[\u1000-\uFFFF]/g,      function(ch) { return '\\u'  + hex(ch); });
  },

  regexpClassEscape(s) {
    /*
     * Based on ECMA-262, 5th ed., 7.8.5 & 15.10.1.
     *
     * For portability, we also escape all control and non-ASCII characters.
     */
    return s
      .replace(/\\/g, '\\\\')    // backslash
      .replace(/\//g, '\\/')     // closing slash
      .replace(/\]/g, '\\]')     // closing bracket
      .replace(/\^/g, '\\^')     // caret
      .replace(/-/g,  '\\-')     // dash
      .replace(/\0/g, '\\0')     // null
      .replace(/\t/g, '\\t')     // horizontal tab
      .replace(/\n/g, '\\n')     // line feed
      .replace(/\v/g, '\\x0B')   // vertical tab
      .replace(/\f/g, '\\f')     // form feed
      .replace(/\r/g, '\\r')     // carriage return
      .replace(/[\x00-\x08\x0E\x0F]/g,  function(ch) { return '\\x0' + hex(ch); })
      .replace(/[\x10-\x1F\x80-\xFF]/g, function(ch) { return '\\x'  + hex(ch); })
      .replace(/[\u0100-\u0FFF]/g,      function(ch) { return '\\u0' + hex(ch); })
      .replace(/[\u1000-\uFFFF]/g,      function(ch) { return '\\u'  + hex(ch); });
  },

  classToRegexp(node) {
    return '['
      + (node.inverted ? '^' : '')
      + node.parts.map(function(part) {
        return part instanceof Array
          ? javascript.regexpClassEscape(part[0])
          + '-'
          + javascript.regexpClassEscape(part[1])
          : javascript.regexpClassEscape(part);
      }).join('')
      + ']';
  },

  matchClass(node, reg, result, discard, discardPos) {
    let regexp, expr;
    if (node.parts.length === 0) {
      if (node.inverted) {
        // Same as .
        result.condition = 'peg$currPos < input.length';
        result.onSuccess([discard ? `${reg} = true;` : `${reg} = input.charAt(peg$currPos++);`]);
      } else {
        // Always fail
        result.condition = 'false';
      }
      return;
    }
    regexp = '/^'
      + javascript.classToRegexp(node)
      + '/' + (node.ignoreCase ? 'i' : '');
    expr = `input.charAt(peg$currPos)`;
    if (discard) {
      result.condition = `${regexp}.test(${expr})`;
      result.onSuccess([`${reg} = true;`]);
    } else {
      result.block = [`${reg} = ${expr};`];
      result.condition = `${regexp}.test(${reg})`;
    }
    if (!discardPos) {
      result.onSuccess(['peg$currPos++;']);
    }
  },

  matchRepeatedClass(node, reg, result, atLeastOne, discard, discardPos) {
    let regexp;
    if (node.parts.length === 0) {
      if (node.inverted) {
        // Same as .* / .+
        result.condition = atLeastOne ? 'peg$currPos < input.length' : 'true';
        if (!discard) {
          result.onSuccess([`${reg} = Array.from(input.substring(peg$currPos));`]);
        }
        if (!discardPos) {
          result.onSuccess([`peg$currPos = input.length;`]);
        }
      } else if (atLeastOne) {
        // Always fail
        result.condition = 'false';
      } else {
        // Zero length match
        result.condition = 'true';
        result.onSuccess([`${reg} = [];`]);
      }
      return;
    }
    regexp = '/'
        + javascript.classToRegexp(node)
        + (atLeastOne ? '+' : '*') + '/y' + (node.ignoreCase ? 'i' : '');
    result.block.push(`${reg} = ${regexp};`);
    result.block.push(`${reg}.lastIndex = peg$currPos;`);
    if (discard) {
      result.condition = `${reg}.exec(input) !== null`;
      if (!discardPos) {
        result.onSuccess([`peg$currPos = ${reg}.lastIndex;`]);
      }
    } else {
      result.block.push(`${reg} = ${reg}.exec(input);`);
      result.condition = `${reg} !== null`;
      if (!discardPos) {
        result.onSuccess([`peg$currPos += ${reg}[0].length;`]);
      }
      result.onSuccess([`${reg} = Array.from(${reg}[0]);`]);
    }
  },

  matchLiteral(node, reg, result, discard, discardPos) {
    let expr;
    if (node.value.length === 1 && !node.ignoreCase) {
      result.condition = 'input.charCodeAt(peg$currPos) === ' + node.value.charCodeAt(0);
      if (discard) {
        result.onSuccess([`${reg} = true;`]);
      } else {
        result.onSuccess([[reg, ' = ', javascript.stringify(node.value), ';'].join('')]);
      }
    } else {
      if (node.value.length === 1) {
        expr = `input.charAt(peg$currPos)`;
      } else {
        expr = `input.substr(peg$currPos,${node.value.length})`;
      }
      if (!discard) {
        result.block.push([`${reg} = ${expr};`]);
        expr = reg;
      }
      if (node.ignoreCase) {
        result.condition = [expr, '.toLowerCase() === ',
          javascript.stringify(node.value.toLowerCase())].join('');
      } else {
        result.condition = [expr, ' === ',
          javascript.stringify(node.value)].join('');
      }
      if (discard) {
        result.onSuccess([`${reg} = true;`]);
      }
    }
    if (!discardPos) {
      result.onSuccess([`peg$currPos += ${node.value.length};`]);
    }
  },

  initCache(/*opts*/) {
    return 'var peg$resultsCache = {}';
  },

  generateCacheRule(opts) {
    let keyParts = [
      opts.variantIndex + opts.variantCount * opts.ruleIndex,
      opts.startPos
    ];
    if (opts.params.length) {
      keyParts = keyParts.concat(opts.params);
    }
    const storeRefs = opts.storeRefs.filter(function(part) {
      return part !== '';
    }).map(function(part) {
      return '  ' + part;
    }).join('\n');
    return {
      start: [
        `var key = [${keyParts.join(',')}].map(String).join(":");`,
        'var cached = peg$resultsCache[key];',
        'if (cached) {',
        '  peg$currPos = cached.nextPos',
        opts.loadRefs,
        '  return cached.result;',
        '}',
        opts.saveRefs,
      ].join('\n'),
      store: [
        'peg$resultsCache[key] = cached = {',
        '  nextPos: peg$currPos, ',
        `  result: ${opts.result}, `,
        '};',
        storeRefs
      ].join('\n')
    };
  },

  cacheLoadRef(name) {
    let encName = javascript.stringify('$' + name);
    return `    if (cached.hasOwnProperty(${encName})) param_${name}.value = cached.$${name};`;
  },

  cacheStoreRef(reg, name) {
    if (!reg) { return ''; }
    return `if (${reg} !== param_${name}.value) cached.$${name} = param_${name}.value;`;
  },

  cacheRestoreRef(reg, name) {
    return `param_${name}.value = ${reg};`;
  },

  /**
   * Get a block which saves ref values to a temporary variable for later
   * comparison in cacheStoreRefs() / cacheRestoreRef().
   */
  cacheSaveRef(reg, name) {
    return `${reg} = param_${name}.value;`;
  }
};

module.exports = javascript;
