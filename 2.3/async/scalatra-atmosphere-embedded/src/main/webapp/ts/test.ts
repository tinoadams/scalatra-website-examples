/// <reference path="../lib/DefinitelyTyped/angularjs/angular.d.ts"/>

module TestModule {

	export class TestController {
	 
		static $inject = ['$scope'];
	    constructor(private $scope: any) {
	        $scope.clicka = () => {
				console.log("testing");
	        }
		}
	}
}