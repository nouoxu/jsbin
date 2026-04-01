// JSBin Runtime - Node.js path
// Provides path utilities for JSBin compiled binaries

const platform = __get_process().platform || "macos";
const PATH_SEP = platform === "win32" ? "\\" : "/";

export function dirname(p) {
    if (!p) return ".";
    let i = p.length - 1;
    while (i >= 0 && p.substring(i, i + 1) !== PATH_SEP) i = i - 1;
    if (i < 0) return ".";
    if (i === 0) return PATH_SEP;
    return p.substring(0, i);
}

export function basename(p, ext) {
    if (!p) return "";
    let i = p.length - 1;
    while (i >= 0 && p.substring(i, i + 1) !== PATH_SEP) i = i - 1;
    let base = p.substring(i + 1);
    if (ext && base.length > ext.length && base.substring(base.length - ext.length) === ext) {
        base = base.substring(0, base.length - ext.length);
    }
    return base;
}

export function extname(p) {
    if (!p) return "";
    let i = p.length - 1;
    while (i >= 0 && p.substring(i, i + 1) !== PATH_SEP && p.substring(i, i + 1) !== ".") i = i - 1;
    if (i <= 0 || p.substring(i, i + 1) !== ".") return "";
    return p.substring(i);
}

export function join(p1, p2, p3, p4, p5) {
    let res = p1 || "";
    const parts = [p2, p3, p4, p5].filter(Boolean);
    for (let part of parts) {
        if (res !== "" && res.substring(res.length - 1) !== PATH_SEP) res = res + PATH_SEP;
        res = res + part;
    }
    return res;
}

export function resolve(p1, p2, p3) {
    if (p1 && p2 && p2.startsWith("/")) return p2;
    return join(p1, p2, p3);
}

export function normalize(p) {
    if (!p) return ".";
    const parts = p.split(PATH_SEP).filter(Boolean);
    const result = [];
    for (let part of parts) {
        if (part === "..") result.pop();
        else if (part !== ".") result.push(part);
    }
    let res = result.join(PATH_SEP);
    if (p.startsWith(PATH_SEP)) res = PATH_SEP + res;
    return res || ".";
}

export function isAbsolute(p) {
    if (!p) return false;
    return p.startsWith("/") || (platform === "win32" && /^[A-Za-z]:/.test(p));
}

export function relative(from, to) {
    const fromParts = normalize(from).split(PATH_SEP).filter(Boolean);
    const toParts = normalize(to).split(PATH_SEP).filter(Boolean);
    let i = 0;
    while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) i++;
    const up = fromParts.slice(i).map(() => "..");
    return [...up, ...toParts.slice(i)].join(PATH_SEP) || ".";
}

class path {
    static dirname(p) { return dirname(p); }
    static basename(p, ext) { return basename(p, ext); }
    static extname(p) { return extname(p); }
    static join(...args) { return join(...args); }
    static resolve(...args) { return resolve(...args); }
    static normalize(p) { return normalize(p); }
    static isAbsolute(p) { return isAbsolute(p); }
    static relative(from, to) { return relative(from, to); }
    static toNamespacedPath(p) { return p; }
    static sep() { return PATH_SEP; }
    static delimiter() { return platform === "win32" ? ";" : ":"; }
    static format(p) {
        if (!p.dir && !p.base) return ".";
        return p.dir ? join(p.dir, p.base) : p.base;
    }
    static parse(p) {
        return {
            dir: dirname(p), base: basename(p),
            ext: extname(p), name: basename(p, extname(p)),
            root: p.startsWith("/") ? "/" : ""
        };
    }
}

export { path };
export default path;
