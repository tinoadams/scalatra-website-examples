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
            return new Window(Math.max(0, this.top + lineCount), this.height);
        };
        return Window;
    })();

    var Chunk = (function () {
        function Chunk(start, end, lines) {
            this.start = start;
            this.end = end;
            this.lines = lines;
        }
        return Chunk;
    })();

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
            var data = { command: 'read_file', start: start, end: end };
            return this.send(data).then(function (response) {
                if (_this.isNull(response.lines) || !$.isArray(response.lines) || _this.isNull(response.actual_start) || _this.isNull(response.actual_end))
                    return _this.$q.reject(["read_file response is invalid"]);
                _this.start = response.actual_start;
                _this.end = response.actual_end;
                var lines = _.map(response.lines, function (line) {
                    return line;
                });
                return new Chunk(response.actual_start, response.actual_end, lines);
            });
        };

        ServerFile.prototype.nextChunk = function (current) {
            return this.readChunk(current.end + 1, current.end + this.chunkSize);
        };

        ServerFile.prototype.previousChunk = function (current) {
            return this.readChunk(current.start - this.chunkSize, current.start);
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

    var LineBuffer = (function () {
        function LineBuffer(bufferSize, visibleLines) {
            this.bufferSize = bufferSize;
            this.visibleLines = visibleLines;
            this.chunks = [];
            this.buffer = [];
            this.index = new Window(0, 0);
            this.index = new Window(0, 0);
        }
        LineBuffer.prototype.setFile = function (serverFile) {
            var _this = this;
            this.serverFile = serverFile;
            this.index = new Window(0, this.visibleLines);
            return this.serverFile.readChunk().then(function (chunk) {
                _this.chunks.push(chunk);
                _this.buffer = chunk.lines;
                return _this.currentLines();
            });
        };

        LineBuffer.prototype.currentLines = function () {
            var list = [];
            var limit = Math.min(this.buffer.length, this.index.bottom);
            for (var i = this.index.top; i <= limit; i++)
                list.push(this.buffer[i]);
            return list;
        };

        LineBuffer.prototype.lineUp = function () {
            var _this = this;
            if (this.index.reachedTop())
                return;

            if (!this.index.inBottomThird(this.buffer.length) && this.index.inTopThird(this.buffer.length) && this.chunks.length && this.serverFile) {
                var firstChunk = this.chunks[0];

                if (firstChunk.start === 0)
                    return;
                this.serverFile.previousChunk(firstChunk).then(function (chunk) {
                    console.log("++++++++index , buffer, chunks", _this.index, _this.buffer.length, _this.chunks.length);
                    if (_this.chunks.length > 2) {
                        var lastChunk = _this.chunks[_this.chunks.length - 1];
                        var count = lastChunk.lines.length;
                        console.log("count , buffer", count, _this.buffer.length);
                        _this.buffer.splice(_this.buffer.length - count, count);
                        console.log("count , buffer", count, _this.buffer.length);

                        _this.index = _this.index.shift(count);

                        _this.chunks.pop();
                    }

                    _this.buffer = chunk.lines.concat(_this.buffer);

                    _this.chunks.unshift(chunk);
                    console.log("index , buffer, chunks", _this.index, _this.buffer.length, _this.chunks.length);
                });
            }
            this.index = this.index.up();
            return this.index.top + this.buffer[this.index.top];
        };

        LineBuffer.prototype.lineDown = function () {
            var _this = this;
            if (this.index.reachedEnd(this.buffer.length))
                return;

            if (this.index.inBottomThird(this.buffer.length) && !this.index.inTopThird(this.buffer.length) && this.chunks.length && this.serverFile) {
                var lastChunk = this.chunks[this.chunks.length - 1];
                this.serverFile.nextChunk(lastChunk).then(function (chunk) {
                    console.log(_this.chunks);
                    var chunks = [];
                    for (var i = 0; i < _this.chunks.length; i++)
                        chunks.push(_this.chunks[i]);
                    console.log(chunks);
                    console.log("index , buffer, chunks", _this.index, _this.buffer.length, _this.chunks.length);
                    if (_this.chunks.length > 2) {
                        var firstChunk = chunks.shift();
                        console.log("firstchunk", firstChunk);
                        var count = firstChunk.lines.length;
                        console.log("count , buffer", count, _this.buffer.length);
                        _this.buffer.splice(0, count);
                        console.log("count , buffer", count, _this.buffer.length);

                        _this.index = _this.index.shift(-count);
                    }

                    Array.prototype.push.apply(_this.buffer, chunk.lines);

                    chunks.push(chunk);
                    _this.chunks = chunks;
                    console.log("index , buffer, chunks", _this.index, _this.buffer.length, _this.chunks.length);
                });
            }
            this.index = this.index.down();
            return this.index.bottom + this.buffer[this.index.bottom];
        };
        return LineBuffer;
    })();

    var TestController = (function () {
        function TestController($scope, $q) {
            var _this = this;
            this.$scope = $scope;
            this.$q = $q;
            this.buffer = new LineBuffer(100, 10);
            this.connectionOpen = false;
            this.filename = 'angular.js';
            $scope.model = this;
            var onConnectionChanged = function (open) {
                return $scope.$apply(function () {
                    _this.connectionOpen = open;
                });
            };
            this.serverFile = new ServerFile($q, 1024, onConnectionChanged);
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
            var line = this.buffer.lineUp();
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
            var line = this.buffer.lineDown();
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
                    _.each(lines, function (line, index) {
                        return viewer.append(_this.renderLine(index + line));
                    });
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
