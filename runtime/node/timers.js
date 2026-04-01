// JSBin Runtime - Node.js timers

export function setTimeout(callback, delay, ...args) {
    globalThis.__setTimeoutCallback = () => callback(...args);
    return -1;
}

export function clearTimeout(handle) {}

export function setInterval(callback, period, ...args) {
    return -1;
}

export function clearInterval(handle) {}

export function setImmediate(callback, ...args) {
    globalThis.__setImmediateCallback = () => callback(...args);
    return -1;
}

export function clearImmediate(handle) {}

export default { setTimeout, clearTimeout, setInterval, clearInterval, setImmediate, clearImmediate };
