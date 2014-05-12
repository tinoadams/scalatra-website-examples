/// <reference path="../lib/DefinitelyTyped/angularjs/angular.d.ts"/>
/// <reference path="../lib/DefinitelyTyped/underscore/underscore.d.ts"/>

module TestModule {

    class Window {
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

        inTopThird(lineCount: number) {
            var boundary = Math.ceil(lineCount / 3);
            return this.top <= boundary;
        }

        inBottomThird(lineCount: number) {
            var boundary = Math.ceil(lineCount / 3) * 2;
            return this.bottom >= boundary;
        }

        up(): Window {
            return new Window(this.top - 1, this.height);
        }

        down(): Window {
            return new Window(this.top + 1, this.height);
        }
    }

    class ServerFile {
        private socket = (<any>$).atmosphere;
        private transport = 'websocket';
        private fallbackTransport = 'long-polling';
        private subSocket: any;
        private open = false;

        private start = 0;
        private end = 0;

        constructor(private chunkSize: number) {
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

        openFile(name: string): void {
        }

        nextChunk(): string[] {
            return [];
        }

        previousChunk(): string[] {
            return [];
        }


        onOpen(response) {
            this.transport = response.transport;
            this.open = true;
            console.log("open", response.transport);
            //                this.subSocket.pushLocal("Name?");
        }

        onReconnect(rq, rs) {
            this.socket.info("Reconnecting")
        }

        onMessage(rs) {
            var message = rs.responseBody;
            try {
                var json = jQuery.parseJSON(message);
                console.log("got a message", json)
            }
            catch (e) {
                console.log('This doesn\'t look like a valid JSON object: ', message.data);
                return;
            }
        }

        onClose(rs) {
            this.open = false;
        }

        onError(rs) {
        }
    }

    class LineBuffer {
        private buffer: string[] = [];
        private index = new Window(0, 2);

        constructor(private bufferSize: number, private visibleLines: number) {
            this.buffer = _.range(bufferSize).map((i) => {return "Line " + i });
        }

        currentLines(): string[] {
            var list: string[] = [];
            for (var i = this.index.top; i <= this.index.bottom; i++)
                list.push(this.buffer[i]);
            return list;
        }

        up(): string {
            if (this.index.reachedTop()) return;
            this.index = this.index.up();
            return this.buffer[this.index.top];
        }

        down(): string {
            if (this.index.reachedEnd(this.buffer.length)) return;
            this.index = this.index.down();
            return this.buffer[this.index.bottom];
        }
    }


    export class TestController {

        private file: ServerFile;
        private buffer = new LineBuffer(10, 2);
        public lines: string[] = [];

        static $inject = ['$scope'];
        constructor(private $scope: any) {
            $scope.model = this;
            this.file = new ServerFile(2)
            this.lines = this.buffer.currentLines();
        }

        keypressed(event): void {
            if (event.keyCode == 38)
                this.up();
            else if (event.keyCode == 40)
                this.down();
        }

        up(): void {
            var line = this.buffer.up();
            if (line) {
                this.lines.unshift(line);
                this.lines.pop();
            }
        }

        down(): void {
            var line = this.buffer.down();
            if (line) {
                this.lines.shift();
                this.lines.push(line);
            }
        }
    }
}