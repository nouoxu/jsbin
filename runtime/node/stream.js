// JSBin Runtime - Node.js stream
// Provides Stream classes for JSBin compiled binaries

import { EventEmitter } from "./events.js";

class Readable extends EventEmitter {
    constructor(options) {
        super();
        this.readableHighWaterMark = 0;
        this.readableLength = 0;
        this._readableState = {};
        this.destroyed = false;
    }
    _read(size) {}
    read(size) { return null; }
    push(chunk) { return false; }
    unshift(chunk) { return false; }
    isPaused() { return true; }
    pause() { return this; }
    resume() { return this; }
    pipe(dest, options) { return dest; }
    destroy(err) { this.destroyed = true; }
}

class Writable extends EventEmitter {
    constructor(options) {
        super();
        this.writableHighWaterMark = 0;
        this.writableLength = 0;
        this._writableState = {};
        this.destroyed = false;
    }
    _write(chunk, encoding, callback) { callback && callback(); }
    _writev(chunks, callback) { callback && callback(); }
    write(chunk, encoding, callback) { return true; }
    end(chunk, encoding, callback) { if (callback) callback(); }
    cork() {}
    uncork() {}
    setDefaultEncoding(encoding) { return this; }
    destroy(err) { this.destroyed = true; }
}

class Duplex extends Readable {
    constructor(options) {
        super(options);
        this.writable = new Writable(options);
    }
    _write(chunk, encoding, callback) { this.writable._write(chunk, encoding, callback); }
    _read(size) {}
    write(chunk, encoding, callback) { return this.writable.write(chunk, encoding, callback); }
    end(chunk, encoding, callback) { return this.writable.end(chunk, encoding, callback); }
    cork() { this.writable.cork(); }
    uncork() { this.writable.uncork(); }
}

class Transform extends Duplex {
    _transform(chunk, encoding, callback) { callback(null, chunk); }
    _flush(callback) { callback && callback(); }
}

class PassThrough extends Transform {}

export { Readable, Writable, Duplex, Transform, PassThrough };
export default { Readable, Writable, Duplex, Transform, PassThrough };
