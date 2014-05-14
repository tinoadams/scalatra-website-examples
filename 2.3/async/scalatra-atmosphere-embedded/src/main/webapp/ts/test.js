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
            var boundary = Math.floor(lineCount / 3);
            return this.top <= boundary;
        };

        Window.prototype.inBottomThird = function (lineCount) {
            var boundary = Math.floor(lineCount / 3) * 2;
            return this.bottom >= boundary;
        };

        Window.prototype.up = function () {
            return new Window(this.top - 1, this.height);
        };

        Window.prototype.down = function () {
            return new Window(this.top + 1, this.height);
        };

        Window.prototype.shift = function (lineCount) {
            return new Window(this.top + lineCount, this.height);
        };
        return Window;
    })();
    TestModule.Window = Window;

    var Chunk = (function () {
        function Chunk(start, end, lines) {
            this.start = start;
            this.end = end;
            this.lines = lines;
        }
        return Chunk;
    })();
    TestModule.Chunk = Chunk;

    var ServerFile = (function () {
        function ServerFile($q, chunkSize, callback) {
            if (typeof callback === "undefined") { callback = null; }
            var _this = this;
            this.$q = $q;
            this.chunkSize = chunkSize;
            this.socket = $.atmosphere;
            this.transport = 'websocket';
            this.fallbackTransport = 'long-polling';
            this.open = false;
            this.connectionChangeListener = [];
            this.futures = [];
            this.futureUUID = 0;
            this.start = 0;
            this.end = 0;
            this.end = this.start + chunkSize;
            if (callback)
                this.onConnectionChanged(callback);

            var request = {
                url: "/the-chat",
                contentType: "application/json",
                logLevel: 'debug',
                transport: this.transport,
                fallbackTransport: 'long-polling',
                onOpen: null,
                onReconnect: null,
                onMessage: null,
                onClose: null,
                onError: null
            };
            request.onOpen = function (response) {
                _this.transport = response.transport;
                _this.setOpen(true);
                console.log("open", response.transport);
            };
            request.onReconnect = function (rq, rs) {
                _this.socket.info("Reconnecting");
            };
            request.onMessage = function (rs) {
                var message = rs.responseBody;
                try  {
                    var json = jQuery.parseJSON(message);
                    console.log("got a message", json);

                    var position = -1;
                    for (var index in _this.futures)
                        if (_this.futures[index].id == json.id)
                            position = index;
                    if (position == -1) {
                        console.log('This doesn\'t look like a valid response object: id does not match anything');
                        return;
                    }
                    var deferred = _this.futures[position].future;
                    _this.futures.splice(position, 1);

                    if (json.errors)
                        deferred.reject(json);
                    else
                        deferred.resolve(json);
                } catch (e) {
                    console.log('This doesn\'t look like a valid JSON object: ', message.data);
                    return;
                }
            };
            request.onClose = function (rs) {
                _this.setOpen(false);
            };

            request.onError = function (rs) {
                console.log("error", rs);
            };

            this.subSocket = this.socket.subscribe(request);
        }
        ServerFile.prototype.send = function (data) {
            var deferred = this.$q.defer();
            if (this.open) {
                data.id = this.futureUUID++;
                this.futures.push({ id: data.id, future: deferred });
                var json = jQuery.stringifyJSON(data);
                console.log("Sending: " + json);
                this.subSocket.push(json);
            } else {
                deferred.reject(["Connection is not open"]);
            }

            return deferred.promise;
        };

        ServerFile.prototype.openFile = function (name) {
            var data = { command: 'open_file', filename: name };
            return this.send(data);
        };

        ServerFile.prototype.isNull = function (that) {
            return that === null || that === undefined;
        };

        ServerFile.prototype.readChunk = function (start, end) {
            var _this = this;
            if (typeof start === "undefined") { start = 0; }
            if (typeof end === "undefined") { end = this.chunkSize; }
            var data = { command: 'read_file', start: Math.max(0, start), end: end };
            return this.send(data).then(function (response) {
                if (_this.isNull(response.lines) || !$.isArray(response.lines) || _this.isNull(response.actual_start) || _this.isNull(response.actual_end))
                    return _this.$q.reject(["read_file response is invalid"]);
                _this.start = response.actual_start;
                _this.end = response.actual_end;
                console.log('start,end', response.actual_start, response.actual_end);
                var lines = _.map(response.lines, function (line) {
                    return line + "(" + response.id + ")";
                });
                lines.push('------------------' + "(" + response.id + ")");
                return new Chunk(response.actual_start, response.actual_end, lines);
            });
        };

        ServerFile.prototype.nextChunk = function (current) {
            var start = current.end + 1;
            return this.readChunk(start, start + this.chunkSize);
        };

        ServerFile.prototype.previousChunk = function (current) {
            var start = current.start - this.chunkSize - 1;
            return this.readChunk(start, start + this.chunkSize);
        };

        ServerFile.prototype.onConnectionChanged = function (callback) {
            this.connectionChangeListener.push(callback);
        };

        ServerFile.prototype.setOpen = function (open) {
            this.futures = [];
            this.open = open;
            _.each(this.connectionChangeListener, function (callback) {
                return callback(open);
            });
        };
        return ServerFile;
    })();
    TestModule.ServerFile = ServerFile;

    var LineBuffer = (function () {
        function LineBuffer(visibleLines) {
            this.visibleLines = visibleLines;
            this.chunks = [];
            this.lines = [];
            this.index = new Window(0, 0);
            this.index = new Window(0, 0);
        }
        LineBuffer.prototype.addChunk = function (lastChunk) {
            var _this = this;
            return this.serverFile.nextChunk(lastChunk).then(function (chunk) {
                _this.chunks.push(chunk);

                var al = _this.lines.length;
                var bl = chunk.lines.length;
                var i = 0;
                while (i < bl)
                    _this.lines[al++] = chunk.lines[i++];

                if (_this.lines.length > _this.visibleLines * 3)
                    return _this.currentLines();
                else
                    return _this.addChunk(chunk);
            });
        };

        LineBuffer.prototype.setFile = function (serverFile) {
            var _this = this;
            this.serverFile = serverFile;
            this.index = new Window(0, this.visibleLines);
            return this.serverFile.readChunk().then(function (chunk) {
                _this.chunks = [chunk];
                _this.lines = _.map(chunk.lines, function (line) {
                    return line;
                });

                if (_this.lines.length > _this.visibleLines * 3)
                    return _this.currentLines();
                else
                    return _this.addChunk(chunk);
            });
        };

        LineBuffer.prototype.currentLines = function () {
            var list = [];
            var limit = Math.min(this.lines.length, this.index.bottom);
            for (var i = this.index.top; i <= limit; i++)
                list.push(this.lines[i]);
            return list;
        };

        LineBuffer.prototype.lineUp = function ($scope) {
            var _this = this;
            if (this.index.reachedTop())
                return;

            if (!this.index.inBottomThird(this.lines.length) && this.index.inTopThird(this.lines.length) && this.chunks.length && this.serverFile) {
                var firstChunk = this.chunks[0];

                if (firstChunk.start !== 0) {
                    this.serverFile.previousChunk(firstChunk).then(function (chunk) {
                        if (_this.chunks.length > 2) {
                            var lastChunk = _this.chunks.pop();
                            var count = lastChunk.lines.length;

                            _this.lines.splice(_this.lines.length - count, count);

                            _this.index = _this.index.shift(count);
                        }

                        _this.lines = chunk.lines.concat(_this.lines);

                        _this.chunks.unshift(chunk);
                    });
                }
            }
            this.index = this.index.up();
            return this.lines[this.index.top];
        };

        LineBuffer.prototype.lineDown = function ($scope) {
            var _this = this;
            if (this.index.reachedEnd(this.lines.length))
                return;

            if (this.index.inBottomThird(this.lines.length) && !this.index.inTopThird(this.lines.length) && this.chunks.length && this.serverFile) {
                var lastChunk = this.chunks[this.chunks.length - 1];
                this.serverFile.nextChunk(lastChunk).then(function (chunk) {
                    if (_this.chunks.length > 2) {
                        var firstChunk = _this.chunks.shift();

                        var count = firstChunk.lines.length;

                        _this.lines.splice(0, count);

                        _this.index = _this.index.shift(-count);
                    }

                    var al = _this.lines.length;
                    var bl = chunk.lines.length;
                    var i = 0;
                    while (i < bl)
                        _this.lines[al++] = chunk.lines[i++];

                    _this.chunks.push(chunk);
                });
            }
            this.index = this.index.down();
            return this.lines[this.index.bottom];
        };
        return LineBuffer;
    })();
    TestModule.LineBuffer = LineBuffer;

    var TestController = (function () {
        function TestController($scope, $q) {
            var _this = this;
            this.$scope = $scope;
            this.$q = $q;
            this.buffer = new LineBuffer(10);
            this.connectionOpen = false;
            this.filename = 'angular.js';
            $scope.model = this;
            var onConnectionChanged = function (open) {
                return $scope.$apply(function () {
                    _this.connectionOpen = open;
                });
            };
            this.serverFile = new ServerFile($q, 64, onConnectionChanged);
        }
        TestController.prototype.keypressed = function (event) {
            if (event.keyCode == 38)
                this.lineUp();
            else if (event.keyCode == 40)
                this.lineDown();
        };

        TestController.prototype.renderLine = function (msg) {
            return "<p>" + msg + "</p>";
        };

        TestController.prototype.lineUp = function () {
            var line = this.buffer.lineUp(this.$scope);
            if (line) {
                var viewer = $("#viewer");
                var children = viewer.children();
                if (children.length > 0) {
                    children[children.length - 1].remove();
                    viewer.prepend(this.renderLine(line));
                }
            }
        };

        TestController.prototype.lineDown = function () {
            var line = this.buffer.lineDown(this.$scope);
            if (line) {
                var viewer = $("#viewer");
                viewer.children()[0].remove();
                viewer.append(this.renderLine(line));
            }
        };

        TestController.prototype.openFile = function (filename) {
            var _this = this;
            this.serverFile.openFile(filename).then(function (response) {
                _this.buffer.setFile(_this.serverFile).then(function (lines) {
                    var viewer = $("#viewer");
                    var p = _.reduce(lines, function (acc, line) {
                        return acc + _this.renderLine(line);
                    }, "");
                    viewer.html(p);
                }).catch(function (response) {
                    console.log('failure', response);
                });
            }).catch(function (response) {
                console.log('failure', response);
            });
        };
        TestController.$inject = ['$scope', '$q'];
        return TestController;
    })();
    TestModule.TestController = TestController;
})(TestModule || (TestModule = {}));
