"use strict";

/* Array utilities. */
var arrays = {
  range: function(start, stop) {
    var length = stop - start,
        result = new Array(length),
        i, j;

    for (i = 0, j = start; i < length; i++, j++) {
      result[i] = j;
    }

    return result;
  },

  find: function(array, valueOrPredicate) {
    var length = array.length, i;

    if (typeof valueOrPredicate === "function") {
      for (i = 0; i < length; i++) {
        if (valueOrPredicate(array[i])) {
          return array[i];
        }
      }
    } else {
      for (i = 0; i < length; i++) {
        if (array[i] === valueOrPredicate) {
          return array[i];
        }
      }
    }
  },
};

module.exports = arrays;
