// JSBin 解析器 - 类解析
// 解析 class 声明、方法、私有字段、装饰器等

import { TokenType } from "../lexer/token.js";
import * as AST from "./ast.js";
import { Precedence } from "./precedence.js";

// 类解析混入
export const ClassParser = {
    // 解析装饰器列表
    parseDecorators() {
        let decorators = [];
        while (this.curTokenIs(TokenType.AT)) {
            this.nextToken(); // 跳过 @
            let expr = this.parseDecoratorExpression();
            decorators.push(new AST.Decorator(expr));
        }
        return decorators;
    },

    // 解析装饰器表达式
    // @foo, @foo.bar, @foo(args), @foo.bar(args)
    parseDecoratorExpression() {
        let expr = new AST.Identifier(this.curToken.literal);
        this.nextToken();

        // 处理成员访问 @foo.bar.baz
        while (this.curTokenIs(TokenType.DOT)) {
            this.nextToken(); // 跳过 .
            let property = new AST.Identifier(this.curToken.literal);
            expr = new AST.MemberExpression(expr, property, false);
            this.nextToken();
        }

        // 处理调用 @foo(args)
        if (this.curTokenIs(TokenType.LPAREN)) {
            let args = this.parseCallArguments();
            expr = new AST.CallExpression(expr, args);
        }

        return expr;
    },

    parseClassDeclaration() {
        // 先收集装饰器
        let decorators = [];
        if (this.curTokenIs(TokenType.AT)) {
            decorators = this.parseDecorators();
        }

        // 现在应该在 class 关键字上
        if (this.curTokenIs(TokenType.CLASS)) {
            this.nextToken();
        }

        if (!this.curTokenIs(TokenType.IDENT)) return null;
        let id = new AST.Identifier(this.curToken.literal);
        let superClass = null;
        if (this.peekTokenIs(TokenType.EXTENDS)) {
            this.nextToken();
            this.nextToken();
            superClass = new AST.Identifier(this.curToken.literal);
        }
        if (!this.expectPeek(TokenType.LBRACE)) return null;
        let body = this.parseClassBody();
        return new AST.ClassDeclaration(id, superClass, body, decorators);
    },

    parseClassBody() {
        let body = [];
        this.nextToken();
        while (!this.curTokenIs(TokenType.RBRACE) && !this.curTokenIs(TokenType.EOF)) {
            let member = this.parseClassMember();
            if (member !== null) {
                body.push(member);
            }
            this.nextToken();
        }
        return body;
    },

    parseClassMember() {
        // 先收集成员装饰器
        let decorators = [];
        while (this.curTokenIs(TokenType.AT)) {
            this.nextToken();
            let expr = this.parseDecoratorExpression();
            decorators.push(new AST.Decorator(expr));
        }

        let isStatic = false;
        let isPrivate = false;

        // 检查 static 修饰符
        if (this.curTokenIs(TokenType.STATIC)) {
            isStatic = true;
            this.nextToken();
        }

        // 检查私有字段 (#name)
        if (this.curTokenIs(TokenType.HASH) || (this.curToken.literal && this.curToken.literal.startsWith("#"))) {
            return this.parsePrivateFieldOrMethod(isStatic, "method", decorators);
        }

        // 检查 getter/setter
        let kind = "method";
        if (this.curTokenIs(TokenType.GET)) {
            // 检查是否真的是 getter (后面跟着标识符和括号)
            if (this.peekTokenIs(TokenType.IDENT) || this.peekTokenIs(TokenType.HASH)) {
                kind = "get";
                this.nextToken();
            }
        } else if (this.curTokenIs(TokenType.SET)) {
            if (this.peekTokenIs(TokenType.IDENT) || this.peekTokenIs(TokenType.HASH)) {
                kind = "set";
                this.nextToken();
            }
        }

        // 检查是否是私有成员
        if (this.curTokenIs(TokenType.HASH) || (this.curToken.literal && this.curToken.literal.startsWith("#"))) {
            return this.parsePrivateFieldOrMethod(isStatic, kind, decorators);
        }

        // 检查 constructor
        if (this.curToken.literal === "constructor") {
            kind = "constructor";
        }

        // 检查是否是字段 (没有括号)
        if (this.peekTokenIs(TokenType.ASSIGN) || this.peekTokenIs(TokenType.SEMICOLON) || this.peekTokenIs(TokenType.RBRACE)) {
            return this.parseClassField(isStatic, false, null, decorators);
        }

        // 普通方法
        let key = new AST.Identifier(this.curToken.literal);
        let computed = false;

        // 计算属性名 [expr]
        if (this.curTokenIs(TokenType.LBRACKET)) {
            this.nextToken();
            key = this.parseExpression(Precedence.LOWEST);
            if (!this.expectPeek(TokenType.RBRACKET)) return null;
            computed = true;
        }

        if (!this.expectPeek(TokenType.LPAREN)) {
            // 可能是字段
            return this.parseClassField(isStatic, false, key, decorators);
        }
        let params = this.parseFunctionParams();
        if (!this.expectPeek(TokenType.LBRACE)) return null;
        let methodBody = this.parseBlockStatement();
        let value = new AST.FunctionExpression(null, params, methodBody, false);
        return new AST.MethodDefinition(key, value, kind, isStatic, computed, decorators);
    },

    parsePrivateFieldOrMethod(isStatic, kind = "method", decorators = []) {
        // 获取私有名称
        let name = this.curToken.literal;
        if (!name.startsWith("#")) {
            this.nextToken();
            name = "#" + this.curToken.literal;
        }
        let key = new AST.PrivateIdentifier(name);

        // 检查是否是方法 (有括号)
        if (this.peekTokenIs(TokenType.LPAREN)) {
            this.nextToken();
            let params = this.parseFunctionParams();
            if (!this.expectPeek(TokenType.LBRACE)) return null;
            let methodBody = this.parseBlockStatement();
            let value = new AST.FunctionExpression(null, params, methodBody, false);
            return new AST.MethodDefinition(key, value, kind, isStatic, false, decorators);
        }

        // 私有字段
        let init = null;
        if (this.peekTokenIs(TokenType.ASSIGN)) {
            this.nextToken();
            this.nextToken();
            init = this.parseExpression(Precedence.LOWEST);
        }
        if (this.peekTokenIs(TokenType.SEMICOLON)) this.nextToken();
        return new AST.PropertyDefinition(key, init, false, isStatic, decorators);
    },

    parseClassField(isStatic, isPrivate, existingKey = null, decorators = []) {
        let key = existingKey;
        if (!key) {
            let name = this.curToken.literal;
            key = isPrivate ? new AST.PrivateIdentifier(name) : new AST.Identifier(name);
        }

        let init = null;
        if (this.peekTokenIs(TokenType.ASSIGN)) {
            this.nextToken();
            this.nextToken();
            init = this.parseExpression(Precedence.LOWEST);
        }
        if (this.peekTokenIs(TokenType.SEMICOLON)) this.nextToken();
        return new AST.PropertyDefinition(key, init, false, isStatic, decorators);
    },

    parseClassExpression() {
        return this.parseClassDeclaration();
    },
};
