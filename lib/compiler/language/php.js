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

  matchLiteral(node, reg, result) {
    let literalLength = getUtf8Length(node.value);
    let escapedValue = php.stringify(node.value);

    // For a single case-sensitive character, use array-like access
    if (literalLength === 1 && !node.ignoreCase) {
      result.condition = `($this->input[$this->currPos] ?? null) === ${escapedValue}`;
      result.onSuccess([
        `$this->currPos++;`,
        `${reg} = ${php.stringify(node.value)};`
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
          `${reg} = substr($this->input, $this->currPos, ${literalLength});`,
          `$this->currPos += ${literalLength};`
        ]);
      } else {
        result.onSuccess([
          `${reg} = ${php.stringify(node.value)};`,
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

  matchClass(node, reg, result) {
    let parts = node.parts;

    // Empty class
    if (node.parts.length === 0) {
      if (node.inverted) {
        // Same as .
        result.condition = '$this->currPos < $this->inputLength';
        result.onSuccess([`${reg} = self::consumeChar($this->input, $this->currPos);`]);
      } else {
        // Always fail
        result.condition = 'false';
      }
      return;
    }

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

    // Character lists can be done by getting the next character and comparing
    // it sequentially or looking up in a hashtable
    if (!hasRanges && (hasNonAscii || parts.length <= 2 || php.config.preferClassHashtable)) {
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
    if (!hasRanges) {
      if (node.inverted) {
        result.condition = `strcspn($this->input, ${php.stringify(chars.join(''))}, `
          + '$this->currPos, 1) !== 0';
        result.onSuccess([`${reg} = self::consumeChar($this->input, $this->currPos);`]);
      } else {
        result.condition = `strspn($this->input, ${php.stringify(chars.join(''))}, `
          + '$this->currPos, 1) !== 0';
        result.onSuccess([`${reg} = $this->input[$this->currPos++];`]);
      }
      return;
    }

    // Otherwise we shall construct a regex
    if (node.inverted || hasNonAscii) {
      result.block = [`${reg} = self::charAt($this->input, $this->currPos);`];
    } else {
      result.block = [`${reg} = $this->input[$this->currPos] ?? '';`];
    }
    let regexp = '/^['
      + (node.inverted ? '^' : '')
      + node.parts.map(function(part) {
        return part instanceof Array
          ? php.regexpClassEscape(part[0])
          + '-'
          + php.regexpClassEscape(part[1])
          : php.regexpClassEscape(part);
      }).join('')
      + ']/'
      + (node.ignoreCase ? 'i' : '')
      + (hasNonAscii ? 'u' : '');

    result.condition = `preg_match(${php.stringify(regexp)}, ${reg})`;
    if (node.inverted || hasNonAscii) {
      result.onSuccess([`$this->currPos += strlen(${reg});`]);
    } else {
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
    return {
      start: [
        `$key = json_encode([${keyParts.join(',')}]);`,
        `$cached = $this->cache[$key] ?? null;`,
        `if ($cached) {`,
        `  $this->currPos = $cached['nextPos'];`,
        opts.loadRefs,
        `  return $cached['result'];`,
        '}',
        opts.saveRefs,
      ].join('\n'),
      store: [
        `$cached = ['nextPos' => $this->currPos, 'result' => ${opts.result}];`,
        opts.storeRefs,
        `$this->cache[$key] = $cached;`
      ].join('\n')
    };
  },

  cacheLoadRef(name) {
    let encName = php.stringify('$' + name);
    return `if (array_key_exists(${encName}, $cached)) $param_${name} = $cached[${encName}];`;
  },

  cacheStoreRef(name) {
    let encName = php.stringify('$' + name);
    return `if ($saved_${name} !== $param_${name}) $cached[${encName}] = $param_${name};`;
  },

  /**
   * Get a block which saves ref values to a temporary variable for later
   * comparison in getCacheStoreRefs().
   */
  cacheSaveRef(name) {
    return `$saved_${name}=$param_${name};`;
  }
};

module.exports = php;
