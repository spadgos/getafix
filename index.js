var scraper = require('./src/scraper'),
    _ = require('underscore');

// export `build`
if (module !== require.main) {
  module.exports = scraper;
} else { // or invoked directly
  var args = require('yargs').argv,
      dir = _.first(args._) || process.cwd();

  scraper(dir, args, function () {
    console.log('Done');
  });
}
