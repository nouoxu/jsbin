// JSBin Runtime - Node.js child_process

export function execSync(cmd, options) { return Buffer.alloc(0); }

export function spawnSync(cmd, args, options) {
    return { status: 0, signal: null, output: [null, "", ""], pid: 0, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
}

export function exec(cmd, callback) {
    if (callback) callback(null, { stdout: "", stderr: "" });
    return { pid: 0, on: () => {}, kill: () => {}, stdout: { on: () => {} }, stderr: { on: () => {} }, stdin: { write: () => {}, end: () => {} } };
}

export function spawn(cmd, args, options) {
    return {
        pid: 0,
        on: (event, cb) => {},
        kill: (signal) => {},
        unref: () => {},
        stdout: { on: () => {}, pipe: () => {} },
        stderr: { on: () => {}, pipe: () => {} },
        stdin: { write: () => {}, end: () => {} }
    };
}

export default { execSync, spawnSync, exec, spawn };
