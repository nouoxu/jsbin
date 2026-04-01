// JSBin Runtime - Node.js string_decoder

export class StringDecoder {
    constructor(encoding = "utf8") {
        this.encoding = encoding;
        this.incomplete = "";
    }
    write(buffer) {
        if (!buffer) return "";
        if (typeof buffer === "string") return buffer;
        return buffer.toString(this.encoding === "buffer" ? "utf8" : this.encoding);
    }
    end(buffer) {
        if (buffer) return this.write(buffer);
        const result = this.incomplete;
        this.incomplete = "";
        return result;
    }
}

export default { StringDecoder };
