var TestModule;
(function (TestModule) {
    var TestController = (function () {
        function TestController($scope) {
            this.$scope = $scope;
            $scope.clicka = function () {
                console.log("testing");
            };
        }
        TestController.$inject = ['$scope'];
        return TestController;
    })();
    TestModule.TestController = TestController;
})(TestModule || (TestModule = {}));
