/*globals Buffer */
var _       = require('underscore'),
    async   = require('async'),
    coffee  = require('coffee-script'),
    debug   = require('debug')('getafix'),
    fs      = require('fs'),
    Glob    = require('glob'),
    Path    = require('path'),
    request = require('request'),
    Q       = require('q'),
    Url     = require('url'),

    readFile = Q.denodeify(fs.readFile),
    glob     = Q.denodeify(Glob);


module.exports = function (target, options) {

  options = _.extend({
    target    : Path.resolve(target),
    'only-new': false
  }, options);

  return Q.all([
    readConfigs(target),
    glob(Path.join(target, '**/*.json')).then(function (files) {
      var deferred = Q.defer();
      async.filter(files.map(function (file) { return Path.resolve(file); }), filterItems(options), function (items) {
        deferred.resolve(items);
      });
      return deferred.promise;
    })
  ]).spread(function (configs, endpoints) {
    return fetchItems(endpoints, configs, options);
  });
};

function fetchItems(files, configs, options) {
  var defer = Q.defer(), promises, done = 0;
  promises = files
    .map(function (file) {
      var config = getConfig(file, configs, options);
      return config ? { file: file, config: config } : null;
    })
    .filter(_.identity)
    .map(function (item) {
      var config = item.config,
          file = item.file,
          deferred = Q.defer();

      debug('Updating: ' + config.url);
      request.get(
        _.extend({ json: true }, _.pick(config, 'url', 'headers')),
        function (err, response, body) {
          var code = response && response.statusCode,
              success = (!err && code < 300);
          debug('Response: ' + code + ' for ' + config.url);
          if (success) {
            body = JSON.stringify(body, null, 2) + '\n';
            debug('Writing ' + Buffer.byteLength(body) + ' bytes to ' + file);
            fs.writeFile(file, body, 'utf8', function (err) {
              if (err) {
                deferred.reject(err);
              } else {
                deferred.resolve();
              }
            });
          } else {
            deferred.reject(err);
          }
        }
      );
      return deferred.promise.then(function () {
        ++done;
        defer.notify({ done: done, total: promises.length, file: file });
      });
    });

  Q.all(promises).then(
    defer.resolve.bind(defer),
    defer.reject.bind(defer)
  );

  return defer.promise;
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
        /*jshint evil: true */
        memo[Path.resolve(Path.dirname(fileNames[i]))] = coffee.eval(content);
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
