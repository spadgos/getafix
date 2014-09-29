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

  describe('read from getafix files', function () {
    it('fetches data and stores it in json files', function (done) {
      makeStructure({
        '.getafix': 'base: "http://example.com"',
        users: {
          '2.json': true,
          2: {
            'tracks.json': true
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
        var user = require(Path.join(TMP, 'users', '2.json')),
            tracks = require(Path.join(TMP, 'users', '2', 'tracks.json'));
        expect(user).to.have.property('username', 'eric');
        expect(tracks).to.be.an('array');
        expect(tracks[0]).to.have.property('title', 'flickermood');
        expect(tracks[1]).to.have.property('title', 'Nox');
        done();
      }).catch(done);
    });

    it('supports formats other than json', function (done) {
      makeStructure({
        '.getafix': 'base: "http://example.com"',
        users: {
          '2.xml': true,
          2: {
            'tracks.txt': true
          }
        }
      });

      var userRawResp = '<?xml version="1.0" encoding="UTF-8" ?><response></response>',
          tracksRawResp = 'Got some tracks as a text file!';

      stubAjax({
        'http://example.com/users/2': userRawResp,
        'http://example.com/users/2/tracks': tracksRawResp
      });
      getafix(TMP).then(function () {
        var user = fs.readFileSync(Path.join(TMP, 'users', '2.xml'), 'utf8'),
            tracks = fs.readFileSync(Path.join(TMP, 'users', '2', 'tracks.txt'), 'utf8');
        expect(user).to.equal(userRawResp + '\n');
        expect(tracks).to.equal(tracksRawResp + '\n');
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
        var user = require(Path.join(TMP, 'users', '2.json')),
            track = require(Path.join(TMP, 'tracks', '10.json'));
        expect(user).to.have.property('username', 'eric');
        expect(track).to.have.property('title', 'flickermood');
        done();
      }).catch(done);
    });

    it('which must be valid Coffeescript', function (done) {
      makeStructure({
        '.getafix': '3adadt14361 113 some invalid content!!'
      });
      getafix(TMP).then(function () {
        done(new Error('getafix should have failed'));
      }, function (err) {
        expect(err.message).to.match(/Error in .*\/\.getafix/);
        done();
      });
    });

    it('supports functions in configuration files', function (done) {
      makeStructure({
        '.getafix': [
          'map: (path) -> \'/resolve?url=example.com/\' + path'
        ].join('\n')
      });
      getafix(TMP).then(function () {
        done();
      }, done);
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
