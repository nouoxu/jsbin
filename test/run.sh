#!/bin/bash
# JSBin 测试运行脚本
# 用法: ./test/run.sh [目录或文件]

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$SCRIPT_DIR/build"

# 创建构建目录
mkdir -p "$BUILD_DIR"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# 统计
PASSED=0
FAILED=0
SKIPPED=0

# 运行单个测试
run_test() {
    local test_file="$1"
    local rel_path="${test_file#$SCRIPT_DIR/}"
    local base_name=$(basename "$test_file" .js)
    local dir_name=$(dirname "$rel_path")
    local output_name="${dir_name//\//_}_${base_name}"
    local output_file="$BUILD_DIR/$output_name"
    
    printf "%-50s " "$rel_path"

    # 跳过非测试的调试/工具脚本（不保证可被 JSBin 编译运行）
    if [ "$rel_path" = "debug/find_crash_labels.js" ] || [ "$rel_path" = "debug/test_type_infer.js" ]; then
        echo -e "${YELLOW}SKIP${NC} (调试工具)"
        ((SKIPPED++))
        return
    fi
    
    # 检查是否有已知问题标记
    # if grep -q "已知问题" "$test_file" 2>/dev/null; then
    #     echo -e "${YELLOW}SKIP${NC} (已知问题)"
    #     ((SKIPPED++))
    #     return
    # fi
    
    # 编译
    if ! node "$PROJECT_DIR/cli.js" "$test_file" -o "$output_file" >/dev/null 2>&1; then
        echo -e "${RED}FAIL${NC} (编译失败)"
        ((FAILED++))
        return
    fi
    
    # 运行
    local run_cmd="$output_file"
    if command -v timeout >/dev/null 2>&1; then
        run_cmd="timeout 5 $output_file"
    elif command -v gtimeout >/dev/null 2>&1; then
        run_cmd="gtimeout 5 $output_file"
    fi

    if $run_cmd >/dev/null 2>&1; then
        echo -e "${GREEN}PASS${NC}"
        ((PASSED++))
    else
        echo -e "${RED}FAIL${NC} (运行失败)"
        ((FAILED++))
    fi
}

# 查找并运行测试
if [ -n "$1" ]; then
    # 指定了参数
    if [ -f "$1" ]; then
        run_test "$1"
    elif [ -d "$1" ]; then
        for f in "$1"/*.js; do
            [ -f "$f" ] && run_test "$f"
        done
    fi
else
    # 运行所有测试
    echo "=== JSBin 测试套件 ==="
    echo ""
    
    for dir in "$SCRIPT_DIR"/*/; do
        [ -d "$dir" ] || continue
        dir_name=$(basename "$dir")
        [ "$dir_name" = "build" ] && continue
        
        echo "--- $dir_name ---"
        for f in "$dir"*.js; do
            [ -f "$f" ] && run_test "$f"
        done
        echo ""
    done
fi

# 输出统计
echo "=== 测试结果 ==="
echo -e "通过: ${GREEN}$PASSED${NC}"
echo -e "失败: ${RED}$FAILED${NC}"
echo -e "跳过: ${YELLOW}$SKIPPED${NC}"

# 返回错误码
[ $FAILED -eq 0 ]
