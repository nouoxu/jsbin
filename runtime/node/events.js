// JSBin Runtime - Node.js events
// Provides EventEmitter for JSBin compiled binaries

export class EventEmitter {
    constructor() {
        this._events = {};
        this._eventsCount = 0;
        this._maxListeners = 10;
    }

    on(event, listener) {
        if (!this._events[event]) this._events[event] = [];
        this._events[event].push(listener);
        this._eventsCount++;
        return this;
    }

    once(event, listener) {
        const wrapper = (...args) => {
            listener(...args);
            this.removeListener(event, wrapper);
        };
        return this.on(event, wrapper);
    }

    addListener(event, listener) { return this.on(event, listener); }

    removeListener(event, listener) {
        if (!this._events[event]) return this;
        const idx = this._events[event].indexOf(listener);
        if (idx >= 0) {
            this._events[event].splice(idx, 1);
            this._eventsCount--;
        }
        return this;
    }

    removeAllListeners(event) {
        if (event) { delete this._events[event]; }
        else { this._events = {}; }
        this._eventsCount = 0;
        return this;
    }

    setMaxListeners(n) { this._maxListeners = n; return this; }
    getMaxListeners() { return this._maxListeners; }
    listeners(event) { return this._events[event] || []; }
    rawListeners(event) { return this.listeners(event); }

    emit(event, ...args) {
        const listeners = this._events[event];
        if (!listeners || !listeners.length) return false;
        for (let listener of listeners) listener(...args);
        return true;
    }

    eventNames() { return Object.keys(this._events); }
    listenerCount(type) { return (this._events[type] || []).length; }

    static listenerCount(emitter, type) { return emitter.listenerCount(type); }
    static on(emitter, eventName) {
        return { emitter, eventName, next() {} };
    }
}

export default EventEmitter;
