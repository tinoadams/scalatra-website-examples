var TestModule;
(function (TestModule) {
    var Window = (function () {
        function Window(top, height) {
            this.top = top;
            this.height = height;
            this.bottom = top + height;
        }
        Window.prototype.reachedTop = function () {
            return this.top <= 0;
        };

        Window.prototype.reachedEnd = function (lineCount) {
            return this.bottom >= lineCount;
        };

        Window.prototype.inTopThird = function (lineCount) {
            var boundary = Math.floor(lineCount / 3);
            return this.top < boundary;
        };

        Window.prototype.inBottomThird = function (lineCount) {
            var boundary = Math.floor(lineCount / 3) * 2;
            return this.bottom >= boundary;
        };

        Window.prototype.up = function (lines) {
            return new Window(Math.max(0, this.top - lines), this.height);
        };

        Window.prototype.down = function (lines, lineCount) {
            return new Window(Math.min(this.top + lines, lineCount - this.height), this.height);
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
                    return line;
                });

                return new Chunk(response.actual_start, response.actual_end, lines);
            });
        };

        ServerFile.prototype.nextChunk = function (current) {
            var start = current.end;
            return this.readChunk(start, start + this.chunkSize);
        };

        ServerFile.prototype.previousChunk = function (current) {
            var start = current.start - this.chunkSize;
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
            this.visibleLinesBufferFactor = 30;
            this.chunks = [];
            this.lines = [];
            this.index = new Window(0, 0);
            this.lineCount = 0;
            this.index = new Window(0, 0);
        }
        LineBuffer.prototype.suffientChunksLoaded = function () {
            return this.lines.length > this.visibleLines * this.visibleLinesBufferFactor;
        };

        LineBuffer.prototype.addChunk = function (lastChunk) {
            var _this = this;
            return this.serverFile.nextChunk(lastChunk).then(function (chunk) {
                _this.chunks.push(chunk);

                var al = _this.lines.length;
                var bl = chunk.lines.length;
                var i = 0;
                while (i < bl)
                    _this.lines[al++] = chunk.lines[i++];

                if (_this.suffientChunksLoaded())
                    return _this.currentLines();
                else
                    return _this.addChunk(chunk);
            });
        };

        LineBuffer.prototype.setFile = function (serverFile) {
            var _this = this;
            return serverFile.readChunk().then(function (chunk) {
                _this.serverFile = serverFile;
                _this.index = new Window(0, _this.visibleLines);
                _this.chunks = [chunk];
                _this.lines = _.map(chunk.lines, function (line) {
                    return line;
                });

                if (_this.suffientChunksLoaded())
                    return _this.currentLines();
                else
                    return _this.addChunk(chunk);
            });
        };

        LineBuffer.prototype.currentLines = function () {
            var list = [];
            var limit = Math.min(this.lines.length, this.index.bottom);
            for (var i = this.index.top; i < limit; i++)
                list.push(this.lines[i]);
            return list;
        };

        LineBuffer.prototype.bufferedLineCount = function () {
            this.lineCount = _.reduce(this.chunks, function (count, chunk) {
                return count + chunk.lines.length;
            }, 0);
            return this.lineCount;
        };

        LineBuffer.prototype.up = function (lines) {
            var _this = this;
            if (this.index.reachedTop())
                return null;
            this.index = this.index.up(lines);

            var lineCount = this.bufferedLineCount();
            if (!this.index.inBottomThird(lineCount) && this.index.inTopThird(lineCount) && this.serverFile) {
                var firstChunk = this.chunks[0];

                if (firstChunk.start > 0) {
                    this.serverFile.previousChunk(firstChunk).then(function (chunk) {
                        if (_this.suffientChunksLoaded() && _this.chunks.length > 2) {
                            var lastChunk = _this.chunks.pop();
                            var count = lastChunk.lines.length;
                            _this.lines.splice(_this.lines.length - count, count);
                        }

                        _this.lines = chunk.lines.concat(_this.lines);

                        _this.index = _this.index.shift(chunk.lines.length);

                        _this.chunks.unshift(chunk);
                    });
                }
            }
            return this.lines.slice(this.index.top, this.index.top + lines);
        };

        LineBuffer.prototype.down = function (lines) {
            var _this = this;
            if (this.index.reachedEnd(this.lines.length))
                return null;
            this.index = this.index.down(lines, this.lines.length);

            var lineCount = this.bufferedLineCount();
            if (this.index.inBottomThird(lineCount) && !this.index.inTopThird(lineCount) && this.serverFile) {
                var lastChunk = this.chunks[this.chunks.length - 1];
                this.serverFile.nextChunk(lastChunk).then(function (chunk) {
                    if (_this.suffientChunksLoaded() && _this.chunks.length > 2) {
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
            var from = this.index.bottom - lines;
            return this.lines.slice(from, from + lines);
        };

        LineBuffer.prototype.lineUp = function () {
            var line = this.up(1);
            if (!line || !line.length)
                return null;
            return line[0];
        };

        LineBuffer.prototype.lineDown = function () {
            var line = this.down(1);
            if (!line || !line.length)
                return null;
            return line[0];
        };

        LineBuffer.prototype.pageUp = function () {
            return this.up(this.visibleLines);
        };

        LineBuffer.prototype.pageDown = function () {
            return this.down(this.visibleLines);
        };
        return LineBuffer;
    })();
    TestModule.LineBuffer = LineBuffer;

    var TestController = (function () {
        function TestController($scope, $q) {
            var _this = this;
            this.$scope = $scope;
            this.$q = $q;
            this.buffer = new LineBuffer(20);
            this.connectionOpen = false;
            this.filename = 'nusoap.php';
            $scope.model = this;
            var onConnectionChanged = function (open) {
                return $scope.$apply(function () {
                    _this.connectionOpen = open;
                });
            };
            this.serverFile = new ServerFile($q, 2048, onConnectionChanged);
        }
        TestController.prototype.keypressed = function (event) {
            if (event.keyCode == 38)
                this.lineUp();
            else if (event.keyCode == 40)
                this.lineDown();
            else if (event.keyCode == 33)
                this.pageUp();
            else if (event.keyCode == 34)
                this.pageDown();
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

        TestController.prototype.showLines = function (lines) {
            var _this = this;
            var viewer = $("#viewer");
            var p = _.reduce(lines, function (acc, line) {
                return acc + _this.renderLine(line);
            }, "");
            viewer.html(p);
        };

        TestController.prototype.pageUp = function () {
            var lines = this.buffer.pageUp();
            if (lines && lines.length)
                this.showLines(lines);
        };

        TestController.prototype.pageDown = function () {
            var lines = this.buffer.pageDown();
            if (lines && lines.length)
                this.showLines(lines);
        };

        TestController.prototype.openFile = function (filename) {
            var _this = this;
            this.serverFile.openFile(filename).then(function (response) {
                _this.buffer.setFile(_this.serverFile).then(function (lines) {
                    return _this.showLines(lines);
                }).catch(function (response) {
                    return console.log('failure', response);
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
