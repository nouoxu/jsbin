// JSBin Runtime - Node.js url

export function fileURLToPath(url) {
    if (typeof url !== "string") return url;
    if (url.length > 7 && url.substring(0, 7) === "file://") return url.substring(7);
    return url;
}

export class URL {
    constructor(url, base) {
        this.href = url;
        this.protocol = "";
        this.hostname = "";
        this.pathname = "";
        this.search = "";
        this.hash = "";

        const protoIdx = url.indexOf("://");
        if (protoIdx > 0) {
            this.protocol = url.substring(0, protoIdx);
            let rest = url.substring(protoIdx + 3);
            const hashIdx = rest.indexOf("#");
            if (hashIdx > 0) { this.hash = rest.substring(hashIdx); rest = rest.substring(0, hashIdx); }
            const searchIdx = rest.indexOf("?");
            if (searchIdx > 0) { this.search = rest.substring(searchIdx); rest = rest.substring(0, searchIdx); }
            const slashIdx = rest.indexOf("/");
            if (slashIdx > 0) { this.hostname = rest.substring(0, slashIdx); this.pathname = rest.substring(slashIdx); }
            else if (slashIdx === 0) { this.pathname = rest; }
            else { this.hostname = rest; }
        }
    }
    toString() { return this.href; }
}

export default { URL, fileURLToPath };
