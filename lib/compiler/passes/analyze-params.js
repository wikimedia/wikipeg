"use strict";

var visitor        = require("../visitor"),
    asts           = require("../asts"),
    GrammarError   = require("../../grammar-error"),
    Traverser      = require("../traverser");

function analyzeParams(ast, options) {
  var paramInfos = {};
  var boolIndex = 0;
  var refScopeIndex = 0;

  function registerParamType(name, type, location) {
    var paramInfo = getParamInfo(name);
    if (paramInfo.type !== undefined) {
      if (paramInfo.type !== type) {
        throw new GrammarError("Type conflict in parameter " + name, location);
      }
    } else {
      paramInfo.type = type;
      if (type === 'boolean') {
        if (boolIndex > 31) {
          throw new GrammarError("A maximum of 32 boolean parameters may be defined", location);
        }
        paramInfo.index = boolIndex++;
      }
    }
  }

  function getParamInfo(name) {
    if (paramInfos[name] === undefined) {
      paramInfos[name] = {name: name};
    }
    return paramInfos[name];
  }

  function newRefScope() {
    return {
      id: refScopeIndex++,
      capture: false
    };
  }

  let startRules = options.allowedStartRules.concat(options.allowedStreamRules);
  let allRefParams = {};

  // Initialize rule properties
  visitor.build({
    rule: function(node) {
      node.accessedParams = {};
      node.assignedParams = {};
      node.refScopeSets = {};
    }
  })(ast);

  // Handlers for a call graph traverser which will mark touched nodes as
  // having a particular parameter previously assigned.
  const assignmentHandlers = {
    rule: function(node, paramName) {
      node.assignedParams[paramName] = true;
      this.traverse(node.expression, paramName);
    },

    rule_ref: function(node, paramName) {
      const ruleNode = asts.findRule(ast, node.name);
      this.traverse(ruleNode, paramName);
    },
  };

  // If the parameter is a reference parameter, record any captures in
  // the given scope object, unless there has been an assignment to
  // that reference earlier in the call graph.
  const refScopeHandlers = {
    rule: function(node, paramName, refScope) {
      if (node.refScopeSets[paramName] === undefined) {
        node.refScopeSets[paramName] = new Set();
      }
      node.refScopeSets[paramName].add(refScope);
      this.traverse(node.expression, paramName, refScope);
    },

    rule_ref: function(node, paramName, refScope) {
      for (let i = 0; i < node.assignments.length; i++) {
        let assignment = node.assignments[i];
        if (assignment.isref && assignment.name === paramName) {
          // Kill refScope and don't continue propagation
          // (but some later reference to this rule could still propagate
          // the scope)
          return;
        }
      }

      // Only propagate if there is still an active refScope
      const ruleNode = asts.findRule(ast, node.name);
      this.traverse(ruleNode, paramName, refScope);
    },

    labeled_param: function(node, paramName, refScope) {
      if (node.isref && refScope && node.parameter === paramName) {
        refScope.capture = true;
      }
    }
  };

  // For each parameter assignment, traverse the call graph, notifying called
  // nodes that the parameter has been assigned. Also collect type information.
  visitor.build({
    rule_ref: function(node) {
      let targetNode = asts.findRule(ast, node.name);

      for (let i = 0; i < node.assignments.length; i++) {
        let assignment = node.assignments[i];
        let type;

        if (assignment.isref) {
          type = 'reference';
        } else if (assignment.type === 'increment') {
          type = 'integer';
        } else {
          type = assignment.type;
        }
        registerParamType(assignment.name, type, node.location);
        assignment.paramInfo = getParamInfo(assignment.name);

        let refScope = null;
        if (assignment.isref) {
          refScope = newRefScope();
          allRefParams[assignment.name] = true;
        }

        (new Traverser(ast, assignmentHandlers))
          .traverse(targetNode, assignment.name);
        (new Traverser(ast, refScopeHandlers))
          .traverse(targetNode, assignment.name, refScope);
      }
    }
  })(ast);

  // For every reference parameter, traverse the call graph of each start rule,
  // collecting scope capture information
  for (let paramName in allRefParams) {
    startRules.forEach(function(ruleName) {
      let node = asts.findRule(ast, ruleName);
      let refScope = newRefScope();
      (new Traverser(ast, refScopeHandlers))
        .traverse(node, paramName, refScope);
    });
  }

  // Traverse the call graph for every rule, accumulating lists of
  // accessed parameters
  let accessTraverser = new Traverser(ast, {
    rule_ref: function(node, accessedParams) {
      let ruleNode = asts.findRule(ast, node.name);
      this.traverse(ruleNode, ruleNode.accessedParams);

      let newAccessedParams = {};
      Object.assign(newAccessedParams, ruleNode.accessedParams);

      for (let i = 0; i < node.assignments.length; i++) {
        let assignment = node.assignments[i];

        // Params which are assigned (except increment) have their previous
        // values discarded, so we don't need to know what the previous value
        // was.
        if (assignment.name in newAccessedParams && assignment.type !== 'increment') {
          delete newAccessedParams[assignment.name];
        }
      }

      Object.assign(accessedParams, newAccessedParams);
    },

    rule: function(node) {
      const oldCount = Object.keys(node.accessedParams).length;
      this.traverse(node.expression, node.accessedParams);
      const newCount = Object.keys(node.accessedParams).length;
      // Keep track of changes to accessedParams so we can iterate to
      // a fixed point
      if (newCount !== oldCount) {
        this.changed = true;
      }
    },

    parameter_and: function(node, accessedParams) {
      node.paramInfo = accessedParams[node.parameter] = getParamInfo(node.parameter);
    },

    parameter_not: function(node, accessedParams) {
      node.paramInfo = accessedParams[node.parameter] = getParamInfo(node.parameter);
    },

    labeled_param: function(node, accessedParams) {
      node.paramInfo = accessedParams[node.parameter] = getParamInfo(node.parameter);
    }
  });

  // There could be cycles in the rule graph, so we need to iterate until
  // the set of accessedParams no longer grows.
  do {
    accessTraverser.reset();
    visitor.build({
      rule: function(node) {
        accessTraverser.traverse(node, node.accessedParams);
      }
    })(ast);
  } while (accessTraverser.changed);

  // A parameter needs to be passed to the rule function if the parameter was
  // both written to and accessed. If the parameter was only accessed but
  // statically not written, we can generate a literal for it. Capturing a
  // reference parameter for possible modification by JS counts as a write
  // and affects everything in the reference scope.

  // Generate convenience properties on the rules reflecting this situation.
  ast.rules.forEach(function(node) {
    node.passedParams = {};
    node.hasBoolParams = false;

    for (let paramName in node.accessedParams) {
      let paramInfo = node.accessedParams[paramName];

      let assigned = false;
      if (node.assignedParams && node.assignedParams[paramName]) {
        assigned = true;
      } else if (node.refScopeSets && node.refScopeSets[paramName]) {
        node.refScopeSets[paramName].forEach(function (scope) {
          if (scope.capture) {
            assigned = true;
          }
        });
      }
      if (assigned) {
        if (paramInfo.type === 'boolean') {
          node.hasBoolParams = true;
        }
        node.passedParams[paramName] = paramInfo;
      }
    }

    // This is bulky and no longer needed
    delete node.refScopeSets;
  });
}

module.exports = analyzeParams;
