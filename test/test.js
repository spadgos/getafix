/*globals it, describe, before, after, afterEach */

var getafix = require('../index.js'),
    expect = require('expect.js'),
    mkdirp = require('mkdirp'),
    rimraf = require('rimraf'),
    touch = require('touch'),
    sinon = require('sinon'),
    request = require('request'),
    fs = require('fs'),
    debug = require('debug')('test'),
    Path = require('path'),
    _ = require('underscore'),
    TMP = __dirname + '/tmp';

describe('Configuration', function () {
  before(function () {
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

  });

  afterEach(function () {
    if (request.get.restore) {
      request.get.restore();
    }
  });

  after(function () {
    rimraf.sync(TMP);
  });

  describe('is read from getafix files', function () {
    it('passes this test', function (done) {
      stubAjax({
        'http://example.com/users/2': { id: 2, username: 'eric', full_name: 'Eric Wahlforss' },
        'http://example.com/users/2/tracks': [
          { id: 10, title: 'flickermood' },
          { id: 11, title: 'Nox' }
        ]
      });
      getafix(TMP, function () {
        var user = require(Path.join(TMP, 'fixtures', 'users', '2.json')),
            tracks = require(Path.join(TMP, 'fixtures', 'users', '2', 'tracks.json'));
        expect(user).to.have.property('username', 'eric');
        expect(tracks).to.be.an('array');
        expect(tracks[0]).to.have.property('title', 'flickermood');
        expect(tracks[1]).to.have.property('title', 'Nox');
        done();
      });
    });
  });
});

function stubAjax(responses) {
  sinon.stub(request, 'get', function (options, ajaxDone) {
    debug('Intercepted request for ', options.url);
    expect(responses).to.have.property(options.url);
    ajaxDone(null, { statusCode: 200 }, responses[options.url]);
  });
}

function makeStructure(structure) {
  rimraf.sync(TMP);
  _makeStructure(structure, TMP);
}

function _makeStructure(structure, base) {
  _.each(structure, function (content, file) {
    var path = Path.join(base, file);
    switch (typeof content) {
      case 'object':
        mkdirp.sync(path);
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
