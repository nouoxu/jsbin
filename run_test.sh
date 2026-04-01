#!/bin/bash
# JSBin 测试运行脚本

JSBIN="./cli.js"
RUN="./run.sh"

compile_and_run() {
    local testfile=$1
    local output=$2
    rm -f "${output}_bin" 2>/dev/null
    node "$JSBIN" "$testfile" -o "${output}_bin" 2>/dev/null
    if [ -f "${output}_bin" ]; then
        timeout 5 "$RUN" "${output}_bin" 2>/dev/null
        local result=$?
        if [ $result -eq 139 ] || [ $result -eq 132 ]; then
            echo "CRASH (exit $result)"
            return 1
        fi
        return 0
    else
        echo "COMPILE_ERROR"
        return 1
    fi
}

# 测试单个表达式
test_expr() {
    local name=$1
    local expr=$2

    echo "// $name" > /tmp/test_expr.js
    echo "console.log($expr);" >> /tmp/test_expr.js

    # Node.js 期望值
    local expected=$(node -e "console.log($expr)" 2>/dev/null)

    # JSBin 实际值
    rm -f /tmp/test_expr_bin 2>/dev/null
    node "$JSBIN" /tmp/test_expr.js -o /tmp/test_expr_bin 2>/dev/null
    if [ -f /tmp/test_expr_bin ]; then
        local actual=$(timeout 5 "$RUN" /tmp/test_expr_bin 2>/dev/null)
    else
        local actual=""
    fi

    if [ "$expected" = "$actual" ]; then
        echo "PASS: $name = $expected"
    else
        echo "FAIL: $name - expected '$expected', got '$actual'"
    fi
}

# 测试字符串
test_string() {
    local name=$1
    local expr=$2

    echo "// $name" > /tmp/test_expr.js
    echo "console.log($expr);" >> /tmp/test_expr.js

    local expected=$(node -e "console.log($expr)" 2>/dev/null)

    compile_and_run /tmp/test_expr.js /tmp/test_expr
    local actual=$(timeout 5 "$RUN" /tmp/test_expr_bin 2>/dev/null)

    if [ "$expected" = "$actual" ]; then
        echo "PASS: $name = $expected"
    else
        echo "FAIL: $name - expected '$expected', got '$actual'"
    fi
}

# 主测试
echo "=== String Tests ==="
test_string "literal" '"hello"'
test_string "length" '"hello".length'
test_string "charAt" '"hello".charAt(1)'
test_string "charCodeAt" '"hello".charCodeAt(1)'
test_string "toUpperCase" '"hello".toUpperCase()'
test_string "toLowerCase" '"hello".toLowerCase()'
test_string "trim" '"  hello  ".trim()'
test_string "includes" '"hello".includes("ell")'
test_string "startsWith" '"hello".startsWith("hel")'
test_string "endsWith" '"hello".endsWith("llo")'
test_string "indexOf" '"hello".indexOf("ell")'
test_string "slice" '"hello".slice(1,4)'
test_string "concat" '"hello".concat(" world")'
test_string "repeat" '"ha".repeat(3)'
test_string "substring" '"hello".substring(1,4)'

echo ""
echo "=== Number Tests ==="
test_expr "integer" '42'
test_expr "float" '3.14'
test_expr "negative" '-42'
test_expr "nan" 'NaN'
test_expr "infinity" 'Infinity'
test_expr "neg_infinity" '-Infinity'
test_expr "add" '3 + 4'
test_expr "sub" '10 - 3'
test_expr "mul" '3 * 4'
test_expr "div" '10 / 3'
test_expr "mod" '10 % 3'

echo ""
echo "=== Boolean Tests ==="
test_expr "true" 'true'
test_expr "false" 'false'
test_expr "not_true" '!true'
test_expr "not_false" '!false'
test_expr "and" 'true && false'
test_expr "or" 'true || false'

echo ""
echo "=== Object Tests ==="
test_expr "object_literal" '{a:1,b:2}.a'
test_expr "object_property" '({a:1,b:2}).b'

echo ""
echo "=== Array Tests ==="
test_expr "array_literal" '[1,2,3].length'
test_expr "array_access" '[1,2,3][1]'

echo ""
echo "=== Comparison Tests ==="
test_expr "eq" '1 == "1"'
test_expr "strict_eq" '1 === "1"'
test_expr "ne" '1 != "1"'
test_expr "strict_ne" '1 !== "1"'
test_expr "lt" '2 < 3'
test_expr "gt" '3 > 2'
test_expr "lte" '2 <= 3'
test_expr "gte" '3 >= 2'
