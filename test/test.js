/*globals it, describe, after, afterEach */

var getafix = require('../index.js'),
    _       = require('underscore'),
    debug   = require('debug')('test'),
    expect  = require('expect.js'),
    fs      = require('fs'),
    mkdirp  = require('mkdirp'),
    Path    = require('path'),
    Q       = require('q'),
    rimraf  = require('rimraf'),
    sinon   = require('sinon'),
    touch   = require('touch'),
    TMP     = __dirname + '/tmp';

describe('Configuration', function () {
  afterEach(function () {
    _.result(getafix.request, 'restore');
  });

  after(function () {
    rimraf.sync(TMP);
  });

  describe('is read from getafix files', function () {
    it('fetches data and stores it in json files', function (done) {
      makeStructure({
        fixtures: {
          '.getafix': 'base: "http://example.com"',
          users: {
            '2.json': true,
            2: {
              'tracks.json': true
            }
          }
        }
      });

      stubAjax({
        'http://example.com/users/2': { id: 2, username: 'eric', full_name: 'Eric Wahlforss' },
        'http://example.com/users/2/tracks': [
          { id: 10, title: 'flickermood' },
          { id: 11, title: 'Nox' }
        ]
      });
      getafix(TMP).then(function () {
        var user = require(Path.join(TMP, 'fixtures', 'users', '2.json')),
            tracks = require(Path.join(TMP, 'fixtures', 'users', '2', 'tracks.json'));
        expect(user).to.have.property('username', 'eric');
        expect(tracks).to.be.an('array');
        expect(tracks[0]).to.have.property('title', 'flickermood');
        expect(tracks[1]).to.have.property('title', 'Nox');
        done();
      }).catch(done);
    });

    it('merges multiple configuration files', function (done) {
      makeStructure({
        '.getafix': [
          'base: "http://example.com"',
          'query:',
          '  foo: 1',
          '  bar: 2'
        ].join('\n'),
        users: {
          '2.json': true
        },
        tracks: {
          '.getafix': [
            'query:',
            '  foo: null',
            '  quux: 3'
          ].join('\n'),
          '10.json': true
        }
      });

      stubAjax({
        'http://example.com/users/2?foo=1&bar=2': { id: 2, username: 'eric' },
        'http://example.com/tracks/10?bar=2&quux=3': { id: 10, title: 'flickermood' }
      });

      getafix(TMP).then(function () {
        done();
      }).catch(done);
    });
  });
});

function stubAjax(responses) {
  sinon.stub(getafix, 'request', function (options) {
    debug('Intercepted request for ', options.url);
    expect(responses).to.have.property(options.url);
    return Q.resolve([{ statusCode: 200 }, responses[options.url]]);
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
