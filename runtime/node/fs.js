// JSBin Runtime - Node.js fs
// Provides file system operations for JSBin compiled binaries

import { JStoCstring, cstringToJS } from "./_string.js";
import { getSyscall } from "./constants.js";

const _proc = __get_process();
const platform = (_proc && _proc.platform) || "macos";
const arch = (_proc && _proc.arch) || "arm64";

// File flags
const O_RDONLY = 0, O_WRONLY = 1, O_RDWR = 2;
const O_CREAT = 0x40, O_TRUNC = 0x200, O_APPEND = 0x400;

function openFlags(flagStr) {
    if (!flagStr) return O_RDONLY;
    switch (flagStr) {
        case "r": return O_RDONLY;
        case "r+": return O_RDWR;
        case "w": return O_WRONLY | O_CREAT | O_TRUNC;
        case "w+": return O_RDWR | O_CREAT | O_TRUNC;
        case "a": return O_WRONLY | O_CREAT | O_APPEND;
        case "a+": return O_RDWR | O_CREAT | O_APPEND;
        default: return O_RDONLY;
    }
}

class Stats {
    constructor() {
        this.size = 0; this.mtime = new Date(); this.atime = new Date();
        this.ctime = new Date(); this.mode = 0; this.uid = 0;
        this.gid = 0; this.dev = 0; this.ino = 0; this.nlink = 0;
    }
    isFile() { return false; }
    isDirectory() { return false; }
    isBlockDevice() { return false; }
    isCharacterDevice() { return false; }
    isFIFO() { return false; }
    isSocket() { return false; }
}

class Dirent {
    constructor(name, isDir = false, isFile = false) {
        this.name = name;
        this.isDirectory = () => isDir;
        this.isFile = () => isFile;
        this.isBlockDevice = () => false;
        this.isCharacterDevice = () => false;
        this.isFIFO = () => false;
        this.isSymbolicLink = () => false;
        this.isSocket = () => false;
    }
}

class Dir {
    constructor(path) {
        this.path = path;
        this._entries = [];
        this._index = 0;
    }
    read() {
        if (this._index >= this._entries.length) return null;
        return this._entries[this._index++];
    }
    close() {}
    *[Symbol.iterator]() {
        while (true) {
            const e = this.read();
            if (!e) break;
            yield e;
        }
    }
}

function writeCString(str, buf) {
    JStoCstring(str, buf, 65536);
}

class fs {
    static existsSync(p) {
        const sc = getSyscall("open") || getSyscall("openat");
        if (!sc) return true;
        const pathBuf = __alloc(p.length + 10);
        writeCString(p + "\x00", pathBuf);
        const fd = __syscall(sc, pathBuf, O_RDONLY, 0);
        if (fd >= 0) {
            __syscall(getSyscall("close"), fd);
            return true;
        }
        return false;
    }

    static readFileSync(p, enc) {
        const scOpen = getSyscall("open") || getSyscall("openat");
        const scRead = getSyscall("read");
        const scClose = getSyscall("close");
        if (!scOpen || !scRead || !scClose) return "";

        const pathBuf = __alloc(p.length + 10);
        writeCString(p + "\x00", pathBuf);

        let fd;
        if (platform === "linux" && arch === "arm64") {
            fd = __syscall(scOpen, -100, pathBuf, O_RDONLY, 0);
        } else {
            fd = __syscall(scOpen, pathBuf, O_RDONLY, 0);
        }
        if (fd < 0) return "";

        const buf = __alloc(65536);
        const bytesRead = __syscall(scRead, fd, buf, 65536);
        __syscall(scClose, fd);

        if (bytesRead <= 0) return "";
        return cstringToJS(buf);
    }

    static writeFileSync(p, data, enc) {
        const scOpen = getSyscall("open") || getSyscall("openat");
        const scWrite = getSyscall("write");
        const scClose = getSyscall("close");
        if (!scOpen || !scWrite || !scClose) return;

        const flags = platform === "linux" ? 0x241 : O_CREAT | O_WRONLY | O_TRUNC;
        const mode = platform === "linux" ? 0x1FF : 0o644;

        const pathBuf = __alloc(p.length + 10);
        writeCString(p + "\x00", pathBuf);

        let fd;
        if (platform === "linux" && arch === "arm64") {
            fd = __syscall(scOpen, -100, pathBuf, flags, mode);
        } else {
            fd = __syscall(scOpen, pathBuf, flags, mode);
        }
        if (fd < 0) return;

        if (typeof data === "string") {
            const dataBuf = __alloc(data.length + 1);
            JStoCstring(data, dataBuf, data.length + 1);
            __syscall(scWrite, fd, dataBuf, data.length);
        } else {
            __syscall(scWrite, fd, data, data.length || 0);
        }
        __syscall(scClose, fd);
    }

    static appendFileSync(p, data, enc) {
        const scOpen = getSyscall("open") || getSyscall("openat");
        const scWrite = getSyscall("write");
        const scClose = getSyscall("close");
        if (!scOpen || !scWrite || !scClose) return;

        const flags = platform === "linux" ? 0x241 : O_CREAT | O_WRONLY | O_APPEND;
        const mode = platform === "linux" ? 0x1FF : 0o644;

        const pathBuf = __alloc(p.length + 10);
        writeCString(p + "\x00", pathBuf);

        let fd;
        if (platform === "linux" && arch === "arm64") {
            fd = __syscall(scOpen, -100, pathBuf, flags, mode);
        } else {
            fd = __syscall(scOpen, pathBuf, flags, mode);
        }
        if (fd < 0) return;

        if (typeof data === "string") {
            const dataBuf = __alloc(data.length + 1);
            JStoCstring(data, dataBuf, data.length + 1);
            __syscall(scWrite, fd, dataBuf, data.length);
        } else {
            __syscall(scWrite, fd, data, data.length || 0);
        }
        __syscall(scClose, fd);
    }

    static copyFileSync(src, dest, flags) {
        const data = fs.readFileSync(src);
        if (data) fs.writeFileSync(dest, data);
    }

    static unlinkSync(p) {}
    static mkdirSync(p, options) {}
    static rmdirSync(p) {}
    static readdirSync(p, options) { return []; }

    static statSync(p) {
        const s = new Stats();
        s.isFile = () => true;
        return s;
    }

    static lstatSync(p) { return fs.statSync(p); }
    static accessSync(p, mode) { return fs.existsSync(p) ? 0 : -1; }

    static openSync(p, flags, mode) {
        const scOpen = getSyscall("open") || getSyscall("openat");
        if (!scOpen) return -1;
        const pathBuf = __alloc(p.length + 10);
        writeCString(p + "\x00", pathBuf);
        const openFlags = typeof flags === "string" ? openFlags(flags) : flags;
        const fileMode = mode || (platform === "linux" ? 0x1FF : 0o644);
        if (platform === "linux" && arch === "arm64") {
            return __syscall(scOpen, -100, pathBuf, openFlags, fileMode);
        }
        return __syscall(scOpen, pathBuf, openFlags, fileMode);
    }

    static closeSync(fd) { __syscall(getSyscall("close"), fd); }

    static readSync(fd, buffer, offset, length, position) {
        return __syscall(getSyscall("read"), fd, buffer, length);
    }

    static writeSync(fd, buffer, offset, length, position) {
        if (typeof buffer === "string") {
            const buf = __alloc(buffer.length + 1);
            JStoCstring(buffer, buf, buffer.length + 1);
            return __syscall(getSyscall("write"), fd, buf, buffer.length);
        }
        return __syscall(getSyscall("write"), fd, buffer, length || 0);
    }

    static createWriteStream(p, options) {
        return {
            write(data) { fs.appendFileSync(p, data); return true; },
            end() {}, on(event, cb) { return this; },
            once(event, cb) { return this; }, emit(event, ...args) { return true; }
        };
    }

    static createReadStream(p, options) {
        return {
            on(event, cb) { return this; },
            once(event, cb) { return this; }, close() {}
        };
    }
}

export { fs, Stats, Dirent, Dir };
export default fs;
