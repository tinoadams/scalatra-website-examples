module.exports = function(grunt) {

	// load the task
	grunt.loadNpmTasks("grunt-ts");
	grunt.loadNpmTasks('grunt-notify');
	grunt.loadNpmTasks('grunt-contrib-watch');

	// Configure grunt here
	grunt.initConfig({
		watch : {
			scripts : {
				files : [ "../src/main/webapp/ts/**/*.ts" ],
				tasks : [ 'ts:build', 'notify:ts' ],
				options : {
					spawn : false,
				},
			},
		},
		notify : {
			ts : {
				options : {
					message : 'TS finished', // required
				}
			}
		},
		ts : {
			// A specific target
			build : {
				// The source TypeScript files,
				// http://gruntjs.com/configuring-tasks#files
				src : [ "../src/main/webapp/ts/**/*.ts" ],
				// The source html files,
				// https://github.com/grunt-ts/grunt-ts#html-2-typescript-support
				html : [ "../src/main/webapp/ts/**/*.tpl.html" ],
				// If specified, watches this directory for changes, and re-runs
				// the current target
				// watch : "../src/main/webapp/ts",
				options : {
					sourceMap : false,
				},
			},
		},
	});

	grunt.registerTask("default", [ "ts:build", "watch" ]);
}