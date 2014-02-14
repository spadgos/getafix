/*globals Buffer */
var _       = require('underscore'),
    async   = require('async'),
    coffee  = require('coffee-script'),
    debug   = require('debug')('getafix'),
    fs      = require('fs'),
    glob    = require('glob'),
    Path    = require('path'),
    request = require('request'),
    Url     = require('url');

module.exports = function scraper(target, options, callback) {

  options = _.extend({
    target: target,
    onlyNew: false
  }, options);

  async.parallel({
    configs: readConfigs(target),
    endpoints: function (next) {
      glob(Path.join(target, '**/*.json'), function (err, files) {
        async.filter(files, filterItems(options), function (items) {
          next(err, items);
        });
      });
    }
  }, function (err, results) {
    fetchItems(results.endpoints, results.configs, options, callback);
  });
};

function fileToAPIPath(base) {
  return function (file) {
    return {
      api: file.substring(base.length, file.length - 5), // strip the .json too
      file: file
    };
  };
}


function fetchItems(files, configs, options, callback) {
  async.each(files, function (file, next) {
    var config = getConfig(file, configs, options);

    debug('Updating: ' + config.url);
    request.get(
      _.extend({ json: true }, _.pick(config, 'url', 'headers')),
      function (err, response, body) {
        var code = response && response.statusCode,
            success = (!err && code < 300);
        debug('Response: ' + code + ' for ' + config.url);
        if (success) {
          body = JSON.stringify(body, null, 2);
          debug('Writing ' + Buffer.byteLength(body) + ' bytes to ' + file);
          fs.writeFile(file, body, 'utf8', next);
        }
      }
    );
  }, callback);
}

function getConfig(file, configs, options) {

  var path = '',
      url,
      urlPath,
      config = {
        url: '/',
        headers: {}
      };

  urlPath = file.substring(options.target.length, file.length - 5);
  Path.dirname(file).split(Path.sep).forEach(function (part) {
    path += (path ? Path.sep : '') + part;
    if (configs[path]) {
      _.extend(config, configs[path]);
      if (configs[path].map) {
        urlPath = configs[path].map(urlPath);
      }
    }
  });

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
    if (options.onlyNew) {
      fs.stat(file, function (err, stats) {
        next(stats.size === 0);
      });
    } else {
      next(true);
    }
  };
}

function readConfigs(target) {
  return function (callback) {
    async.waterfall([
      glob.bind(glob, Path.join(target, '**/.getafix')),
      function (files, cb) {
        async.map(files, function (file, next) {
          fs.readFile(file, 'utf8', next);
        }, function (err, contents) {
          cb(err, contents.reduce(function (memo, content, i) {
            /*jshint evil: true */
            memo[Path.dirname(files[i])] = coffee.eval(content);
            return memo;
          }, {}));
        });
      }
    ], callback);
  };
}
