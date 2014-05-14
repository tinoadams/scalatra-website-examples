/// <reference path="../lib/DefinitelyTyped/angularjs/angular.d.ts"/>
/// <reference path="../lib/DefinitelyTyped/underscore/underscore.d.ts"/>
/// <reference path="../lib/DefinitelyTyped/q/Q.d.ts"/>

module TestModule {

    export class Window {
        public bottom: number;

        constructor(public top: number, public height: number) {
            this.bottom = top + height - 1;
        }

        reachedTop(): boolean {
            return this.top <= 0;
        }

        reachedEnd(lineCount: number): boolean {
            return this.bottom >= lineCount - 1;
        }

        inTopThird(lineCount: number): boolean {
            var boundary = Math.floor(lineCount / 3);
            return this.top <= boundary;
        }

        inBottomThird(lineCount: number): boolean {
            var boundary = Math.floor(lineCount / 3) * 2;
            return this.bottom >= boundary;
        }

        up(): Window {
            return new Window(this.top - 1, this.height);
        }

        down(): Window {
            return new Window(this.top + 1, this.height);
        }

        shift(lineCount: number): Window {
            return new Window(this.top + lineCount, this.height);
        }

    }

    export interface ConnectionChangeCallback {
        (boolean): void
    }


    export class Chunk {
        constructor(public start: number, public end: number, public lines: string[]) {
        }
    }

    export class ServerFile {
        private socket = (<any>$).atmosphere;
        private transport = 'websocket';
        private fallbackTransport = 'long-polling';
        private subSocket: any;
        private open = false;
        private connectionChangeListener: ConnectionChangeCallback[] = [];
        private futures: { id: number; future: ng.IDeferred<any> }[] = [];
        private futureUUID = 0;

        private start = 0;
        private end = 0;

        constructor(private $q: ng.IQService, private chunkSize: number, callback: ConnectionChangeCallback = null) {
            this.end = this.start + chunkSize;
            if (callback) this.onConnectionChanged(callback);

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
            request.onOpen = (response) => {
                this.transport = response.transport;
                this.setOpen(true);
                console.log("open", response.transport);
            }
            request.onReconnect = (rq, rs) => {
                this.socket.info("Reconnecting")
            }
            request.onMessage = (rs) => {
                var message = rs.responseBody;
                try {
                    var json = (<any>jQuery).parseJSON(message);
                    console.log("got a message", json)

                    // try to match the message id with a deferred callback
                    var position = -1;
                    for (var index in this.futures)
                        if (this.futures[index].id == json.id)
                            position = index;
                    if (position == -1) {
                        console.log('This doesn\'t look like a valid response object: id does not match anything');
                        return;
                    }
                    var deferred = this.futures[position].future;
                    this.futures.splice(position, 1);

                    if (json.errors)
                        deferred.reject(json);
                    else
                        deferred.resolve(json);
                }
                catch (e) {
                    console.log('This doesn\'t look like a valid JSON object: ', message.data);
                    return;
                }
            }
            request.onClose = (rs) => {
                this.setOpen(false);
            }

            request.onError = (rs) => {
                console.log("error", rs);
            }

            this.subSocket = this.socket.subscribe(request);
        }

        private send(data: any): ng.IPromise<any> {
            var deferred = this.$q.defer<any>();
            if (this.open) {
                // store the deferred callback until we receive a message back in onMessage
                data.id = this.futureUUID++;
                this.futures.push({ id: data.id, future: deferred });
                var json = (<any>jQuery).stringifyJSON(data);
                console.log("Sending: " + json);
                this.subSocket.push(json);
            }
            else {
                deferred.reject(["Connection is not open"]);
            }

            return deferred.promise;
        }

        openFile(name: string): ng.IPromise<any> {
            var data = { command: 'open_file', filename: name };
            return this.send(data);
        }

        private isNull(that): boolean {
            return that === null || that === undefined;
        }

        readChunk(start: number= 0, end: number= this.chunkSize): ng.IPromise<Chunk> {
            var data = { command: 'read_file', start: Math.max(0, start), end: end };
            return this.send(data)
                .then((response): any => {
                    if (
                        this.isNull(response.lines) || !$.isArray(response.lines)
                        || this.isNull(response.actual_start) || this.isNull(response.actual_end)
                        )
                        // hack to make the typesystem happy as Angular promises are buggy
                        return this.$q.reject(["read_file response is invalid"]);
                    this.start = response.actual_start;
                    this.end = response.actual_end;
                    console.log('start,end', response.actual_start, response.actual_end);
                    var lines = _.map(response.lines, (line: string) => line + "(" + response.id + ")");
                    lines.push('------------------' + "(" + response.id + ")");
                    return new Chunk(response.actual_start, response.actual_end, lines);
                });
        }

        nextChunk(current: Chunk): ng.IPromise<Chunk> {
            var start = current.end + 1;
            return this.readChunk(start, start + this.chunkSize);
        }

        previousChunk(current: Chunk): ng.IPromise<Chunk> {
            var start = current.start - this.chunkSize - 1;
            return this.readChunk(start, start + this.chunkSize);
        }

        onConnectionChanged(callback: ConnectionChangeCallback) {
            this.connectionChangeListener.push(callback);
        }

        private setOpen(open: boolean) {
            this.futures = [];
            this.open = open;
            _.each(this.connectionChangeListener, (callback) => callback(open))
        }
    }

    export class LineBuffer {
        private chunks: Chunk[] = [];
        public lines: string[] = [];
        public index: Window = new Window(0, 0);
        private serverFile: ServerFile;

        constructor(private visibleLines: number) {
            this.index = new Window(0, 0);
        }

        // again Angular .then accepts simple values or another promise in return (map and flatMap) which makes the type incorrect
        private addChunk(lastChunk: Chunk): any {
            return this.serverFile.nextChunk(lastChunk)
                .then((chunk): any => {
                    this.chunks.push(chunk);
                    // append lines to buffer
                    var al = this.lines.length;
                    var bl = chunk.lines.length;
                    var i = 0;
                    while (i < bl) this.lines[al++] = chunk.lines[i++];
                    // rinse and repeat
                    if (this.lines.length > this.visibleLines * 3)
                        return this.currentLines();
                    else
                        return this.addChunk(chunk);
                });
        }

        setFile(serverFile: ServerFile): ng.IPromise<string[]> {
            this.serverFile = serverFile;
            this.index = new Window(0, this.visibleLines);
            return this.serverFile.readChunk()
                .then((chunk) => {
                    this.chunks = [chunk];
                    this.lines = _.map(chunk.lines, (line) => line);
                    // make sure we load at least three time the number of visible lines
                    if (this.lines.length > this.visibleLines * 3)
                        return this.currentLines();
                    else
                        return <string[]>this.addChunk(chunk);
                });
        }

        currentLines(): string[] {
            var list: string[] = [];
            var limit = Math.min(this.lines.length, this.index.bottom);
            for (var i = this.index.top; i <= limit; i++)
                list.push(this.lines[i]);
            return list;
        }

        lineUp($scope): string {
            if (this.index.reachedTop()) return;
            // append new lines to the buffer and drop old ones on top
            if (!this.index.inBottomThird(this.lines.length) && this.index.inTopThird(this.lines.length) && this.chunks.length && this.serverFile) {
                var firstChunk = this.chunks[0];
                // dont try to read beyond the start of a file
                if (firstChunk.start !== 0) {
                    this.serverFile.previousChunk(firstChunk)
                        .then((chunk) => {
                            //                        console.log("++++++++index , buffer, chunks", this.index, this.buffer.length, this.chunks.length);
                            if (this.chunks.length > 2) {
                                // drop the first chunk
                                var lastChunk = this.chunks.pop();
                                var count = lastChunk.lines.length;
                                //                            console.log("count , buffer", count, this.buffer.length);
                                this.lines.splice(this.lines.length - count, count);
                                //                            console.log("count , buffer", count, this.buffer.length);
                                // adjust the window
                                this.index = this.index.shift(count);

                            }
                            // prepend new lines to the buffer
                            this.lines = chunk.lines.concat(this.lines);
                            //$scope.$apply();

                            // add the new one at the top
                            this.chunks.unshift(chunk);
                            //                        console.log("index , buffer, chunks", this.index, this.buffer.length, this.chunks.length);
                        });
                }
            }
            this.index = this.index.up();
            return this.lines[this.index.top];
        }

        lineDown($scope): string {
            if (this.index.reachedEnd(this.lines.length)) return;
            // append new lines to the buffer and drop old ones on top
            if (this.index.inBottomThird(this.lines.length) && !this.index.inTopThird(this.lines.length) && this.chunks.length && this.serverFile) {
                var lastChunk = this.chunks[this.chunks.length - 1];
                this.serverFile.nextChunk(lastChunk)
                    .then((chunk) => {
                        //                        console.log("index , buffer, chunks", this.index, this.buffer.length, this.chunks.length);
                        if (this.chunks.length > 2) {
                            // drop the first chunk
                            var firstChunk = this.chunks.shift();
                            //                            console.log("firstchunk", firstChunk);
                            var count = firstChunk.lines.length;
                            //                            console.log("count , buffer", count, this.buffer.length);
                            this.lines.splice(0, count);
                            //                            console.log("count , buffer", count, this.buffer.length);
                            // adjust the window
                            this.index = this.index.shift(-count);
                        }
                        // add the new lines to the buffer
                        //                        Array.prototype.push.apply(this.buffer, chunk.lines);
                        //                        _.each(chunk.lines, (line) => this.buffer.push(line));
                        var al = this.lines.length;
                        var bl = chunk.lines.length;
                        var i = 0;
                        while (i < bl) this.lines[al++] = chunk.lines[i++];
                        //$scope.$apply();

                        // add the new one at the bottom
                        this.chunks.push(chunk);
                        //                        console.log("index , buffer, chunks", this.index, this.buffer.length, this.chunks.length);
                    });
            }
            this.index = this.index.down();
            return this.lines[this.index.bottom];
        }
    }

    export class TestController {
        private serverFile: ServerFile;
        public buffer = new LineBuffer(10);
        public connectionOpen = false;
        public filename = 'angular.js';

        static $inject = ['$scope', '$q'];
        constructor(private $scope: any, private $q: ng.IQService) {
            $scope.model = this;
            var onConnectionChanged = (open) => $scope.$apply(() => { this.connectionOpen = open });
            this.serverFile = new ServerFile($q, 64, onConnectionChanged);
        }

        keypressed(event): void {
            if (event.keyCode == 38)
                this.lineUp();
            else if (event.keyCode == 40)
                this.lineDown();
        }

        private renderLine(msg: string): string {
            return "<p>" + msg + "</p>";
        }

        lineUp(): void {
            var line = this.buffer.lineUp(this.$scope);
            if (line) {
                var viewer: any = $("#viewer");
                var children: any = viewer.children();
                if (children.length > 0) {
                    children[children.length - 1].remove();
                    viewer.prepend(this.renderLine(line));
                }
            }
        }

        lineDown(): void {
            var line = this.buffer.lineDown(this.$scope);
            if (line) {
                var viewer: any = $("#viewer");
                viewer.children()[0].remove();
                viewer.append(this.renderLine(line));
            }
        }

        openFile(filename: string) {
            this.serverFile.openFile(filename)
                .then((response) => {
                    this.buffer.setFile(this.serverFile)
                        .then((lines) => {
                            var viewer: any = $("#viewer");
                            var p = _.reduce(lines, (acc: string, line) => acc + this.renderLine(line), "");
                            viewer.html(p);
                        })
                        .catch((response) => {
                            console.log('failure', response);
                        });

                })
                .catch((response) => {
                    console.log('failure', response);
                });
        }
    }
}