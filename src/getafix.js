/*globals Buffer */
var _       = require('underscore'),
    async   = require('async'),
    CSON    = require('cson-safe'),
    debug   = require('debug')('getafix'),
    fs      = require('fs'),
    Glob    = require('glob'),
    Path    = require('path'),
    Request = require('request'),
    Q       = require('q'),
    Url     = require('url'),

    readFile  = Q.denodeify(fs.readFile),
    writeFile = Q.denodeify(fs.writeFile),
    glob      = Q.denodeify(Glob);

module.exports = getafix;

function getafix (target, options) {
  var defer = Q.defer();

  options = _.extend({
    target    : Path.resolve(target),
    'only-new': false
  }, options);

  Q.all([
    readConfigs(target),
    glob(Path.join(target, '**/*.json')).then(function (files) {
      var deferred = Q.defer();
      async.filter(files.map(function (file) { return Path.resolve(file); }), filterItems(options), deferred.resolve);
      return deferred.promise;
    })
  ]).spread(function (configs, endpoints) {
    return fetchItems(endpoints, configs, options, defer.notify);
  }).then(defer.resolve, defer.reject);

  return defer.promise;
}
// exposed so that tests can stub it
getafix.request = Q.denodeify(Request.get);

function fetchItems(files, configs, options, notify) {
  return _.chain(files)
    .map(function (file) {
      var config = getConfig(file, configs, options);
      return config ? { file: file, config: config } : null;
    })
    .filter(_.identity)
    .tap(function (items) {
      notify({ type: 'before', size: items.length });
    })
    .reduce(function (promise, item) {
      return promise.then(function () {
        var config = item.config,
            file = item.file;
        debug('Updating: ' + config.url);
        notify({ type: 'requesting', file: file, url: config.url });
        return getafix.request(_.extend({ json: true }, _.pick(config, 'url', 'headers')))
          .spread(function (response, body) {
            var code = response.statusCode,
                success = code < 300;
            debug('Response: ' + response.statusCode + ' for ' + config.url);
            if (success) {
              body = JSON.stringify(body, null, 2) + '\n';
              debug('Writing ' + Buffer.byteLength(body) + ' bytes to ' + file);
              notify({ type: 'success', file: file });
              return writeFile(file, body, 'utf8');
            } else {
              notify({ type: 'warning', file: file, url: config.url, code: code });
            }
          });
      });
    }, Q.resolve())
    .value();
}

function getConfig(file, configs, options) {
  var path = '/',
      url,
      urlPath,
      foundConfig = false,
      config = {
        base: '',
        headers: {},
        query: {}
      };

  urlPath = file.substring(options.target.length, file.length - 5); // strip .json
  Path.dirname(file).split(Path.sep).forEach(function (part) {
    var thisConf;
    path = Path.join(path, part);
    if ((thisConf = configs[path])) {
      foundConfig = true;
      mergeConfig(config, thisConf);

      if (thisConf.base) {
        urlPath = file.substring(path.length, file.length - 5);
      }
      if (thisConf.map) {
        urlPath = thisConf.map(urlPath);
      }
    }
  });

  if (!foundConfig) {
    return null;
  }

  url = Url.parse(config.base + urlPath, true);
  url.search = null;
  url.query = _.defaults(url.query || {}, config.query);

  _.each(url.query, function (val, key) {
    if (val === null) {
      delete url.query[key];
    }
  });

  url = url.format();

  config.url = url;
  return config;
}

function filterItems (options) {
  return function (file, next) {
    if (options['only-new']) {
      fs.stat(file, function (err, stats) {
        next(stats.size === 0);
      });
    } else {
      next(true);
    }
  };
}

function readConfigs(target) {
  var fileNames;

  return glob(Path.join(target, '**/.getafix'))
    .then(function (files) {
      fileNames = files;
      return Q.all(files.map(getContents));
    })
    .then(function (contents) {
      return contents.reduce(function (memo, content, i) {
        memo[Path.resolve(Path.dirname(fileNames[i]))] = CSON.parse(content);
        return memo;
      }, {});
    });

  function getContents(file) {
    return readFile(file, 'utf8');
  }
}

function mergeConfig(config, thisConf) {
  config.base = thisConf.base || config.base;
  _.extend(config.query, thisConf.query);
  _.extend(config.headers, thisConf.headers);
}
