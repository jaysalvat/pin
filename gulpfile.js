/*  
    Utlimate Jay Mega Gulpfile
 */

(function () {
    "use strict";
 
    var pkg     = require("./package.json"),
        del     = require("del"),
        yargs   = require("yargs"),
        exec    = require("exec"),
        fs      = require("fs"),
        gulp    = require("gulp"),
        bump    = require("gulp-bump"),
        header  = require("gulp-header"),
        qunit   = require("gulp-qunit"),
        uglify  = require("gulp-uglifyjs"),
        jshint  = require('gulp-jshint'),
        gutil   = require("gulp-util"),
        zip     = require("gulp-zip"),
        replace = require("gulp-replace"),
        gsync   = require("gulp-sync"),
        sync    = gsync(gulp).sync;

    var version = yargs.argv.type || "patch";

    var settings = {
        banner: {
            content: [
                '/*! Needle - Copyright (c) <%= year %> Jay Salvat',
                ' *  v<%= pkg.version %> released <%= datetime %>',
                ' *  http://needle.jaysalvat.com',
                ' */',
                '',
            ].join("\n"),
            vars: {
                pkg: pkg,
                datetime: gutil.date("yyyy-mm-dd HH:MM"),
                year: gutil.date("yyyy")
            }
        },
        files: {
            in: [ 
                './src/needle.js',
                './src/needle.lite.js',
            ],
            out: 'needle'
        }
    };

    var getPackageJson = function () {
        return JSON.parse(fs.readFileSync('./package.json'));
    };

    gulp.task("clean", function (cb) {
        return del([ "./dist" ], cb);
    });

    gulp.task("tmp-clean", function (cb) {
        return del([ "./tmp" ], cb);
    });

    gulp.task("tmp-create", function (cb) {
        return exec("mkdir -p ./tmp", cb);
    });

    gulp.task("tmp-copy", [ "tmp-create" ], function () {
        return gulp.src("./dist/*")
            .pipe(gulp.dest("./tmp"));
    });

    gulp.task("zip", [ "tmp-create" ], function () {
        var filename = settings.files.out + ".zip";

        return gulp.src("./dist/*")
            .pipe(zip(filename))
            .pipe(gulp.dest("./tmp"));
    });

    gulp.task("fail-if-dirty", function (cb) {
        return exec('git diff-index HEAD --', function (err, output) { // err, output, code
            if (err) {
                return cb(err);
            }
            if (output) {
                return cb("Repository is dirty");
            }
            return cb();
        });
    });

    gulp.task("fail-if-not-master", function (cb) {
        exec('git symbolic-ref -q HEAD', function (err, output) { // err, output, code
            if (err) {
                return cb(err);
            }
            if (!/refs\/heads\/master/.test(output)) {
                return cb("Branch is not Master");
            }
            return cb();
        });
    });

    gulp.task("git-tag", function (cb) {
        var message = "v" + getPackageJson().version;

        return exec('git tag ' + message, cb);
    });

    gulp.task("git-add", function (cb) {
        return exec('git add -A', cb);
    });

    gulp.task("git-commit", [ "git-add" ], function (cb) {
        var message = "Build v" + getPackageJson().version;

        return exec('git commit -m "' + message + '"', cb);
    });

    gulp.task("git-pull", function (cb) {
        return exec('git pull origin master', function (err, output, code) {
            if (code !== 0) {
                return cb(err + output);
            }
            return cb();
        });
    });

    gulp.task("git-push", [ "git-commit" ], function (cb) {
        return exec('git push origin master --tags', function (err, output, code) {
            if (code !== 0) {
                return cb(err + output);
            }
            return cb();
        });
    });

    gulp.task("meta", [ "tmp-create" ], function (cb) {
        var  metadata = {
                date: gutil.date("yyyy-mm-dd HH:MM"),
                version: "v" + getPackageJson().version
            },
            json = JSON.stringify(metadata, null, 4);

        fs.writeFileSync("tmp/metadata.json", json);
        fs.writeFileSync("tmp/metadata.js", "__metadata(" + json + ");");

        return cb();
    });

    gulp.task("bump", function () {
        return gulp.src([ "package.json", "bower.json" ])
            .pipe(bump({
                type: version
            }))
            .pipe(gulp.dest("."));
    });

    gulp.task("license", function () {
        return gulp.src([ "./LICENSE", "./README.md" ])
            .pipe(replace(/\(c\) (\d{4})/g, "$1" + gutil.date("yyyy")))
            .pipe(gulp.dest("."));
    });

    gulp.task('lint', function() {
        return gulp.src('./src/**.js')
            .pipe(jshint())
            .pipe(jshint.reporter('default'));
    });

    gulp.task("test", function () {
        return gulp.src("./tests/test-runner.html")
            .pipe(qunit());
    });

    gulp.task("uglify", function () {
        settings.banner.vars.pkg = getPackageJson();

        return gulp.src('./src/*.js')
            .pipe(uglify({
                compress: {
                    warnings: false
                },
                mangle: true,
                outSourceMap: true
            }))
            .pipe(gulp.dest('./dist/'));
    });

    gulp.task("copy", function () {
        return gulp.src(settings.files.in)
            .pipe(gulp.dest('./dist/'));
    });

    gulp.task("header", function () {
        settings.banner.vars.pkg = getPackageJson();

        return gulp.src('./dist/*.js')
            .pipe(header(settings.banner.content, settings.banner.vars ))
            .pipe(gulp.dest('./dist/'));
    });

    gulp.task("gh-pages", function (cb) {
        version = getPackageJson().version;

        exec([  'git checkout gh-pages',
                'rm -rf releases/' + version,
                'mkdir -p releases/' + version,
                'cp -r tmp/* releases/' + version,
                'git add -A releases/' + version,
                'rm -rf releases/latest',
                'mkdir -p releases/latest',
                'cp -r tmp/* releases/latest',
                'git add -A releases/latest',
                'git commit -m "Publish release v' + version + '."',
                'git push origin gh-pages',
                'git checkout -'
            ].join(" && "),
            function (err, output, code) {
                if (code !== 0) {
                    return cb(err + output);
                }
                return cb();
            }
        );
    });

    gulp.task("test", sync([
        "lint",
        "test"
    ], 
    "building"));

    gulp.task("build", sync([
        "lint",
        "test-dev", 
        "clean", 
        "copy", 
        "uglify",
        "header",
        "test-dist"
    ], 
    "building"));

    gulp.task("release", sync([
      [ "fail-if-not-master", "fail-if-dirty" ],
        "git-pull",
        "lint",
        "test",
        "bump",
        "license",
        "clean",
        "copy",
        "uglify",
        "header",
        "git-add",
        "git-commit",
        "git-tag",
        "git-push",
        "publish"
    ], 
    "releasing"));

    gulp.task("publish", sync([
      [ "fail-if-not-master", "fail-if-dirty" ],
        "tmp-create",
        "tmp-copy",
        "meta",
        "zip",
        "gh-pages",
        "tmp-clean"
    ], 
    "publising"));
})();

/*

NPM Installation
----------------

npm install --save-dev del    
npm install --save-dev yargs  
npm install --save-dev exec   
npm install --save-dev fs     
npm install --save-dev gulp   
npm install --save-dev bump   
npm install --save-dev header 
npm install --save-dev qunit  
npm install --save-dev uglify 
npm install --save-dev jshint 
npm install --save-dev gutil  
npm install --save-dev zip    
npm install --save-dev replace
npm install --save-dev gsync  

Gh-pages creation
-----------------

git checkout --orphan gh-pages
git rm -rf .
rm -fr
echo "Welcome" > index.html
git add index.html
git commit -a -m "First commit"
git push origin gh-pages
git checkout -

*/