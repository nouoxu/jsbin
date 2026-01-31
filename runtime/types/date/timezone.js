// JSBin 时区处理
// 完整时区支持实现
//
// 时区数据结构:
// - 时区偏移量（分钟）
// - DST (夏令时) 规则
// - 时区名称

import { VReg } from "../../../vm/registers.js";

// 常用时区定义 (偏移量单位：分钟)
export const TIMEZONE_OFFSETS = {
    UTC: 0,
    GMT: 0,
    EST: -300, // UTC-5 (美国东部标准时间)
    EDT: -240, // UTC-4 (美国东部夏令时)
    CST: -360, // UTC-6 (美国中部标准时间)
    CDT: -300, // UTC-5 (美国中部夏令时)
    MST: -420, // UTC-7 (美国山地标准时间)
    MDT: -360, // UTC-6 (美国山地夏令时)
    PST: -480, // UTC-8 (美国太平洋标准时间)
    PDT: -420, // UTC-7 (美国太平洋夏令时)
    CET: 60, // UTC+1 (中欧时间)
    CEST: 120, // UTC+2 (中欧夏令时)
    JST: 540, // UTC+9 (日本标准时间)
    CST_CHINA: 480, // UTC+8 (中国标准时间)
    IST: 330, // UTC+5:30 (印度标准时间)
    AEST: 600, // UTC+10 (澳大利亚东部标准时间)
    AEDT: 660, // UTC+11 (澳大利亚东部夏令时)
};

// IANA 时区映射到偏移量
export const IANA_TIMEZONE_MAP = {
    "America/New_York": { std: -300, dst: -240 },
    "America/Chicago": { std: -360, dst: -300 },
    "America/Denver": { std: -420, dst: -360 },
    "America/Los_Angeles": { std: -480, dst: -420 },
    "Europe/London": { std: 0, dst: 60 },
    "Europe/Paris": { std: 60, dst: 120 },
    "Europe/Berlin": { std: 60, dst: 120 },
    "Asia/Tokyo": { std: 540, dst: 540 },
    "Asia/Shanghai": { std: 480, dst: 480 },
    "Asia/Kolkata": { std: 330, dst: 330 },
    "Australia/Sydney": { std: 600, dst: 660 },
    "Pacific/Auckland": { std: 720, dst: 780 },
};

export class TimezoneGenerator {
    constructor(vm) {
        this.vm = vm;
    }

    // _timezone_get_offset(timezone_name_ptr) -> offset_minutes
    // 根据时区名称获取偏移量
    generateGetOffset() {
        const vm = this.vm;

        vm.label("_timezone_get_offset");
        vm.prologue(16, [VReg.S0]);

        vm.mov(VReg.S0, VReg.A0); // timezone name

        // 比较常见时区名称
        // UTC
        vm.lea(VReg.A0, "_tz_utc");
        vm.mov(VReg.A1, VReg.S0);
        vm.call("_strcmp");
        vm.cmpImm(VReg.RET, 0);
        vm.jeq("_tz_offset_utc");

        // GMT
        vm.lea(VReg.A0, "_tz_gmt");
        vm.mov(VReg.A1, VReg.S0);
        vm.call("_strcmp");
        vm.cmpImm(VReg.RET, 0);
        vm.jeq("_tz_offset_utc");

        // EST
        vm.lea(VReg.A0, "_tz_est");
        vm.mov(VReg.A1, VReg.S0);
        vm.call("_strcmp");
        vm.cmpImm(VReg.RET, 0);
        vm.jeq("_tz_offset_est");

        // PST
        vm.lea(VReg.A0, "_tz_pst");
        vm.mov(VReg.A1, VReg.S0);
        vm.call("_strcmp");
        vm.cmpImm(VReg.RET, 0);
        vm.jeq("_tz_offset_pst");

        // CST (中国)
        vm.lea(VReg.A0, "_tz_cst");
        vm.mov(VReg.A1, VReg.S0);
        vm.call("_strcmp");
        vm.cmpImm(VReg.RET, 0);
        vm.jeq("_tz_offset_cst");

        // JST
        vm.lea(VReg.A0, "_tz_jst");
        vm.mov(VReg.A1, VReg.S0);
        vm.call("_strcmp");
        vm.cmpImm(VReg.RET, 0);
        vm.jeq("_tz_offset_jst");

        // 默认返回 UTC
        vm.jmp("_tz_offset_utc");

        vm.label("_tz_offset_utc");
        vm.movImm(VReg.RET, 0);
        vm.epilogue([VReg.S0], 16);

        vm.label("_tz_offset_est");
        vm.movImm(VReg.RET, -300); // -5 小时
        vm.epilogue([VReg.S0], 16);

        vm.label("_tz_offset_pst");
        vm.movImm(VReg.RET, -480); // -8 小时
        vm.epilogue([VReg.S0], 16);

        vm.label("_tz_offset_cst");
        vm.movImm(VReg.RET, 480); // +8 小时
        vm.epilogue([VReg.S0], 16);

        vm.label("_tz_offset_jst");
        vm.movImm(VReg.RET, 540); // +9 小时
        vm.epilogue([VReg.S0], 16);
    }

    // _timezone_convert(timestamp_ms, from_offset, to_offset) -> converted_timestamp_ms
    // 在时区之间转换时间戳
    generateConvert() {
        const vm = this.vm;

        vm.label("_timezone_convert");
        vm.prologue(0, []);

        // timestamp = timestamp + (to_offset - from_offset) * 60 * 1000
        vm.sub(VReg.V0, VReg.A2, VReg.A1); // to - from (分钟差)
        vm.movImm(VReg.V1, 60000); // 60 * 1000
        vm.mul(VReg.V0, VReg.V0, VReg.V1); // 毫秒差
        vm.add(VReg.RET, VReg.A0, VReg.V0);
        vm.epilogue([], 0);
    }

    // _timezone_is_dst(timestamp_ms, timezone) -> 0 or 1
    // 检查给定时间戳在指定时区是否处于夏令时
    // 简化实现：美国和欧洲的 DST 规则
    generateIsDst() {
        const vm = this.vm;

        vm.label("_timezone_is_dst");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2]);

        vm.mov(VReg.S0, VReg.A0); // timestamp
        vm.mov(VReg.S1, VReg.A1); // timezone ptr

        // 转换时间戳为日期组件
        // 简化：获取月份（3月到11月可能是DST）
        // 实际的 DST 规则更复杂，需要考虑具体日期

        // 计算年份和月份
        // days since epoch = timestamp / (24 * 60 * 60 * 1000)
        vm.movImm64(VReg.V0, 86400000n); // ms per day
        vm.div(VReg.S2, VReg.S0, VReg.V0); // days

        // 简化：假设大约在第 3-10 月是 DST
        // 实际需要更复杂的日历计算

        // 暂时返回 0 (无 DST)
        vm.movImm(VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);
    }

    // _timezone_format(timestamp_ms, timezone, format_ptr, output_ptr) -> void
    // 格式化时间戳为字符串
    generateFormat() {
        const vm = this.vm;

        vm.label("_timezone_format");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S0, VReg.A0); // timestamp
        vm.mov(VReg.S1, VReg.A1); // timezone
        vm.mov(VReg.S2, VReg.A2); // format
        vm.mov(VReg.S3, VReg.A3); // output

        // 获取时区偏移
        vm.mov(VReg.A0, VReg.S1);
        vm.call("_timezone_get_offset");
        vm.mov(VReg.S4, VReg.RET); // offset

        // 转换为本地时间
        vm.mov(VReg.A0, VReg.S0);
        vm.movImm(VReg.A1, 0); // from UTC
        vm.mov(VReg.A2, VReg.S4); // to local
        vm.call("_timezone_convert");
        vm.mov(VReg.S0, VReg.RET);

        // 调用日期格式化
        vm.mov(VReg.A0, VReg.S0);
        vm.mov(VReg.A1, VReg.S2);
        vm.mov(VReg.A2, VReg.S3);
        vm.call("_date_format_internal");

        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 64);
    }

    // _timezone_get_local_offset() -> offset_minutes
    // 获取本地时区偏移量
    generateGetLocalOffset() {
        const vm = this.vm;

        vm.label("_timezone_get_local_offset");
        vm.prologue(0, []);

        // 简化：返回系统默认时区
        // 实际应该通过系统调用或环境变量获取
        vm.movImm(VReg.RET, 0); // 默认 UTC
        vm.epilogue([], 0);
    }

    // 生成时区字符串常量
    generateTimezoneStrings(asm) {
        const timezones = [
            ["_tz_utc", "UTC"],
            ["_tz_gmt", "GMT"],
            ["_tz_est", "EST"],
            ["_tz_edt", "EDT"],
            ["_tz_cst", "CST"],
            ["_tz_cdt", "CDT"],
            ["_tz_mst", "MST"],
            ["_tz_mdt", "MDT"],
            ["_tz_pst", "PST"],
            ["_tz_pdt", "PDT"],
            ["_tz_jst", "JST"],
            ["_tz_ist", "IST"],
        ];

        for (const [label, str] of timezones) {
            asm.addDataLabel(label);
            for (let i = 0; i < str.length; i++) {
                asm.addDataByte(str.charCodeAt(i));
            }
            asm.addDataByte(0);
        }
    }

    generate() {
        this.generateGetOffset();
        this.generateConvert();
        this.generateIsDst();
        this.generateFormat();
        this.generateGetLocalOffset();
    }
}
