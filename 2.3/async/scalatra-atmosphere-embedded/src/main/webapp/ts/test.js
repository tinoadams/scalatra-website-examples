var TestModule;
(function (TestModule) {
    var Window = (function () {
        function Window(top, height) {
            this.top = top;
            this.height = height;
            this.bottom = top + height - 1;
        }
        Window.prototype.reachedTop = function () {
            return this.top <= 0;
        };

        Window.prototype.reachedEnd = function (lineCount) {
            return this.bottom >= lineCount - 1;
        };

        Window.prototype.inTopThird = function (lineCount) {
            var boundary = Math.ceil(lineCount / 3);
            return this.top <= boundary;
        };

        Window.prototype.inBottomThird = function (lineCount) {
            var boundary = Math.ceil(lineCount / 3) * 2;
            return this.bottom >= boundary;
        };

        Window.prototype.up = function () {
            return new Window(this.top - 1, this.height);
        };

        Window.prototype.down = function () {
            return new Window(this.top + 1, this.height);
        };
        return Window;
    })();

    var ServerFile = (function () {
        function ServerFile(chunkSize) {
            this.chunkSize = chunkSize;
            this.socket = $.atmosphere;
            this.transport = 'websocket';
            this.fallbackTransport = 'long-polling';
            this.open = false;
            this.start = 0;
            this.end = 0;
            this.end = this.start + chunkSize;

            var request = {
                url: "/the-chat",
                contentType: "application/json",
                logLevel: 'debug',
                transport: this.transport,
                fallbackTransport: 'long-polling',
                onOpen: this.onOpen,
                onReconnect: this.onReconnect,
                onMessage: this.onMessage,
                onClose: this.onClose,
                onError: this.onError
            };
            this.subSocket = this.socket.subscribe(request);
        }
        ServerFile.prototype.openFile = function (name) {
        };

        ServerFile.prototype.nextChunk = function () {
            return [];
        };

        ServerFile.prototype.previousChunk = function () {
            return [];
        };

        ServerFile.prototype.onOpen = function (response) {
            this.transport = response.transport;
            this.open = true;
            console.log("open", response.transport);
        };

        ServerFile.prototype.onReconnect = function (rq, rs) {
            this.socket.info("Reconnecting");
        };

        ServerFile.prototype.onMessage = function (rs) {
            var message = rs.responseBody;
            try  {
                var json = jQuery.parseJSON(message);
                console.log("got a message", json);
            } catch (e) {
                console.log('This doesn\'t look like a valid JSON object: ', message.data);
                return;
            }
        };

        ServerFile.prototype.onClose = function (rs) {
            this.open = false;
        };

        ServerFile.prototype.onError = function (rs) {
        };
        return ServerFile;
    })();

    var LineBuffer = (function () {
        function LineBuffer(bufferSize, visibleLines) {
            this.bufferSize = bufferSize;
            this.visibleLines = visibleLines;
            this.buffer = [];
            this.index = new Window(0, 2);
            this.buffer = _.range(bufferSize).map(function (i) {
                return "Line " + i;
            });
        }
        LineBuffer.prototype.currentLines = function () {
            var list = [];
            for (var i = this.index.top; i <= this.index.bottom; i++)
                list.push(this.buffer[i]);
            return list;
        };

        LineBuffer.prototype.up = function () {
            if (this.index.reachedTop())
                return;
            this.index = this.index.up();
            return this.buffer[this.index.top];
        };

        LineBuffer.prototype.down = function () {
            if (this.index.reachedEnd(this.buffer.length))
                return;
            this.index = this.index.down();
            return this.buffer[this.index.bottom];
        };
        return LineBuffer;
    })();

    var TestController = (function () {
        function TestController($scope) {
            this.$scope = $scope;
            this.buffer = new LineBuffer(10, 2);
            this.lines = [];
            $scope.model = this;
            this.file = new ServerFile(2);
            this.lines = this.buffer.currentLines();
        }
        TestController.prototype.keypressed = function (event) {
            if (event.keyCode == 38)
                this.up();
            else if (event.keyCode == 40)
                this.down();
        };

        TestController.prototype.up = function () {
            var line = this.buffer.up();
            if (line) {
                this.lines.unshift(line);
                this.lines.pop();
            }
        };

        TestController.prototype.down = function () {
            var line = this.buffer.down();
            if (line) {
                this.lines.shift();
                this.lines.push(line);
            }
        };
        TestController.$inject = ['$scope'];
        return TestController;
    })();
    TestModule.TestController = TestController;
})(TestModule || (TestModule = {}));
