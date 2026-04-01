// JSBin Runtime - Node.js crypto

import { Buffer } from "./buffer.js";

export const crypto = {
    randomBytes(size) {
        const arr = new Uint8Array(size);
        for (let i = 0; i < size; i++) arr[i] = (Math.random() * 256) | 0;
        return Buffer.from(arr);
    },
    pseudoRandomBytes: (size) => crypto.randomBytes(size),
    randomFillSync(buffer, offset, size) {
        const data = crypto.randomBytes(size || buffer.length);
        for (let i = 0; i < data.length; i++) buffer[offset + i] = data[i];
        return buffer;
    },
    createHash(algorithm) {
        return { update: (data) => this, digest: () => Buffer.alloc(0) };
    },
    createHmac: (algorithm, key) => crypto.createHash(algorithm),
    createCipheriv: () => ({ update: () => Buffer.alloc(0), final: () => Buffer.alloc(0) }),
    createDecipheriv: () => ({ update: () => Buffer.alloc(0), final: () => Buffer.alloc(0) }),
    createECDH: () => ({ generateKeys() {}, computeSecret() {} }),
    getCurves: () => [],
    getFips: () => 0,
    setFips: () => {},
    fips: false,
    constants: {},
    timingSafeEqual: (a, b) => a.equals(b),
    randomInt: (max, min, callback) => {
        const val = Math.floor(Math.random() * (max - min)) + min;
        if (callback) callback(null, val);
        return val;
    },
    randomUUID() {
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
        });
    },
    scryptSync(password, salt, keylen) { return Buffer.alloc(keylen); },
    secureHeapUsed: () => ({ total: 0, initial: 0, low: 0, high: 0 })
};

export default crypto;
