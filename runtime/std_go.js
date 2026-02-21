/**
 * JSBin Go-style Standard Library
 * 
 * Go-like features for JavaScript
 */

// ===== Error Handling (Go style) =====

const _panicStack = [];

function panic(value: any): void {
    // Like Go panic
    _panicStack.push(value);
    throw value;
}

function recover(): any {
    // Like Go recover
    try {
        return _panicStack.pop();
    } catch {
        return undefined;
    }
}

// ===== Defer (Go style) =====

const _deferQueue: (() => void)[] = [];

function defer(fn: () => void): void {
    // Schedule function to run on return
    _deferQueue.push(fn);
}

function _runDefers(): void {
    while (_deferQueue.length > 0) {
        const fn = _deferQueue.pop();
        try {
            fn();
        } catch (e) {
            console.error('defer error:', e);
        }
    }
}

// ===== Goroutines (Go style) =====

function go(fn: () => void): void {
    // Like Go goroutine - run in background
    setTimeout(fn, 0);
}

function goWithArgs<T>(fn: (...args: T[]) => void, ...args: T[]): void {
    setTimeout(() => fn(...args), 0);
}

// ===== Channels (Go style) =====

class Channel<T> {
    private _queue: T[] = [];
    private _closed: boolean = false;
    
    send(value: T): void {
        if (this._closed) {
            panic('send on closed channel');
        }
        this._queue.push(value);
    }
    
    recv(): T | undefined {
        return this._queue.shift();
    }
    
    close(): void {
        this._closed = true;
    }
    
    isClosed(): boolean {
        return this._closed;
    }
    
    len(): number {
        return this._queue.length;
    }
}

function makeChannel<T>(buffer?: number): Channel<T> {
    return new Channel<T>();
}

// ===== Select (Go style) =====

class SelectCase<T> {
    constructor(
        public channel: Channel<T>,
        public isSend: boolean,
        public value?: T
    ) {}
}

function select<T>(cases: SelectCase<T>[]): { index: number, value?: T } {
    // Simplified select - pick random available case
    const available: number[] = [];
    
    for (let i = 0; i < cases.length; i++) {
        const c = cases[i];
        if (c.isSend) {
            // Send case - always available if not closed
            if (!c.channel.isClosed()) {
                available.push(i);
            }
        } else {
            // Recv case - available if has data
            if (c.channel.len() > 0) {
                available.push(i);
            }
        }
    }
    
    if (available.length === 0) {
        return { index: -1 };
    }
    
    const idx = available[Math.floor(Math.random() * available.length)];
    const chosen = cases[idx];
    
    if (!chosen.isSend) {
        return { index: idx, value: chosen.channel.recv() };
    }
    return { index: idx };
}

// ===== Sync (Go style) =====

class Mutex {
    private _locked: boolean = false;
    
    lock(): void {
        while (this._locked) {
            // Spin wait (simplified)
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1);
        }
        this._locked = true;
    }
    
    unlock(): void {
        this._locked = false;
    }
    
    tryLock(): boolean {
        if (this._locked) return false;
        this._locked = true;
        return true;
    }
}

class WaitGroup {
    private _count: number = 0;
    
    add(n: number): void {
        this._count += n;
    }
    
    done(): void {
        this._count--;
        if (this._count < 0) this._count = 0;
    }
    
    wait(): void {
        while (this._count > 0) {
            // Spin wait
        }
    }
}

// ===== Once (Go style) =====

class Once {
    private _done: boolean = false;
    
    do(fn: () => void): void {
        if (!this._done) {
            this._done = true;
            fn();
        }
    }
}

// ===== Sync.Once (Go style) =====

class Map<K, V> {
    private _data: Map<K, V> = new Map();
    
    set(key: K, value: V): void {
        this._data.set(key, value);
    }
    
    get(key: K): V | undefined {
        return this._data.get(key);
    }
    
    has(key: K): boolean {
        return this._data.has(key);
    }
    
    delete(key: K): boolean {
        return this._data.delete(key);
    }
    
    len(): number {
        return this._data.size;
    }
    
    keys(): K[] {
        return Array.from(this._data.keys());
    }
    
    values(): V[] {
        return Array.from(this._data.values());
    }
}

// ===== Make functions (Go style) =====

function make<T>(constructor: new () => T): T {
    return new constructor();
}

function makeSlice<T>(len: number, cap?: number): T[] {
    return new Array(len);
}

function makeMap<K, V>(): Map<K, V> {
    return new Map();
}

// ===== Export =====

export {
    // Error handling
    panic,
    recover,
    defer,
    _runDefers,
    
    // Goroutines
    go,
    goWithArgs,
    
    // Channels
    Channel,
    makeChannel,
    SelectCase,
    select,
    
    // Sync
    Mutex,
    WaitGroup,
    Once,
    
    // Map (Go style)
    Map,
    
    // Make
    make,
    makeSlice,
    makeMap
};
