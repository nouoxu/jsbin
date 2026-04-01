// JSBin Runtime - Node.js net
// Provides networking for JSBin compiled binaries

import { EventEmitter } from "./events.js";

class Socket extends EventEmitter {
    constructor(options) {
        super();
        this.writable = true;
        this.readable = true;
        this.destroyed = false;
    }
    connect(port, host, callback) { return this; }
    destroy() { this.destroyed = true; }
    end(chunk, encoding, callback) { return this; }
    write(chunk, encoding, callback) { return true; }
    setEncoding(encoding) { return this; }
    pause() { return this; }
    resume() { return this; }
    setTimeout(timeout, callback) { return this; }
    setNoDelay(noDelay) { return this; }
    setKeepAlive(enable, initialDelay) { return this; }
    address() { return { port: 0, family: "IPv4", address: "0.0.0.0" }; }
}

class Server extends EventEmitter {
    constructor(options, onConnect) {
        super();
        if (typeof options === "function") { onConnect = options; options = {}; }
        if (onConnect) this.on("connection", onConnect);
        this.listening = false;
    }
    listen(port, host, backlog, callback) {
        if (typeof host === "function") { callback = host; host = undefined; }
        if (typeof backlog === "function") { callback = backlog; backlog = undefined; }
        this.listening = true;
        if (callback) callback();
        return this;
    }
    close() { return this; }
    getConnections(callback) { if (callback) callback(null, 0); return this; }
    address() { return { port: 0, family: "IPv4", address: "0.0.0.0" }; }
    ref() { return this; }
    unref() { return this; }
}

function isIP(input) { return 0; }
function isIPv4(input) { return false; }
function isIPv6(input) { return false; }

export { Socket, Server, isIP, isIPv4, isIPv6 };
export default { Socket, Server, isIP, isIPv4, isIPv6 };
