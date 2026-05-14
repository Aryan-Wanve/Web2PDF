(function initWeb2PDFLogger(global) {
  "use strict";

  const root = global.Web2PDF || {};
  const config = root.Config || {};
  const prefix = root.LOG_PREFIX || "[Web2PDF]";
  const LEVELS = Object.freeze({
    silent: 0,
    error: 1,
    warn: 2,
    info: 3,
    debug: 4
  });
  const configuredLevel = String(config.logLevel || (config.production ? "warn" : "debug")).toLowerCase();
  const activeLevel = LEVELS[configuredLevel] == null ? LEVELS.warn : LEVELS[configuredLevel];

  function format(scope, args) {
    const label = scope ? `${prefix} ${scope}` : prefix;
    return [label].concat(Array.prototype.slice.call(args));
  }

  function shouldWrite(levelName) {
    return activeLevel >= LEVELS[levelName];
  }

  function write(method, levelName, scope, args) {
    if (!shouldWrite(levelName) || !global.console || typeof global.console[method] !== "function") {
      return;
    }
    global.console[method].apply(global.console, format(scope, args));
  }

  root.createLogger = function createLogger(scope) {
    return {
      log: function log() {
        write("log", "info", scope, arguments);
      },
      info: function info() {
        write("info", "info", scope, arguments);
      },
      warn: function warn() {
        write("warn", "warn", scope, arguments);
      },
      error: function error() {
        write("error", "error", scope, arguments);
      },
      debug: function debug() {
        write("debug", "debug", scope, arguments);
      }
    };
  };

  global.Web2PDF = root;
})(globalThis);
