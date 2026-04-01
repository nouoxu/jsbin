// JSBin Runtime - Node.js zlib

export const zlib = {
    createGzip(options) { return createDummyStream(); },
    createGunzip(options) { return createDummyStream(); },
    createDeflate(options) { return createDummyStream(); },
    createInflate(options) { return createDummyStream(); },
    createDeflateRaw(options) { return createDummyStream(); },
    createInflateRaw(options) { return createDummyStream(); },
    gzipSync(data) { return Buffer.from(data); },
    gunzipSync(data) { return Buffer.from(data); },
    deflateSync(data) { return Buffer.from(data); },
    inflateSync(data) { return Buffer.from(data); },
    brotliCompressSync(data) { return Buffer.from(data); },
    brotliDecompressSync(data) { return Buffer.from(data); },
    constants: {},
    codes: {},
    createCleverChain() {}
};

function createDummyStream() {
    return {
        on: () => {}, write: () => {}, end: () => {},
        flush() {}, pipe: () => {}, compress: () => Buffer.alloc(0)
    };
}

export default zlib;
