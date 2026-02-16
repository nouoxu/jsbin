// JSBin - JavaScript 语法解析器
// 将词法单元流转换为抽象语法树
// 模块化重构版本

import { TokenType } from "../lexer/token.js";
import { Lexer } from "../lexer/index.js";
import * as AST from "./ast.js";
import { Precedence, precedences } from "./precedence.js";
import { StatementParser } from "./statements.js";
import { ExpressionParser } from "./expressions.js";
import { ClassParser } from "./classes.js";
import { ModuleParser } from "./modules.js";

// 解析器类
function isParserDebug() {
    if (typeof globalThis !== "undefined" && globalThis.DEBUG_PARSER) {
        return true;
    }
    return typeof process !== "undefined" && process.env && process.env.DEBUG_PARSER;
}

export class Parser {
    constructor(lexer) {
        console.log("[Parser] ctor start");
        if (isParserDebug()) console.log("[Parser] constructor start");
        this.lexer = lexer;
        if (isParserDebug()) console.log("[Parser] lexer set");
        this.curToken = null;
        this.peekToken = null;
        this.errors = [];
        if (isParserDebug()) console.log("[Parser] basic fields set");

        this.prefixParseFns = {};
        this.infixParseFns = {};
        if (isParserDebug()) console.log("[Parser] parseFns objects created");

        this.registerParseFns();
        console.log("[Parser] registerParseFns done");
        if (isParserDebug()) console.log("[Parser] registerParseFns done");

        this.nextToken();
        console.log("[Parser] first nextToken done");
        if (isParserDebug()) console.log("[Parser] first nextToken done");
        this.nextToken();
        console.log("[Parser] second nextToken done");
        if (isParserDebug()) console.log("[Parser] second nextToken done");
    }

    registerParseFns() {
        // 前缀解析函数
        this.prefixParseFns[TokenType.IDENT] = () => this.parseIdentifier();
        // get/set 也可以作为标识符使用 (如 set.add(), get.foo())
        this.prefixParseFns[TokenType.GET] = () => this.parseIdentifier();
        this.prefixParseFns[TokenType.SET] = () => this.parseIdentifier();
        this.prefixParseFns[TokenType.INT] = () => this.parseNumberLiteral();
        this.prefixParseFns[TokenType.FLOAT] = () => this.parseNumberLiteral();
        this.prefixParseFns[TokenType.BIGINT] = () => this.parseBigIntLiteral();
        this.prefixParseFns[TokenType.STRING] = () => this.parseStringLiteral();
        this.prefixParseFns[TokenType.TEMPLATE_STRING] = () => this.parseTemplateLiteral();
        this.prefixParseFns[TokenType.TEMPLATE_HEAD] = () => this.parseTemplateLiteralWithExpressions();
        this.prefixParseFns[TokenType.TRUE] = () => this.parseBooleanLiteral();
        this.prefixParseFns[TokenType.FALSE] = () => this.parseBooleanLiteral();
        this.prefixParseFns[TokenType.NULL] = () => this.parseNullLiteral();
        this.prefixParseFns[TokenType.UNDEFINED] = () => this.parseUndefinedLiteral();
        this.prefixParseFns[TokenType.BANG] = () => this.parsePrefixExpression();
        this.prefixParseFns[TokenType.MINUS] = () => this.parsePrefixExpression();
        this.prefixParseFns[TokenType.PLUS] = () => this.parsePrefixExpression();
        this.prefixParseFns[TokenType.BITNOT] = () => this.parsePrefixExpression();
        this.prefixParseFns[TokenType.INCREMENT] = () => this.parsePrefixUpdateExpression();
        this.prefixParseFns[TokenType.DECREMENT] = () => this.parsePrefixUpdateExpression();
        this.prefixParseFns[TokenType.TYPEOF] = () => this.parsePrefixExpression();
        this.prefixParseFns[TokenType.VOID] = () => this.parsePrefixExpression();
        this.prefixParseFns[TokenType.DELETE] = () => this.parsePrefixExpression();
        this.prefixParseFns[TokenType.LPAREN] = () => this.parseGroupedOrArrow();
        this.prefixParseFns[TokenType.LBRACKET] = () => this.parseArrayLiteral();
        this.prefixParseFns[TokenType.LBRACE] = () => this.parseObjectLiteral();
        this.prefixParseFns[TokenType.CLASS] = () => this.parseClassExpression();
        this.prefixParseFns[TokenType.THIS] = () => this.parseThisExpression();
        this.prefixParseFns[TokenType.SUPER] = () => this.parseSuperExpression();
        this.prefixParseFns[TokenType.NEW] = () => this.parseNewExpression();
        this.prefixParseFns[TokenType.ASYNC] = () => this.parseAsyncExpression();
        this.prefixParseFns[TokenType.AWAIT] = () => this.parseAwaitExpression();
        this.prefixParseFns[TokenType.SPREAD] = () => this.parseSpreadExpression();
        this.prefixParseFns[TokenType.FUNCTION] = () => this.parseFunctionExpression();
        this.prefixParseFns[TokenType.YIELD] = () => this.parseYieldExpression();
        this.prefixParseFns[TokenType.SLASH] = () => this.parseRegExpLiteral();

        // 中缀解析函数
        this.infixParseFns[TokenType.PLUS] = (left) => this.parseBinaryExpression(left);
        this.infixParseFns[TokenType.MINUS] = (left) => this.parseBinaryExpression(left);
        this.infixParseFns[TokenType.ASTERISK] = (left) => this.parseBinaryExpression(left);
        this.infixParseFns[TokenType.SLASH] = (left) => this.parseBinaryExpression(left);
        this.infixParseFns[TokenType.PERCENT] = (left) => this.parseBinaryExpression(left);
        this.infixParseFns[TokenType.POWER] = (left) => this.parseBinaryExpression(left);
        this.infixParseFns[TokenType.EQ] = (left) => this.parseBinaryExpression(left);
        this.infixParseFns[TokenType.NOT_EQ] = (left) => this.parseBinaryExpression(left);
        this.infixParseFns[TokenType.STRICT_EQ] = (left) => this.parseBinaryExpression(left);
        this.infixParseFns[TokenType.STRICT_NOT_EQ] = (left) => this.parseBinaryExpression(left);
        this.infixParseFns[TokenType.LT] = (left) => this.parseBinaryExpression(left);
        this.infixParseFns[TokenType.GT] = (left) => this.parseBinaryExpression(left);
        this.infixParseFns[TokenType.LTE] = (left) => this.parseBinaryExpression(left);
        this.infixParseFns[TokenType.GTE] = (left) => this.parseBinaryExpression(left);
        this.infixParseFns[TokenType.AND] = (left) => this.parseLogicalExpression(left);
        this.infixParseFns[TokenType.OR] = (left) => this.parseLogicalExpression(left);
        this.infixParseFns[TokenType.NULLISH] = (left) => this.parseLogicalExpression(left); // ?? 作为逻辑表达式
        this.infixParseFns[TokenType.BITAND] = (left) => this.parseBinaryExpression(left);
        this.infixParseFns[TokenType.BITOR] = (left) => this.parseBinaryExpression(left);
        this.infixParseFns[TokenType.BITXOR] = (left) => this.parseBinaryExpression(left);
        this.infixParseFns[TokenType.LSHIFT] = (left) => this.parseBinaryExpression(left);
        this.infixParseFns[TokenType.RSHIFT] = (left) => this.parseBinaryExpression(left);
        this.infixParseFns[TokenType.URSHIFT] = (left) => this.parseBinaryExpression(left);
        this.infixParseFns[TokenType.INSTANCEOF] = (left) => this.parseBinaryExpression(left);
        this.infixParseFns[TokenType.IN] = (left) => this.parseBinaryExpression(left);
        this.infixParseFns[TokenType.LPAREN] = (left) => this.parseCallExpression(left);
        this.infixParseFns[TokenType.LBRACKET] = (left) => this.parseIndexExpression(left);
        this.infixParseFns[TokenType.DOT] = (left) => this.parseMemberExpression(left);
        this.infixParseFns[TokenType.OPTIONAL] = (left) => this.parseOptionalMemberExpression(left);
        this.infixParseFns[TokenType.ASSIGN] = (left) => this.parseAssignmentExpression(left);
        this.infixParseFns[TokenType.PLUS_ASSIGN] = (left) => this.parseAssignmentExpression(left);
        this.infixParseFns[TokenType.MINUS_ASSIGN] = (left) => this.parseAssignmentExpression(left);
        this.infixParseFns[TokenType.ASTERISK_ASSIGN] = (left) => this.parseAssignmentExpression(left);
        this.infixParseFns[TokenType.SLASH_ASSIGN] = (left) => this.parseAssignmentExpression(left);
        this.infixParseFns[TokenType.PERCENT_ASSIGN] = (left) => this.parseAssignmentExpression(left);
        this.infixParseFns[TokenType.AND_ASSIGN] = (left) => this.parseAssignmentExpression(left);
        this.infixParseFns[TokenType.OR_ASSIGN] = (left) => this.parseAssignmentExpression(left);
        this.infixParseFns[TokenType.XOR_ASSIGN] = (left) => this.parseAssignmentExpression(left);
        this.infixParseFns[TokenType.LSHIFT_ASSIGN] = (left) => this.parseAssignmentExpression(left);
        this.infixParseFns[TokenType.RSHIFT_ASSIGN] = (left) => this.parseAssignmentExpression(left);
        this.infixParseFns[TokenType.LOGICAL_AND_ASSIGN] = (left) => this.parseAssignmentExpression(left);
        this.infixParseFns[TokenType.LOGICAL_OR_ASSIGN] = (left) => this.parseAssignmentExpression(left);
        this.infixParseFns[TokenType.NULLISH_ASSIGN] = (left) => this.parseAssignmentExpression(left);
        this.infixParseFns[TokenType.QUESTION] = (left) => this.parseConditionalExpression(left);
        this.infixParseFns[TokenType.INCREMENT] = (left) => this.parsePostfixUpdateExpression(left);
        this.infixParseFns[TokenType.DECREMENT] = (left) => this.parsePostfixUpdateExpression(left);
    }

    nextToken() {
        if (isParserDebug()) console.log("[Parser.nextToken] start");
        this.curToken = this.peekToken;
        if (isParserDebug()) console.log("[Parser.nextToken] curToken set");
        if (isParserDebug()) console.log("[Parser.nextToken] this.lexer =", this.lexer);
        this.peekToken = this.lexer.nextToken();
        if (isParserDebug()) console.log("[Parser.nextToken] peekToken set");
    }

    curTokenIs(t) {
        return this.curToken.type === t;
    }

    peekTokenIs(t) {
        return this.peekToken.type === t;
    }

    expectPeek(t) {
        if (this.peekTokenIs(t)) {
            this.nextToken();
            return true;
        }
        this.peekError(t);
        return false;
    }

    peekError(t) {
        this.errors.push("expected " + t + ", got " + this.peekToken.type);
    }

    curPrecedence() {
        return precedences[this.curToken.type] || Precedence.LOWEST;
    }

    peekPrecedence() {
        return precedences[this.peekToken.type] || Precedence.LOWEST;
    }

    // ============ 解析程序 ============

    parseProgram() {
        let program = new AST.Program();
        while (!this.curTokenIs(TokenType.EOF)) {
            let stmt = this.parseStatement();
            if (stmt !== null) {
                program.body.push(stmt);
            }
            this.nextToken();
        }
        return program;
    }
}

// 混入所有解析方法
Object.assign(Parser.prototype, StatementParser);
Object.assign(Parser.prototype, ExpressionParser);
Object.assign(Parser.prototype, ClassParser);
Object.assign(Parser.prototype, ModuleParser);

// 创建解析器
export function newParser(lexer) {
    return new Parser(lexer);
}

// 解析源代码
export function parse(source) {
    let lexer = new Lexer(source);
    let parser = new Parser(lexer);
    return parser.parseProgram();
}
