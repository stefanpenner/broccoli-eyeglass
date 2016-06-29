var BroccoliSassCompiler = require("./broccoli_sass_compiler");
var Eyeglass = require("eyeglass");
var path = require("path");

function httpJoin() {
  var joined = [];
  for (var i = 0; i < arguments.length; i++) {
    if (arguments[i]) {
      var segment = arguments[i];
      if (path.sep !== "/") {
        segment = segment.replace(path.sep, "/");
      }
      joined.push(segment);
    }
  }
  var result = joined.join("/");
  result = result.replace("///", "/");
  result = result.replace("//", "/");
  return result;
}

function EyeglassCompiler(inputTrees, options) {
  if (!Array.isArray(inputTrees)) {
    inputTrees = [inputTrees];
  }
  if (options.configureEyeglass) {
    this.configureEyeglass = options.configureEyeglass;
    delete options.configureEyeglass;
  }

  this.relativeAssets = options.relativeAssets;
  delete options.relativeAssets;

  if (options.assets) {
    this.assetDirectories = options.assets;
    if (typeof this.assetDirectories === "string") {
      this.assetDirectories = [this.assetDirectories];
    }
    delete options.assets;
  }
  if (options.assetsHttpPrefix) {
    this.assetsHttpPrefix = options.assetsHttpPrefix;
    delete options.assetsHttpPrefix;
  }

  // TODO: this should not be accessed before super (ES6 Aligment);
  BroccoliSassCompiler.call(this, inputTrees, options);
  this.name = 'EyeglassCompiler';
  this.events.on("compiling", this.handleNewFile.bind(this));
}

EyeglassCompiler.prototype = Object.create(BroccoliSassCompiler.prototype);
EyeglassCompiler.prototype.handleNewFile = function(details) {
  if (!details.options.eyeglass) {
    details.options.eyeglass = {};
  }
  if ((this.assetsHttpPrefix || this.assetsRelativeTo) && !details.options.eyeglass.assets) {
    details.options.eyeglass.assets = {};
  }
  if (this.assetsHttpPrefix) {
    details.options.eyeglass.assets.httpPrefix = this.assetsHttpPrefix;
  }

  if (this.relativeAssets) {
    details.options.eyeglass.assets.relativeTo =
      httpJoin(details.options.eyeglass.httpRoot || "/", path.dirname(details.cssFilename));
  }

  details.options.eyeglass.buildDir = details.destDir;

  var eyeglass = new Eyeglass(details.options, this._super.sass);
  if (this.assetDirectories) {
    for (var i = 0; i < this.assetDirectories.length; i++) {
      eyeglass.assets.addSource(path.resolve(".", this.assetDirectories[i]), {
        globOpts: {
          ignore: ["**/*.js", "**/*.s[ac]ss"]
        }
      });
    }
  }
  if (this.configureEyeglass) {
    this.configureEyeglass(eyeglass, this._super.sass, details);
  }
  details.options = eyeglass.options;
};

module.exports = EyeglassCompiler;
