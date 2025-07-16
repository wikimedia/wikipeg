"use strict";
const unicode = require("../utils/unicode");

/* Character set utilities. */

// Inverting ranges requires picking MIN/MAX characters
const CHAR_MIN = 0, CHAR_MAX = 0x10FFFF;

// "CASELESS_RESTRICT" support "suppresses case-insensitive matches
// between ASCII and non-ASCII characters"; in practice this just means
// excluding unicode matches for 's' and 'k'.
let caselessRestrict = false;

// Operations on {start,end} range objects, using unicode code point values.
const range = {

  // Convert a {start,end} range object to a character class "part"
  toPart(r) {
    return (r.start === r.end) ?
      String.fromCodePoint(r.start) :
      [String.fromCodePoint(r.start), String.fromCodePoint(r.end)];
  },

  // Invert a list of {start,end} range objects
  invert(ranges) {
    let start = CHAR_MIN;
    const result = [];
    for(const range of ranges) {
      const newRange = { start, end: range.start - 1 };
      if (newRange.start <= newRange.end) {
        result.push(newRange);
      }
      start = range.end + 1;
    }
    const newRange = { start, end: CHAR_MAX };
    if (newRange.start <= newRange.end) {
      result.push(newRange);
    }
    return result;
  },

  // Merge the given left and right ranges
  merge(left, right) {
    let leftIdx = 0, rightIdx = 0;
    let newRanges = [];
    while ((leftIdx < left.length) || (rightIdx < right.length)) {
      let range;
      if (leftIdx >= left.length ||
          (rightIdx < right.length &&
           right[rightIdx].start < left[leftIdx].start)
      ) {
        // Next lowest range comes from the right
        range = right[rightIdx++];
      } else {
        // Next lowest range comes from the left
        range = left[leftIdx++];
      }
      for (;;) {
        if (leftIdx < left.length && left[leftIdx].start <= (range.end + 1)) {
          // Merge a range from the left into the current range
          range.end = Math.max(range.end, left[leftIdx++].end);
        } else if (rightIdx < right.length && right[rightIdx].start <= (range.end + 1)) {
          // Merge a range from the right into the current range
          range.end = Math.max(range.end, right[rightIdx++].end);
        } else {
          // No more mergeable ranges
          break;
        }
      }
      newRanges.push(range);
    }
    return newRanges;
  },
};

// Operations on character class "parts", which could be a single character
// or a 2-element array of characters indicating a range.
const part = {

  // Convert a character class "part", which could be a single character
  // or a range, to a {start,end} range object.
  toRange(el) {
    return Array.isArray(el) ?
      { start: el[0].codePointAt(0), end: el[1].codePointAt(0) } :
      { start: el.codePointAt(0), end: el.codePointAt(0) };
  },

  // The main union/intersection method: merge two lists of sorted parts,
  // optionally inverting either/both of the inputs or the output.
  merge(left, leftInvert, right, rightInvert, invertResult) {
    left = left.map(part.toRange);
    right = right.map(part.toRange);
    if (leftInvert) {
      left = range.invert(left);
    }
    if (rightInvert) {
      right = range.invert(right);
    }
    let newRanges = range.merge(left, right);
    if (invertResult) {
      newRanges = range.invert(newRanges);
    }
    return newRanges.map(range.toPart);
  },
};

// Public api -------

// Operations on "class" nodes
const classNode = {
  // Option setting
  setCaselessRestrict(value) {
    caselessRestrict = value;
  },

  // Return the `.` class, ie any single character.
  any() {
    return {
      type: "class",
      parts: [],
      inverted: true,
      ignoreCase: false,
      sorted: true,
    };
  },

  // Is this the `.` class, ie any single character?
  isAny(node) {
    return node.parts.length === 0 && node.inverted;
  },

  // Return the empty class, ie will match no character.
  empty() {
    return {
      type: "class",
      parts: [],
      inverted: false,
      ignoreCase: false,
      sorted: true,
    };
  },

  // Is this the empty class, ie will match no character?
  isEmpty(node) {
    return node.parts.length === 0 && !node.inverted;
  },

  // Return a case-sensitive node from the input, which may be
  // case-insensitive.
  caseSensitive(node) {
    if (!node.ignoreCase) {
      return node;
    }
    const newParts = [];
    for (let range of node.parts.map(part.toRange)) {
      for (let cp = range.start; cp <= range.end; cp++) {
        // As per https://tc39.es/ecma262/multipage/text-processing.html
        // use the unicode "Simple Case Folding" procedure to find all
        // code points which case fold to the same 'mapped' character that
        // cp does.
        const mapped = unicode.simpleCaseFolding[cp] || cp;
        const expand = unicode.reverseSimpleCaseFolding[mapped] || [mapped];
        for (let expandedPoint of expand) {
          if (caselessRestrict && cp <= 0x7F && expandedPoint > 0x7F) {
            // if caselessRestrict is true, suppress non-ASCII matches when
            // the original code point was ASCII.
            continue;
          }
          newParts.push(String.fromCodePoint(expandedPoint));
        }
      }
    }
    // sort and merge newParts
    return classNode.sort({
      type: "class",
      parts: newParts,
      inverted: node.inverted,
      ignoreCase: false,
    });
  },

  // Compute the union of two character classes
  union(left, right) {
    if (classNode.isAny(left) || classNode.isEmpty(right)) {
      return left;
    }
    if (classNode.isAny(right) || classNode.isEmpty(left)) {
      return right;
    }
    left = classNode.caseSensitive(classNode.sort(left));
    right = classNode.caseSensitive(classNode.sort(right));
    if (!left.inverted && right.inverted) {
      return classNode.union(right, left);
    }
    // Either both left and right are inverted, or right is not inverted
    let resultInverted = left.inverted;
    let newParts = part.merge(
      left.parts, left.inverted,
      right.parts, right.inverted,
      resultInverted
    );
    return {
      type: "class",
      parts: newParts,
      inverted: resultInverted,
      ignoreCase: false,
      sorted: true,
    };
  },

  // Compute the intersection of two character classes
  intersection(left, right) {
    if (classNode.isAny(right) || classNode.isEmpty(left)) {
      return left;
    }
    if (classNode.isAny(left) || classNode.isEmpty(right)) {
      return right;
    }
    left = classNode.caseSensitive(classNode.sort(left));
    right = classNode.caseSensitive(classNode.sort(right));
    if (!left.inverted && right.inverted) {
      return classNode.intersection(right, left);
    }
    let resultInverted = right.inverted;
    let newParts = part.merge(
      left.parts, !left.inverted,
      right.parts, !right.inverted,
      !resultInverted
    );
    return {
      type: "class",
      parts: newParts,
      inverted: resultInverted,
      ignoreCase: false,
      sorted: true,
    };
  },

  // Sort a character class to make it suitable for input to union, etc.
  sort(first) {
    if (!first.sorted) {
      // firstSet is kept in sorted order and with overlapping ranges merged;
      // class may not be sorted or merged so preprocess it.
      first = Object.assign({}, first); // shallow clone
      first.parts = first.parts.slice(); // deep clone
      first.parts.sort(function(a,b) {
        if (Array.isArray(a)) { a = a[0]; }
        if (Array.isArray(b)) { b = b[0]; }
        if (a < b) {
          return -1;
        } else if (a > b) {
          return 1;
        } else {
          return 0;
        }
      });
      first.parts = part.merge(first.parts, false, [], false, false);
      first.sorted = true;
    }
    return first;
  },
};

module.exports = {
  classNode,
};
