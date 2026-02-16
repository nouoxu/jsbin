// JSBin 编译器 - Source Map 生成器
// 生成 Source Map v3 格式文件，支持调试时定位原始源码

/**
 * VLQ (Variable Length Quantity) 编码器
 * Source Map 使用 Base64 VLQ 编码来压缩位置信息
 */
const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * 将数字编码为 VLQ
 * @param {number} value - 要编码的数字
 * @returns {string} VLQ 编码的字符串
 */
function encodeVLQ(value) {
    let encoded = "";
    // 处理负数：使用最低位作为符号位
    let vlq = value < 0 ? (-value << 1) | 1 : value << 1;

    do {
        let digit = vlq & 0x1f; // 取低5位
        vlq = vlq >> 5; // Use signed shift as logical shift (for positive numbers) or until >>> support is fixed
        if (vlq > 0) {
            digit |= 0x20; // 设置继续位
        }
        encoded += BASE64_CHARS[digit];
    } while (vlq > 0);

    return encoded;
}

/**
 * Source Map 映射条目
 */
class SourceMapping {
    constructor(generatedLine, generatedColumn, sourceLine, sourceColumn, sourceIndex = 0, nameIndex = null) {
        this.generatedLine = generatedLine; // 生成代码的行号 (1-based)
        this.generatedColumn = generatedColumn; // 生成代码的列号 (0-based)
        this.sourceLine = sourceLine; // 源代码的行号 (1-based)
        this.sourceColumn = sourceColumn; // 源代码的列号 (0-based)
        this.sourceIndex = sourceIndex; // 源文件索引
        this.nameIndex = nameIndex; // 名称索引 (可选)
    }
}

/**
 * Source Map 生成器
 */
export class SourceMapGenerator {
    constructor(options = {}) {
        this.file = options.file || ""; // 生成的文件名
        this.sourceRoot = options.sourceRoot || ""; // 源码根目录
        this.sources = []; // 源文件列表
        this.sourcesContent = []; // 源文件内容 (可选)
        this.names = []; // 名称列表
        this.mappings = []; // 映射条目列表

        // 用于跟踪代码偏移到行列的映射
        this.codeOffsetMappings = []; // [{offset, sourceLine, sourceColumn, sourceIndex}]
    }

    /**
     * 添加源文件
     * @param {string} source - 源文件路径
     * @param {string} content - 源文件内容 (可选)
     * @returns {number} 源文件索引
     */
    addSource(source, content = null) {
        let index = this.sources.indexOf(source);
        if (index === -1) {
            index = this.sources.length;
            this.sources.push(source);
            this.sourcesContent.push(content);
        }
        return index;
    }

    /**
     * 添加名称
     * @param {string} name - 名称
     * @returns {number} 名称索引
     */
    addName(name) {
        let index = this.names.indexOf(name);
        if (index === -1) {
            index = this.names.length;
            this.names.push(name);
        }
        return index;
    }

    /**
     * 添加映射 (用于字节码 -> 源码的映射)
     * @param {number} codeOffset - 机器码偏移
     * @param {number} sourceLine - 源代码行号 (1-based)
     * @param {number} sourceColumn - 源代码列号 (0-based)
     * @param {number} sourceIndex - 源文件索引
     * @param {string} name - 标识符名称 (可选)
     */
    addMapping(codeOffset, sourceLine, sourceColumn, sourceIndex = 0, name = null) {
        const nameIndex = name ? this.addName(name) : null;
        this.codeOffsetMappings.push({
            offset: codeOffset,
            sourceLine,
            sourceColumn,
            sourceIndex,
            nameIndex,
        });
    }

    /**
     * 从 AST 节点添加映射
     * @param {number} codeOffset - 机器码偏移
     * @param {object} node - AST 节点 (需要有 loc 信息)
     * @param {number} sourceIndex - 源文件索引
     */
    addMappingFromNode(codeOffset, node, sourceIndex = 0) {
        if (node && node.loc) {
            this.addMapping(codeOffset, node.loc.start.line, node.loc.start.column, sourceIndex);
        } else if (node && node.token) {
            // 如果节点有 token 信息
            this.addMapping(
                codeOffset,
                node.token.line,
                node.token.column - 1, // column 转为 0-based
                sourceIndex,
            );
        }
    }

    /**
     * 从 Token 添加映射
     * @param {number} codeOffset - 机器码偏移
     * @param {object} token - Token 对象
     * @param {number} sourceIndex - 源文件索引
     */
    addMappingFromToken(codeOffset, token, sourceIndex = 0) {
        if (token && token.line !== undefined) {
            this.addMapping(
                codeOffset,
                token.line,
                (token.column || 1) - 1, // column 转为 0-based
                sourceIndex,
            );
        }
    }

    /**
     * 生成 mappings 字符串
     * 对于原生代码，我们生成一个简化的映射：
     * 每个源码行对应一个机器码范围
     */
    generateMappingsString() {
        if (this.codeOffsetMappings.length === 0) {
            return "";
        }

        // 按偏移排序
        this.codeOffsetMappings.sort((a, b) => a.offset - b.offset);

        // 将偏移转换为 "行" (假设每行 = 16 字节机器码)
        const BYTES_PER_LINE = 16;
        let segments = [];
        let currentLine = 0;
        let prevGenColumn = 0;
        let prevSourceIndex = 0;
        let prevSourceLine = 0;
        let prevSourceColumn = 0;
        let prevNameIndex = 0;

        for (const mapping of this.codeOffsetMappings) {
            const genLine = Math.floor(mapping.offset / BYTES_PER_LINE);
            const genColumn = mapping.offset % BYTES_PER_LINE;

            // 处理行分隔
            while (currentLine < genLine) {
                segments.push(";");
                currentLine++;
                prevGenColumn = 0;
            }

            // 编码段
            let segment = "";

            // 生成列 (相对于上一个)
            segment += encodeVLQ(genColumn - prevGenColumn);
            prevGenColumn = genColumn;

            // 源文件索引 (相对)
            segment += encodeVLQ(mapping.sourceIndex - prevSourceIndex);
            prevSourceIndex = mapping.sourceIndex;

            // 源代码行 (相对, 转为 0-based)
            const srcLine = mapping.sourceLine - 1;
            segment += encodeVLQ(srcLine - prevSourceLine);
            prevSourceLine = srcLine;

            // 源代码列 (相对)
            segment += encodeVLQ(mapping.sourceColumn - prevSourceColumn);
            prevSourceColumn = mapping.sourceColumn;

            // 名称索引 (可选)
            if (mapping.nameIndex !== null) {
                segment += encodeVLQ(mapping.nameIndex - prevNameIndex);
                prevNameIndex = mapping.nameIndex;
            }

            if (segments.length > 0 && segments[segments.length - 1] !== ";") {
                segments.push(",");
            }
            segments.push(segment);
        }

        return segments.join("");
    }

    /**
     * 生成 Source Map JSON
     * @returns {object} Source Map 对象
     */
    toJSON() {
        return {
            version: 3,
            file: this.file,
            sourceRoot: this.sourceRoot,
            sources: this.sources,
            sourcesContent: this.sourcesContent.some((c) => c !== null) ? this.sourcesContent : undefined,
            names: this.names.length > 0 ? this.names : undefined,
            mappings: this.generateMappingsString(),
        };
    }

    /**
     * 生成 Source Map 字符串
     * @returns {string} JSON 字符串
     */
    toString() {
        return JSON.stringify(this.toJSON());
    }

    /**
     * 生成格式化的 Source Map 字符串
     * @returns {string} 格式化的 JSON 字符串
     */
    toFormattedString() {
        return JSON.stringify(this.toJSON(), null, 2);
    }

    /**
     * 获取映射条目数量
     */
    getMappingCount() {
        return this.codeOffsetMappings.length;
    }

    /**
     * 清空所有映射
     */
    clear() {
        this.sources = [];
        this.sourcesContent = [];
        this.names = [];
        this.mappings = [];
        this.codeOffsetMappings = [];
    }
}

/**
 * 创建 Source Map 生成器
 * @param {object} options - 选项
 * @returns {SourceMapGenerator}
 */
export function createSourceMapGenerator(options = {}) {
    return new SourceMapGenerator(options);
}

/**
 * 从编译结果生成 Source Map
 * @param {string} sourceFile - 源文件路径
 * @param {string} sourceContent - 源文件内容
 * @param {string} outputFile - 输出文件路径
 * @param {Array} mappings - 映射数组 [{offset, line, column}]
 * @returns {SourceMapGenerator}
 */
export function generateSourceMap(sourceFile, sourceContent, outputFile, mappings) {
    const generator = new SourceMapGenerator({ file: outputFile });
    const sourceIndex = generator.addSource(sourceFile, sourceContent);

    for (const m of mappings) {
        generator.addMapping(m.offset, m.line, m.column || 0, sourceIndex);
    }

    return generator;
}
