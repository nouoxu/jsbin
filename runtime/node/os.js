// JSBin Runtime - Node.js os module
// Provides OS utilities

export function platform() { return "macos"; }
export function arch() { return "arm64"; }
export function type() { return "Darwin"; }
export function tmpdir() { return "/tmp"; }
export function homedir() { return "/Users/user"; }
export function endianness() { return "LE"; }
export function hostname() { return "jsbin"; }
export function release() { return "1.0.0"; }
export function uptime() { return 0; }
export function loadavg() { return [0, 0, 0]; }
export function totalmem() { return 8589934592; }
export function freemem() { return 4294967296; }
export function cpus() {
    return [{
        model: "virtual", speed: 0,
        times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 }
    }];
}
export function getEols() { return ["\n"]; }
export function getPriority(pid) { return 0; }
export function setPriority(pid, priority) {}
export function constants() {
    return { UV_UDP_REUSEADDR: 4, signals: {}, errno: {}, priority: {} };
}

// os object containing all OS utilities as properties
const os = {
    platform,
    arch,
    type,
    tmpdir,
    homedir,
    endianness,
    hostname,
    release,
    uptime,
    loadavg,
    totalmem,
    freemem,
    cpus,
    getEols,
    getPriority,
    setPriority,
    constants
};

// Export os as a named export for: import { os } from "os"
// This re-export makes the os object available as a named export
// so that index.js can re-export it and namespace imports work
export { os };

// Also export as default for: import os from "os"
export default os;
