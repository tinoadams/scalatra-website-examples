module.exports = function (grunt) {

    // load the task 
    grunt.loadNpmTasks("grunt-ts");

    // Configure grunt here
	grunt.initConfig({
	    ts: {
	        // A specific target
	        build: {
	            // The source TypeScript files, http://gruntjs.com/configuring-tasks#files
	            src: ["../src/main/webapp/ts/**/*.ts"],
	            // The source html files, https://github.com/grunt-ts/grunt-ts#html-2-typescript-support   
	            html: ["../src/main/webapp/ts/**/*.tpl.html"], 
	            // If specified, watches this directory for changes, and re-runs the current target
	            watch: "../src/main/webapp/ts",
	            options: {
	                sourceMap: false,
	            },
	        },
	    },
	});

	grunt.registerTask("default", ["ts:build"]);
}