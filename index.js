var path = require('path');
var fs = require('fs');
var mkdirp = require('mkdirp');
var CachingWriter = require('broccoli-caching-writer');
var sass = require('node-sass');
var glob = require("glob");
var colors = require('colors/safe');
var RSVP = require('rsvp');

// Simple copy for options hashes.
function copyObject(obj) {
  var newObj = {};
  for(var key in obj) {
    if(obj.hasOwnProperty(key)) {
      if (typeof obj[key] == "object") {
        newObj[key] = copyObject(obj[key]);
      } else {
        newObj[key] = obj[key];
      }
    }
  }
  return newObj;
}

function moveOption(source, destination, property) {
  if (arguments.length > 3) {
    var returnValues = [];
    for (var i = 2; i < arguments.length; i++) {
      returnValues[i - 2] = moveOption(source, destination, arguments[i]);
    }
  } else {
    if (source.hasOwnProperty(property)) {
      destination[property] = source[property];
      delete source[property]
    }
    return destination[property];
  }
}

function removePathPrefix(prefix, fileNames) {
  if (prefix[prefix.length - 1] != path.sep) {
    prefix = prefix + path.sep;
  }
  var newFileNames = [];
  for (var i = 0; i < fileNames.length; i++) {
    if (fileNames[i].indexOf(prefix) == 0) {
      newFileNames[i] = fileNames[i].substring(prefix.length);
    } else {
      newFileNames[i] = fileNames[i];
    }
  }
  return newFileNames;
}

// sassFile: The sass file being compiled
// cssFile: The default css file location.
// cb: This callback must be invoked once for each time you want to compile the
//     sass file. It must be called synchonously. You can change the output
//     filename and options passed to it.
function defaultOptionsGenerator(sassFile, cssFile, options, cb) {
  cb(cssFile, options)
}

// Support for older versions of node.
function parsePath(pathname) {
  if (path.parse) {
    return path.parse(pathname);
  } else {
    var parsed = {
      dir: path.dirname(pathname),
      base: path.basename(pathname),
      ext: path.extname(pathname),
    }
    parsed.name = parsed.base.substring(0, parsed.base.length - parsed.ext.length);
    return parsed;
  }
}

function formatPath(parsed) {
  if (path.format) {
    return path.format(parsed);
  } else {
    return path.join(parsed.dir, parsed.name + parsed.ext);
  }
}

function forbidNodeSassOption(options, property) {
  if (options[property]) {
    throw new Error("The node-sass option " + property + "cannot be set explicitly.");
  }
}


var EyeglassCompiler = CachingWriter.extend({
  init: function(inputTrees, options) {
    this._super.init(inputTrees);
    this.options = copyObject(options || {});

    moveOption(this.options, this, "cssDir", "optionsGenerator", "fullException", "verbose");
    if (!this.cssDir) throw new Error('Expected cssDir option.')
    if (!this.optionsGenerator) this.optionsGenerator = defaultOptionsGenerator;
    forbidNodeSassOption(this.options, "file");
    forbidNodeSassOption(this.options, "data");
    forbidNodeSassOption(this.options, "outFile");
  },

  // Ugh. This method needs to be decomposed into smaller parts.
  updateCache: function(srcPaths, destDir) {
    var self = this;
    var files = {};

    for (var i = 0; i < srcPaths.length; i++) {
      // TODO: handle indented syntax files.
      var pattern = path.join(srcPaths[i], "**", "[^_]*.scss");
      files[srcPaths[i]] = removePathPrefix(srcPaths[i], glob.sync(pattern));
    }

    var promises = [];

    // TODO: limit concurrency?
    for (var i = 0; i < srcPaths.length; i++) {
      var sassFiles = files[srcPaths[i]];
      for (var j = 0; j < sassFiles.length; j++) {
        var sassOptions = copyObject(this.options);
        sassOptions.file = path.join(srcPaths[i], sassFiles[j]);
        // add srcPaths to includePaths
        var parsedName = parsePath(sassFiles[j]);
        parsedName.ext = ".css";
        parsedName.base = parsedName.name + ".css";
        var cssFileName = path.join(this.cssDir, formatPath(parsedName));
        this.optionsGenerator(sassFiles[j], cssFileName, sassOptions, function(resolvedCssFileName, resolvedOptions) {
          var ii = i;
          var jj = j;
          resolvedOptions = copyObject(resolvedOptions);
          resolvedOptions.outFile = resolvedCssFileName;
          var actualOutputPath = path.join(destDir, resolvedCssFileName);
          var promise = new RSVP.Promise(function(resolve, reject) {
            mkdirp.sync(path.dirname(actualOutputPath));
            var result = sass.render(resolvedOptions, function(err, result) {
              if (err) {
                reject(err);
              } else {
                resolve(result);
              }
            });
          });
          promise.then(function(result) {
            var sassFile = path.join(srcPaths[ii], files[srcPaths[ii]][jj])
            fs.writeFileSync(actualOutputPath, result.css)
            if (self.verbose) {
              var timeInSeconds = result.stats.duration / 1000.0;
              if (timeInSeconds == 0) timeInSeconds = "0.001" // nothing takes zero seconds.
              var action = colors.inverse.green("compile" + " (" + timeInSeconds + "s)");
              var message = sassFile + " => " + resolvedCssFileName;
              console.log(action + " " + message);
            }
          }, function(error) {
            if (self.verbose) {
              var sassFile = path.join(srcPaths[ii], files[srcPaths[ii]][jj])
              var action = colors.bgRed.white("error");
              var message = colors.red(error.message);
              var location = "Line " + error.line + ", Column " + error.column;
              if (error.file.substring(error.file.length - sassFile.length) != sassFile) {
                location = location + " of " + error.file;
              }
              console.log(action + " " + sassFile + " (" + location + "): " + message);
            }
            RSVP.rethrow(new Error(error.message))
          });
          promises[promises.length] = promise;
        });
      }
    }
    return RSVP.allSettled(promises);
  }
});

module.exports = EyeglassCompiler;