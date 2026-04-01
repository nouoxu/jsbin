// JSBin Runtime - Node.js Buffer
// Provides Buffer class for JSBin compiled binaries

export class Buffer {
    constructor(data, encoding, offset, length) {
        if (typeof data === "number") {
            this.data = new Array(data).fill(0);
        } else if (typeof data === "string") {
            this.data = data.split("").map(c => c.charCodeAt(0));
        } else if (Array.isArray(data)) {
            this.data = [...data];
        } else {
            this.data = [];
        }
        this.length = this.data.length;
    }

    static from(data, encoding, offset, length) {
        return new Buffer(data, encoding, offset, length);
    }

    static alloc(size, fill, encoding) {
        return new Buffer(size);
    }

    static isBuffer(obj) {
        return obj instanceof Buffer;
    }

    static isEncoding(encoding) {
        return ["utf8", "ascii", "latin1", "base64", "hex", "ucs2", "utf16le"].includes(encoding);
    }

    static concat(buffers, totalLength) {
        let len = 0;
        for (let b of buffers) len += b.length;
        const result = new Buffer(len);
        let pos = 0;
        for (let b of buffers) {
            for (let i = 0; i < b.length; i++) result.data[pos++] = b.data[i];
        }
        return result;
    }

    write(string, offset, length, encoding) {
        for (let i = 0; i < string.length && i < length; i++) {
            this.data[offset + i] = string.charCodeAt(i);
        }
        return string.length;
    }

    toString(encoding, start, end) {
        if (encoding === "hex") {
            let s = "";
            for (let i = (start || 0); i < (end || this.length); i++) {
                const hex = this.data[i].toString(16);
                s += hex.length === 1 ? "0" + hex : hex;
            }
            return s;
        }
        if (encoding === "base64") {
            // Simple base64 encoding
            const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
            let s = "";
            for (let i = (start || 0); i < (end || this.length); i += 3) {
                const b1 = this.data[i] || 0;
                const b2 = this.data[i + 1] || 0;
                const b3 = this.data[i + 2] || 0;
                s += chars[b1 >> 2] + chars[((b1 & 3) << 4) | (b2 >> 4)] + chars[((b2 & 15) << 2) | (b3 >> 6)] + chars[b3 & 63];
            }
            return s;
        }
        return this.data.slice(start || 0, end || this.length).map(b => String.fromCharCode(b)).join("");
    }

    equals(other) {
        if (this.length !== other.length) return false;
        for (let i = 0; i < this.length; i++) {
            if (this.data[i] !== other.data[i]) return false;
        }
        return true;
    }

    copy(target, targetStart, sourceStart, sourceEnd) {
        for (let i = sourceStart || 0; i < (sourceEnd || this.length); i++) {
            target.data[targetStart++] = this.data[i];
        }
    }

    fill(value, offset, end, encoding) {
        for (let i = offset || 0; i < (end || this.length); i++) {
            this.data[i] = typeof value === "number" ? value : value.charCodeAt(0);
        }
        return this;
    }

    indexOf(value, byteOffset, encoding) {
        if (typeof value === "string") value = value.charCodeAt(0);
        for (let i = byteOffset || 0; i < this.length; i++) {
            if (this.data[i] === value) return i;
        }
        return -1;
    }

    includes(value, byteOffset, encoding) {
        return this.indexOf(value, byteOffset, encoding) !== -1;
    }

    slice(start, end) {
        return new Buffer(this.data.slice(start, end));
    }

    subarray(start, end) {
        return this.slice(start, end);
    }

    compare(other) {
        for (let i = 0; i < Math.min(this.length, other.length); i++) {
            if (this.data[i] < other.data[i]) return -1;
            if (this.data[i] > other.data[i]) return 1;
        }
        return this.length - other.length;
    }

    swap16() {
        for (let i = 0; i < this.length; i += 2) {
            const tmp = this.data[i];
            this.data[i] = this.data[i + 1];
            this.data[i + 1] = tmp;
        }
        return this;
    }

    swap32() {
        for (let i = 0; i < this.length; i += 4) {
            const tmp = this.data[i];
            this.data[i] = this.data[i + 3];
            this.data[i + 3] = tmp;
            const tmp2 = this.data[i + 1];
            this.data[i + 1] = this.data[i + 2];
            this.data[i + 2] = tmp2;
        }
        return this;
    }

    swap64() { return this.swap32(); }

    writeUInt8(value, offset) { this.data[offset] = value & 0xff; }
    writeUInt16LE(value, offset) { this.data[offset] = value & 0xff; this.data[offset + 1] = (value >> 8) & 0xff; }
    writeUInt16BE(value, offset) { this.data[offset] = (value >> 8) & 0xff; this.data[offset + 1] = value & 0xff; }
    writeUInt32LE(value, offset) { for (let i = 0; i < 4; i++) this.data[offset + i] = (value >> (i * 8)) & 0xff; }
    writeUInt32BE(value, offset) { for (let i = 0; i < 4; i++) this.data[offset + 3 - i] = (value >> (i * 8)) & 0xff; }
    writeInt8(value, offset) { this.writeUInt8(value, offset); }
    writeInt16LE(value, offset) { this.writeUInt16LE(value, offset); }
    writeInt16BE(value, offset) { this.writeUInt16BE(value, offset); }
    writeInt32LE(value, offset) { this.writeUInt32LE(value, offset); }
    writeInt32BE(value, offset) { this.writeUInt32BE(value, offset); }

    readUInt8(offset) { return this.data[offset]; }
    readUInt16LE(offset) { return this.data[offset] | (this.data[offset + 1] << 8); }
    readUInt16BE(offset) { return (this.data[offset] << 8) | this.data[offset + 1]; }
    readUInt32LE(offset) { return this.data[offset] | (this.data[offset + 1] << 8) | (this.data[offset + 2] << 16) | (this.data[offset + 3] << 24); }
    readUInt32BE(offset) { return (this.data[offset] << 24) | (this.data[offset + 1] << 16) | (this.data[offset + 2] << 8) | this.data[offset + 3]; }
    readInt8(offset) { const v = this.data[offset]; return v < 128 ? v : v - 256; }
    readInt16LE(offset) { const v = this.readUInt16LE(offset); return v < 32768 ? v : v - 65536; }
    readInt16BE(offset) { const v = this.readUInt16BE(offset); return v < 32768 ? v : v - 65536; }
    readInt32LE(offset) { const v = this.readUInt32LE(offset); return v < 2147483648 ? v : v - 4294967296; }
    readInt32BE(offset) { const v = this.readUInt32BE(offset); return v < 2147483648 ? v : v - 4294967296; }

    [Symbol.iterator]() {
        let i = 0;
        return {
            next: () => {
                if (i >= this.length) return { done: true };
                return { done: false, value: this.data[i++] };
            }
        };
    }
}

export default Buffer;
