const _ = require('underscore');
const Coffee = require('coffee-script');
const debug = require('debug')('getafix');
const fs = require('fs').promises;
const Glob = require('glob');
const Path = require('path');
const got = require('got');
const Url = require('url');

const glob = (pattern) =>
  new Promise((resolve, reject) => {
    Glob(pattern, (err, matches) => {
      if (err) {
        return reject(err);
      }
      resolve(matches);
    });
  });

module.exports = getafix;

async function getafix(target, notify, options) {
  options = _.extend(
    {
      target: Path.resolve(target),
      'only-new': false,
    },
    options
  );

  const configsPromise = readConfigs(target);
  let files = await glob(Path.join(target, '**/*.*'));
  if (options['only-new']) {
    const fileStats = await Promise.all(
      files.map((f) => fs.stat(Path.resolve(f)))
    );
    files = files.filter((f, index) => fileStats[index].size === 0);
  }
  return fetchItems(files, await configsPromise, options, notify);
}
// exposed so that tests can stub it
getafix.got = got;

async function fetchItems(files, configs, options, notify) {
  for (const file of files) {
    const config = getConfig(file, configs, options);
    if (!config) {
      continue;
    }
    debug('Updating: ' + config.url);
    notify({ type: 'requesting', file: file, url: config.url });
    const response = await getafix.got({
      responseType: config.json ? 'json' : 'text',
      url: config.url,
      headers: config.headers,
      throwHttpErrors: false,
    });
    const statusCode = response.statusCode;

    debug('Response: ' + statusCode + ' for ' + config.url);
    if (statusCode < 300) {
      debug('Writing ' + response.rawBody.length + ' bytes to ' + file);
      notify({ type: 'success', file: file });
      await fs.writeFile(file, response.rawBody);
    } else {
      notify({
        type: 'warning',
        file: file,
        url: config.url,
        code: statusCode,
      });
    }
  }
}

function getConfig(file, configs, options) {
  let path = '/';
  let url,
    urlPath,
    foundConfig = false;
  const extIndex = file.lastIndexOf('.');
  const config = {
    base: '',
    headers: {},
    query: {},
    json: /\.json$/.test(file),
  };

  urlPath = file.substring(options.target.length, extIndex); // strip extension
  Path.dirname(file)
    .split(Path.sep)
    .forEach(function (part) {
      let thisConf;
      path = Path.join(path, part);
      if ((thisConf = configs[path])) {
        foundConfig = true;
        mergeConfig(config, thisConf);

        if (thisConf.base) {
          urlPath = file.substring(path.length, extIndex);
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

async function readConfigs(target) {
  let fileNames;

  const files = await glob(Path.join(target, '**/.getafix'));
  const configs = {};
  for (const file of files) {
    debug('Reading ' + file);
    const content = await fs.readFile(file, 'utf8');

    try {
      // evil
      configs[Path.resolve(Path.dirname(file))] = Coffee.eval(content);
    } catch (e) {
      throw new Error('Error in ' + file);
    }
  }
  return configs;
}

function mergeConfig(config, thisConf) {
  config.base = thisConf.base || config.base;
  _.extend(config.query, thisConf.query);
  _.extend(config.headers, thisConf.headers);
}
