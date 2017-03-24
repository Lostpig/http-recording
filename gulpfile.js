'use strict'

const gulp = require('gulp')
const ts = require('gulp-typescript')
const sourceMaps = require('gulp-sourcemaps')
const del = require('del')

const tsProject = ts.createProject('tsconfig.json')

gulp.task('default', function () {
    return gulp.src('src/**/*.ts', { base: './src' })
        .pipe(sourceMaps.init())
        .pipe(tsProject()).js
        .pipe(sourceMaps.write('.', {includeContent: false, sourceRoot: '.'}))
        .pipe(gulp.dest('build'))
})

gulp.task('clean', function (done) {
	del('build/*', done)
});