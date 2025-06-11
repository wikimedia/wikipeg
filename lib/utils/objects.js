"use strict";

/* Object utilities. */
var objects = {
  clone: function(object) {
    var result = Object.create(null);

    Object.getOwnPropertyNames(object).forEach((key)=>{
      result[key] = object[key];
    });

    return result;
  },

  defaults: function(object, defaults) {
    Object.getOwnPropertyNames(defaults).forEach((key)=>{
      if (!(key in object)) {
        object[key] = defaults[key];
      }
    });
  },
};

module.exports = objects;
