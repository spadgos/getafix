var getafix = require('./src/getafix'),
    _ = require('underscore');

// export `build`
if (module !== require.main) {
  module.exports = getafix;
} else { // or invoked directly
  var args = require('yargs').argv,
      dir = _.first(args._) || process.cwd();

  getafix(dir, args, function () {
    console.log('Done');
  });
}
