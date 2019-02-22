  // tracer.js
  function peg$DefaultTracer() {
    this.indentLevel = 0;
  }

  peg$DefaultTracer.prototype.trace = function(event) {
    var that = this;

    function log(event) {
      function repeat(string, n) {
         var result = "", i;

         for (i = 0; i < n; i++) {
           result += string;
         }

         return result;
      }

      function pad(string, length) {
        return string + repeat(" ", length - string.length);
      }

      function formatArgs(argMap) {
        var argParts = [];
        for (let argName in argMap) {
          if (argName === 'silence') {
            continue;
          }
          if (argName === 'boolParams') {
            argParts.push('0x' + argMap[argName].toString(16));
          } else {
            let displayName = argName.replace(/^param_/, '');
            if (typeof argMap[argName] === 'object' && argMap[argName].value !== undefined) {
              argParts.push(displayName + "=&" + JSON.stringify(argMap[argName].value));
            } else {
              argParts.push(displayName + "=" + argMap[argName]);
            }
          }
        }
        if (argParts.length) {
          return ' <' + argParts.join(', ') + '>';
        } else {
          return '';
        }
      }

      console.log(
          pad(
            event.location.start.line + ":" + event.location.start.column + "-"
              + event.location.end.line + ":" + event.location.end.column + " ",
            20
          )
          + pad(event.type, 10) + " "
          + repeat("  ", that.indentLevel) + event.rule
          + formatArgs(event.args)
      );
    }

    switch (event.type) {
      case "rule.enter":
        log(event);
        this.indentLevel++;
        break;

      case "rule.match":
        this.indentLevel--;
        log(event);
        break;

      case "rule.fail":
        this.indentLevel--;
        log(event);
        break;

      default:
        throw new Error("Invalid event type: " + event.type + ".");
    }
  };

  exports.DefaultTracer = peg$DefaultTracer;
