function getUtf8Length(s) {
  let len = 0;
  for (let i = 0; i < s.length; i++) {
    let code = s.charCodeAt(i);
    if (code >=0xd800 && code <= 0xdbff) {
      let low = s.charCodeAt(++i);
      if (!isNaN(low)) {
        code = (code - 0xd800) * 0x400 + low - 0xdc00 + 0x10000;
      }
    }
    if (code < 0x80) {
      len += 1;
    } else if (code < 0x800) {
      len += 2;
    } else if (code < 0x10000) {
      len += 3;
    } else {
      len += 4;
    }
  }
  return len;
}

function getCodepointCount(s) {
  let len = 0;
  for (let i = 0; i < s.length; i++) {
    let code = s.charCodeAt(i);
    if (code >=0xd800 && code <= 0xdbff) {
      ++i;
    }
    len++;
  }
  return len;
}

let php = {
  silence: '$silence',
  boolParams: '$boolParams',
  failed: 'self::$FAILED',
  currPos: '$this->currPos',
  savedPos: '$this->savedPos',
  maxFailExpected: '$this->maxFailExpected',
  maxFailPos: '$this->maxFailPos',
  assertionSuccess: 'false',
  inputLength: '$this->inputLength',
  advanceInputChar: 'self::advanceChar($this->input, $this->currPos);',
  consumeInputChar: 'self::consumeChar($this->input, $this->currPos);',
  result: '$result',
  actionArgPrefix: '$',

  config: {
    preferClassHashtable: false,
  },

  regName(index) {
    return `$r${index}`;
  },

  posRegName(index) {
    return `$p${index}`;
  },

  getRegType(regName) {
    return regName.charAt(1);
  },

  ruleFuncName(name, discard, iterable) {
    if (iterable) {
      return 'stream' + name;
    } else if (discard) {
      return 'discard' + name;
    } else {
      return 'parse' + name;
    }
  },

  ruleFuncCall(name, args) {
    return `$this->${name}(${args.join(', ')})`;
  },

  ruleFuncDeclaration(funcName, args, body) {
    return `private function ${funcName}(${args.join(', ')}) {\n${body}\n}`;
  },

  streamFuncDeclaration(funcName, args, body) {
    return php.ruleFuncDeclaration(funcName, args, body);
  },

  varDeclaration(/*vars*/) {
    return [];
  },

  expectationExpression(index) {
    return index;
  },

  expectationDeclaration(index, expression) {
    return `${index} => ${expression},`;
  },

  actionDeclaration(index, argNames, code) {
    return `private function a${index}(${argNames.join(', ')}) {\n${code}\n}`;
  },

  actionCall(index, args) {
    return `$this->a${index}(${args.join(', ')})`;
  },

  libraryCall(name, args = []) {
    return `$this->${name}(${args.join(', ')})`;
  },

  paramArgName(name) {
    return `$param_${name}`;
  },

  refParamArgDeclarator(name) {
    return `&$param_${name}`;
  },

  paramNameFromArg(argName) {
    let matches = /^&?\$param_(.*)$/.exec(argName);
    if (!matches) {
      throw new Error('Unexpected rule argument name: ' + argName);
    }
    return matches[1];
  },

  refParamValue(name) {
    return `$param_${name}`;
  },

  newRef(value) {
    return `self::newRef(${value})`;
  },

  valueArgActionDeclarator(name) {
    return `$${name}`;
  },

  refArgActionDeclarator(name) {
    return `&$${name}`;
  },

  inputSubstring(start, end) {
    return `substr($this->input, ${start}, ${end} - ${start})`;
  },

  blockStart(label) {
    return `// start ${label}`;
  },

  blockEnd(label) {
    return `${label}:`;
  },

  gotoBlockEnd(label) {
    return `goto ${label};`;
  },

  push(array, ...rest) {
    let parts = [];
    for (let element of rest) {
      parts.push(`${array}[] = ${element};`);
    }
    return parts.join('\n');
  },

  arrayLength(expression) {
    return `count(${expression})`;
  },

  toBool(expression) {
    return `(bool)(${expression})`;
  },

  stringify(v) {
    if (v instanceof Array) {
      let parts = [];
      for (let element of v) {
        parts.push(php.stringify(element));
      }
      return '[' + parts.join(', ') + ']';
    }
    if (typeof v === 'object') {
      let parts = [];
      for (let key in v) {
        let value = v[key];
        parts.push(`${php.stringify(key)} => ${php.stringify(value)}`);
      }
      return '[' + parts.join(', ') + ']';
    }
    if (typeof v !== 'string') {
      throw new Error('unimplemented type: ' + (typeof v));
    }
    let escapedChars = [];
    for (let char of v) {
      let escapedChar;
      let charCode = char.codePointAt(0);
      if (char === '"' || char === '\\' || char === '$') {
        escapedChar = `\\${char}`;
      } else if (charCode < 16) {
        escapedChar = `\\x0${charCode.toString(16)}`;
      } else if (charCode < 32 || charCode === 0x7f) {
        escapedChar = `\\x${charCode.toString(16)}`;
      } else if (charCode >= 0x80) {
        escapedChar = `\\u{${charCode.toString(16)}}`;
      } else {
        escapedChar = char;
      }
      escapedChars.push(escapedChar);
    }
    return '"' + escapedChars.join('') + '"';
  },

  regexpClassEscape(s) {
    let escapedChars = [];
    for (let char of s) {
      let escapedChar;
      let charCode = char.charCodeAt(0);
      if ('/[]-\\'.indexOf(char) !== -1) {
        escapedChar = '\\' + char;
      } else if (charCode < 16) {
        escapedChar = `\\x0${charCode.toString(16)}`;
      } else if (charCode < 32 || charCode === 0x7f) {
        escapedChar = `\\x${charCode.toString(16)}`;
      } else if (charCode >= 0x80) {
        escapedChar = `\\x{${charCode.toString(16)}}`;
      } else {
        escapedChar = char;
      }
      escapedChars.push(escapedChar);
    }
    return escapedChars.join('');
  },

  classToRegexp(node) {
    return '['
      + (node.inverted ? '^' : '')
      + node.parts.map(function(part) {
        return part instanceof Array
          ? php.regexpClassEscape(part[0])
          + '-'
          + php.regexpClassEscape(part[1])
          : php.regexpClassEscape(part);
      }).join('')
      + ']';
  },

  matchLiteral(node, reg, result, discard) {
    let literalLength = getUtf8Length(node.value);
    let escapedValue = php.stringify(node.value);

    // For a single case-sensitive character, use array-like access
    if (literalLength === 1 && !node.ignoreCase) {
      result.condition = `($this->input[$this->currPos] ?? null) === ${escapedValue}`;
      result.onSuccess([
        `$this->currPos++;`,
        `${reg} = ${discard ? 'true' : php.stringify(node.value)};`
      ]);
      return;
    }

    let hasNonAscii = false;
    for (let char of node.value) {
      if (char.charCodeAt(0) > 0x80) {
        hasNonAscii = true;
      }
    }

    // ASCII literals and case-sensitive non-ASCII literals can be done
    // with substr_compare()
    if (!node.ignoreCase || !hasNonAscii) {
      result.condition = '$this->currPos >= $this->inputLength ? false : substr_compare(' + [
        '$this->input',
        escapedValue,
        '$this->currPos',
        literalLength,
        node.ignoreCase ? 'true' : 'false'
      ].join(', ') + ') === 0';
      if (node.ignoreCase) {
        result.onSuccess([
          discard ?
            `${reg} = true;` :
            `${reg} = substr($this->input, $this->currPos, ${literalLength});`,
          `$this->currPos += ${literalLength};`
        ]);
      } else {
        result.onSuccess([
          `${reg} = ${discard ? 'true' : php.stringify(node.value)};`,
          `$this->currPos += ${literalLength};`
        ]);
      }
      return;
    }

    // It's complicated to implement non-ASCII case-insensitive literals
    // efficiently in PHP. This way is O(1) in the size of the
    // unscanned portion of the string, although it may take a few microseconds
    // per scanned character.

    let codepointCount = getCodepointCount(node.value);
    if (codepointCount > 1) {
      result.block.push(`${reg} = self::charsAt($this->input, $this->currPos, ${codepointCount});`);
    } else {
      result.block.push(`${reg} = self::charAt($this->input, $this->currPos);`);
    }
    result.condition = `mb_strtolower(${reg}) === ${php.stringify(node.value.toLowerCase())}`;
    result.onSuccess([`$this->currPos += strlen(${reg});`]);
  },

  analyzeClass(node) {
    let parts = node.parts;
    // Analyze for the potential special case of a class composed of individual
    // characters
    let hasRanges = false;
    let hasNonAscii = false;
    let chars = [];
    for (let i = 0; i < parts.length; i++) {
      let part = parts[i];
      if (part instanceof Array) {
        if (part[0].charCodeAt(0) >= 128 || part[1].charCodeAt(0) >= 128) {
          hasNonAscii = true;
        }
        hasRanges = true;
      } else {
        if (part.charCodeAt(0) >= 128) {
          hasNonAscii = true;
        }

        if (node.ignoreCase) {
          let upper = part.toUpperCase();
          let lower = part.toLowerCase();
          chars.push(upper);
          if (upper !== lower) {
            chars.push(lower);
          }
        } else {
          chars.push(part);
        }
      }
    }
    return { hasRanges: hasRanges, hasNonAscii: hasNonAscii, chars: chars };
  },

  matchRepeatedClass(node, reg, result, atLeastOne, discard) {
    if (node.parts.length === 0) {
      if (node.inverted) {
        // Same as .* / .+
        result.condition = atLeastOne ? '$this->currPos < $this->inputLength' : 'true';
        if (!discard) {
          result.onSuccess([`${reg} = mb_str_split(substr($this->input, $this->currPos), 1, 'utf-8');`]);
        }
        result.onSuccess([`$this->currPos = $this->inputLength;`]);
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
    let {hasRanges,hasNonAscii,chars} = php.analyzeClass(node);

    // ASCII character lists can be done with strspn/strcspn
    if (!hasRanges && !hasNonAscii) {
      if (node.inverted) {
        result.block.push(`${reg} = strcspn($this->input, ${php.stringify(chars.join(''))}, $this->currPos);`);
      } else {
        result.block.push(`${reg} = strspn($this->input, ${php.stringify(chars.join(''))}, $this->currPos);`);
      }
      result.condition = atLeastOne ? `${reg} > 0` : "true";
      if (discard) {
        result.onSuccess([`$this->currPos += ${reg};`]);
      } else {
        // Note that on PHP <= 8.1, str_split('') returns [''] not [], so only
        // use it if if we're guaranteed at least one match.
        result.onSuccess([
          `$this->currPos += ${reg};`,
          `${reg} = substr($this->input, $this->currPos - ${reg}, ${reg});`,
          hasNonAscii || node.inverted || (!atLeastOne) ?
            `${reg} = mb_str_split(${reg}, 1, "utf-8");` :
            `${reg} = str_split(${reg});`,
        ]);
      }
      return;
    }

    // Otherwise we shall construct a regex
    let regexp = '/'
      + php.classToRegexp(node)
      + (atLeastOne ? '+' : '*')+'/A'
      + (node.ignoreCase ? 'i' : '')
      + (hasNonAscii ? 'u' : '');
    result.block.push(`${reg} = null;`);
    result.condition = `preg_match(${php.stringify(regexp)}, $this->input, ${reg}, 0, $this->currPos)`;
    result.onSuccess([`$this->currPos += strlen(${reg}[0]);`]);
    if (discard) {
      // free the match result array
      result.onSuccess([`${reg} = true;`]);
    } else {
      // See above: str_split() is only safe to use if at least one match.
      if (hasNonAscii || node.inverted || (!atLeastOne)) {
        result.onSuccess([`${reg} = mb_str_split(${reg}[0], 1, "utf-8");`]);
      } else {
        result.onSuccess([`${reg} = str_split(${reg}[0]);`]);
      }
    }
  },

  matchClass(node, reg, result, discard) {

    // Empty class
    if (node.parts.length === 0) {
      if (node.inverted) {
        // Same as .
        result.condition = '$this->currPos < $this->inputLength';
        if (discard) {
          result.onSuccess([
            `self::advanceChar($this->input, $this->currPos);`,
            `${reg} = true;`
          ]);
        } else {
          result.onSuccess([`${reg} = self::consumeChar($this->input, $this->currPos);`]);
        }
      } else {
        // Always fail
        result.condition = 'false';
      }
      return;
    }

    let {hasRanges,hasNonAscii,chars} = php.analyzeClass(node);

    // Character lists can be done by getting the next character and comparing
    // it sequentially or looking up in a hashtable
    if (!hasRanges && (node.parts.length <= 2 || php.config.preferClassHashtable)) {
      if (hasNonAscii || node.inverted) {
        result.block = [`${reg} = self::charAt($this->input, $this->currPos);`];
      } else {
        result.block = [`${reg} = $this->input[$this->currPos] ?? '';`];
      }
      if (chars.length > 2) {
        let hashtableParts = [];
        for (let i = 0; i < chars.length; i++) {
          hashtableParts.push(`${php.stringify(chars[i])} => true`);
        }
        result.condition = `isset([${hashtableParts.join(', ')}][${reg}])`;
      } else {
        let condParts = [];
        for (let i = 0; i < chars.length; i++) {
          condParts.push(`${reg} === ${php.stringify(chars[i])}`);
        }
        result.condition = condParts.join(' || ');
      }
      if (node.inverted) {
        result.condition = `${reg} !== '' && !(${result.condition})`;
      }
      if (hasNonAscii || node.inverted) {
        result.onSuccess([`$this->currPos += strlen(${reg});`]);
      } else {
        result.onSuccess([`$this->currPos++;`]);
      }
      return;
    }

    // ASCII character lists can be done with strspn/strcspn
    if (!(hasRanges || hasNonAscii)) {
      if (node.inverted) {
        result.condition = `strcspn($this->input, ${php.stringify(chars.join(''))}, `
          + '$this->currPos, 1) !== 0';
        if (discard) {
          result.onSuccess([
            `self::advanceChar($this->input, $this->currPos);`,
            `${reg} = true;`,
          ]);
        } else {
          result.onSuccess([`${reg} = self::consumeChar($this->input, $this->currPos);`]);
        }
      } else {
        result.condition = `strspn($this->input, ${php.stringify(chars.join(''))}, `
          + '$this->currPos, 1) !== 0';
        if (discard) {
          result.onSuccess([
            `$this->currPos++;`,
            `${reg} = true;`,
          ]);
        } else {
          result.onSuccess([`${reg} = $this->input[$this->currPos++];`]);
        }
      }
      return;
    }

    // Otherwise we shall construct a regex
    let regexp = '/\\A'
      + php.classToRegexp(node)
      + '/'
      + (node.ignoreCase ? 'i' : '')
      + (hasNonAscii ? 'u' : '');

    if (node.inverted || hasNonAscii) {
      // A multibyte result is possible, and the exact length isn't known
      // unless/until the match succeeds.  By using preg_match with an offset,
      // we can avoid creating the substring in the case where the match fails.
      result.condition = `preg_match(${php.stringify(regexp)}, $this->input, ${reg}, 0, $this->currPos)`;
      result.onSuccess([
        `${reg} = ${reg}[0];`,
        `$this->currPos += strlen(${reg});`
      ]);
    } else {
      // Creating the matches array is expensive, and its always done if we
      // pass an offset to preg_match.  So it's cheaper to do a substring
      // first, even if we're in 'discard' mode.
      result.block = [`${reg} = $this->input[$this->currPos] ?? '';`];
      result.condition = `preg_match(${php.stringify(regexp)}, ${reg})`;
      result.onSuccess(['$this->currPos++;']);
    }
  },

  initCache(/*opts*/) {
    return 'protected $cache = [];';
  },

  generateCacheRule(opts) {
    let keyParts = [
      opts.variantIndex + opts.variantCount * opts.ruleIndex,
      opts.startPos
    ];
    if (opts.params.length) {
      keyParts = keyParts.concat(opts.params);
    }
    let storeRefs = opts.storeRefs.map(function(part) {
      return '  ' + part;
    }).join(',\n');
    return {
      start: [
        `$key = json_encode([${keyParts.join(',')}]);`,
        `$cached = $this->cache[$key] ?? null;`,
        `if ($cached) {`,
        `  $this->currPos = $cached->nextPos;`,
        opts.loadRefs,
        `  return $cached->result;`,
        '}',
        opts.saveRefs,
      ].join('\n'),
      store: [
        `$this->cache[$key] = new ${opts.className}CacheEntry(`,
        '  $this->currPos,',
        `  ${opts.result + (opts.storeRefs.length > 0 ? ',' : '')}`,
        storeRefs,
        `);`
      ].join('\n')
    };
  },

  cacheLoadRef(name) {
    return `if ($cached->${name} !== self::$UNDEFINED) { $param_${name} = $cached->${name}; }`;
  },

  cacheStoreRef(reg, name) {
    return reg ?
      `${reg} !== $param_${name} ? $param_${name} : self::$UNDEFINED` :
      'self::$UNDEFINED';
  },


  cacheRestoreRef(reg, name) {
    return `$param_${name} = ${reg};`;
  },

  /**
   * Get a block which saves ref values to a temporary variable for later
   * comparison in getCacheStoreRefs() / getCacheRestoreRefs().
   */
  cacheSaveRef(reg, name) {
    return `${reg} = $param_${name};`;
  }
};

module.exports = php;
