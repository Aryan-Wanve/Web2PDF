(function initDrive2PDFLogger(global) {
  "use strict";

  const root = global.Drive2PDF || {};
  const prefix = root.LOG_PREFIX || "[Drive2PDF]";

  function format(scope, args) {
    const label = scope ? `${prefix} ${scope}` : prefix;
    return [label].concat(Array.prototype.slice.call(args));
  }

  root.createLogger = function createLogger(scope) {
    return {
      log: function log() {
        console.log.apply(console, format(scope, arguments));
      },
      info: function info() {
        console.info.apply(console, format(scope, arguments));
      },
      warn: function warn() {
        console.warn.apply(console, format(scope, arguments));
      },
      error: function error() {
        console.error.apply(console, format(scope, arguments));
      },
      debug: function debug() {
        console.debug.apply(console, format(scope, arguments));
      }
    };
  };

  global.Drive2PDF = root;
})(globalThis);
