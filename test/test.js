const getafix = require('../index.js');
const _ = require('underscore');
const debug = require('debug')('test');
const fs = require('fs');
const mkdirp = require('mkdirp');
const Path = require('path');
const rimraf = require('rimraf');
const sinon = require('sinon');
const touch = require('touch');
const TMP = __dirname + '/tmp';

describe('Configuration', function () {
  let notify;

  beforeEach(() => {
    notify = sinon.spy();
  });

  afterEach(function () {
    _.result(getafix.got, 'restore');
  });

  afterAll(function () {
    rimraf.sync(TMP);
  });

  describe('read from getafix files', function () {
    it('fetches data and stores it in json files', async function () {
      makeStructure({
        '.getafix': 'base: "http://example.com"',
        users: {
          '2.json': true,
          2: {
            'tracks.json': true,
          },
        },
      });

      stubAjax({
        'http://example.com/users/2': {
          id: 2,
          username: 'eric',
          full_name: 'Eric Wahlforss',
        },
        'http://example.com/users/2/tracks': [
          { id: 10, title: 'flickermood' },
          { id: 11, title: 'Nox' },
        ],
      });
      await getafix(TMP, notify);
      const user = require(Path.join(TMP, 'users', '2.json'));
      const tracks = require(Path.join(TMP, 'users', '2', 'tracks.json'));
      expect(user).toMatchObject({ username: 'eric' });
      expect(tracks).toMatchObject([
        { title: 'flickermood' },
        { title: 'Nox' },
      ]);
    });

    it('supports formats other than json', async function () {
      makeStructure({
        '.getafix': 'base: "http://example.com"',
        users: {
          '2.xml': true,
          2: {
            'tracks.txt': true,
          },
        },
      });

      const userRawResp =
        '<?xml version="1.0" encoding="UTF-8" ?><response></response>';
      const tracksRawResp = 'Got some tracks as a text file!';

      stubAjax({
        'http://example.com/users/2': userRawResp,
        'http://example.com/users/2/tracks': tracksRawResp,
      });
      await getafix(TMP, notify);
      const user = fs.readFileSync(Path.join(TMP, 'users', '2.xml'), 'utf8');
      const tracks = fs.readFileSync(
        Path.join(TMP, 'users', '2', 'tracks.txt'),
        'utf8'
      );
      expect(user).toEqual(userRawResp);
      expect(tracks).toEqual(tracksRawResp);
    });

    it('merges multiple configuration files', async function () {
      makeStructure({
        '.getafix': [
          'base: "http://example.com"',
          'query:',
          '  foo: 1',
          '  bar: 2',
        ].join('\n'),
        users: {
          '2.json': true,
        },
        tracks: {
          '.getafix': ['query:', '  foo: null', '  quux: 3'].join('\n'),
          '10.json': true,
        },
      });

      stubAjax({
        'http://example.com/users/2?foo=1&bar=2': { id: 2, username: 'eric' },
        'http://example.com/tracks/10?bar=2&quux=3': {
          id: 10,
          title: 'flickermood',
        },
      });

      await getafix(TMP, notify);
      const user = require(Path.join(TMP, 'users', '2.json'));
      const track = require(Path.join(TMP, 'tracks', '10.json'));
      expect(user).toMatchObject({ username: 'eric' });
      expect(track).toMatchObject({ title: 'flickermood' });
    });

    it('which must be valid Coffeescript', async function () {
      makeStructure({
        '.getafix': '3adadt14361 113 some invalid content!!',
      });
      return expect(getafix(TMP, notify)).rejects.toThrow(/Error in .*\/\.getafix/);
    });

    it('supports functions in configuration files', async function () {
      makeStructure({
        '.getafix': ["map: (path) -> '/resolve?url=example.com/' + path"].join(
          '\n'
        ),
      });
      await getafix(TMP, notify);
    });
  });
});

function stubAjax(responses) {
  sinon.stub(getafix, 'got').callsFake(function (options) {
    debug('Intercepted request for ', options.url);
    expect(responses).toMatchObject({ [options.url]: expect.anything() });
    return Promise.resolve({
      statusCode: 200,
      rawBody: Buffer.from(
        typeof responses[options.url] === 'string'
          ? responses[options.url]
          : JSON.stringify(responses[options.url]),
        'utf8'
      ),
    });
  });
}

function makeStructure(structure) {
  rimraf.sync(TMP);
  _makeStructure(structure, TMP);
}

function _makeStructure(structure, base) {
  mkdirp.sync(base);
  _.each(structure, function (content, file) {
    var path = Path.join(base, file);
    switch (typeof content) {
      case 'object':
        _makeStructure(content, path);
        break;
      case 'string':
        debug('Creating file ', path);
        fs.writeFileSync(path, content, 'utf8');
        break;
      default:
        debug('Touching file ', path);
        touch.sync(path);
    }
  });
}
