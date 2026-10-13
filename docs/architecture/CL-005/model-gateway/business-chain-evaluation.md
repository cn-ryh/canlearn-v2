# CL-005c · 合成业务链与显式结构对照

2026-10-13 · 原创合成资料、固定别名与官方openai2.54.0 SDK；未部署业务网关/账本。
DeepSeek采用temperature0.7、Step采用0；两者effort=medium、stream=True、store=False、
max_output_tokens=16384、max_retries=0，请求60秒/流式120秒检查。

## 方法与质量门

[首轮探针](business_chain_probe.py)分别以DeepSeek/Step生成，再由另一个给定别名校验。
三种场景：有效v2与撤回v1/干扰资料混合、缺失收费来源S6的无答案请求、48题批量。
题目来自6种固定算术任务的重复：有效页44、候选132、合格123、最少9天、5/8天后剩53/11题。
48题不是48个独立学科知识点；本地核字段/整数/必要current来源集合，跨别名模型另核题干/答案，
但真实上游独立性和学科/教学质量尚未验证。

流程最多生成→校验→一次修复→修复校验，不做供应商自动降级或付费循环。
若正常混合版本初稿通过，再注入Q01答案+1及撤回来源S1-v1，显式标fault_injected。
若初稿自身失败则不注入，以原故障走一次修复。最终候选必须本地规则与跨别名校验都通过。
无答案须status=insufficient_evidence、空questions、缺失S6-v1；不能猜收费。

首轮只通过SDK的text.format提交结构约束，提示列业务语义；
[对照探针](business_contract_recheck.py)保留相同Schema/真值/质量门，并把Schema和字段说明写进提示。
未删除参数、移除引用、降低整数/题数要求或改判首次失败；两个提示版本分别留SHA。
提示改变与运行时随机性/平台状态共存，不能声称已定位平台忽略Schema的根因。

每轮数量有上限，第二轮继承首轮费用预留情景，共用¥5报价情景准入；
输入字节＋结构/余量作为保守输入情景，不是平台tokenizer或实际扣款上限保证。
原文/题干/候选/reasoning只在实验内存中处理，不保存任意响应正文、错误正文、地址或密钥；
工件只含允许的状态、字段存在/计数、真值判定、SHA和usage。

## 首轮结果

[business-chain-results.json](business-chain-results.json)：24次请求，6条业务链最终0/6。
19次可读取完整文本、1次不可解析JSON、2次120秒期限、2次收到首文本后主动关闭连接。
首轮存在结构失败和校验不一致，不能从JSON未解析的输出推断全部算术错误。
最高已报告output_tokens=13,480（包含报告中的推理用量），没有证实能完成16K最终文本。
主动关闭与期限的4次请求均没有最终usage，上游是否停止和费用未知；连接关闭不等于退款或取消成功。

首轮失败完整保留，不能将对照通过改记到首轮，或把结构问题按后续字段映射悄悄接纳。

## 显式Schema对照

[business-contract-results.json](business-contract-results.json)：20次请求，最终6/6链通过。

| 生成模型 | 场景 | 初稿本地通过 | 一次修复 | 最终链 | 整链耗时 s |
| --- | --- | --- | --- | --- | --- |
| DeepSeek | 混合版本 | 是；随后注入答案/旧版引用故障 | 注入故障被识别并修复 | 通过 | 40.259 |
| DeepSeek | 无答案 | 是 | 无 | 通过 | 33.542 |
| DeepSeek | 48题 | 是 | 无 | 通过 | 32.710 |
| Step | 混合版本 | 否；format规则 | 一次修复通过 | 通过 | 71.015 |
| Step | 无答案 | 否；不可解析JSON | 一次修复通过 | 通过 | 84.063 |
| Step | 48题 | 否；120秒期限 | 一次修复通过 | 通过 | 245.835 |

跨别名校验采用另一模型，整链耗时包含校验/修复，不是单次请求延迟或P95。
Step的48题链修复后通过不代表最初期限的上游调用已停止；旧尝试费用仍未知。

复核发现本地format还包含题干长度10–600字符，该规则未在首轮/Schema对照的提示及SDK Schema
中显式编码；因此部分format失败可能受探针额外规则影响，不能写成已经证实的JSON Schema违规。
原工件只保留错误类别，无法还原每个旧失败题干长度，不反推根因。
[business_gate_control.py](business_gate_control.py)另用最多2请求，将相同长度/编号规则写入提示，
单列对照记录；不修改旧grade、旧计数或把对照结果当大样本稳定性证明。
[business-gate-results.json](business-gate-results.json)已完成：Step生成/DeepSeek校验2请求通过，
题干长度44/46/36/35/45/45字符，没有修复。这不能还原旧失败根因，但支持将提示与本地规则对齐，
避免把本地附加规则的遗漏记为模型普遍能力结论。

内部继续比较优先用DeepSeek生成＋Step流式校验＋本地整数/来源门禁，提示内完整声明字段与
本地额外规则，并继续传text.format；最多一次修复。Step可作为合成流式候选继续评测，
无答案JSON与长输出超时表明当前证据不足以把它定为批量生成默认。
6种固定算术任务不冻结正式题型、教学质量、拒答阈值或真实资料准入。

## 用量与报价情景

[business-cost-results.json](business-cost-results.json)由
[独立汇总脚本](summarize_business_results.py)重算，仅含本轮46请求：24首轮＋20Schema对照＋2规则对照。
41次有合法usage、已报告169,372token；5次缺usage为3次期限与2次主动关闭连接。
DeepSeek缓存384token缺单价，Step缓存按已给报价计；不以空文本/失败记零，不重复加推理费。

| 模型 | 请求 / 有usage | 已报告token | 已知定价部分 CNY |
| --- | --- | --- | --- |
| DeepSeek | 23 / 22 | 111,610 | 0.07686208 |
| Step | 23 / 19 | 57,762 | 0.14529256 |
| 本轮 | 46 / 41 | 169,372 | **0.22215464** |

把未知缓存按普通输入报价的情景为¥0.22225064，两者都未包含5个未知调用；实际账单未知。
组合预留情景¥2.15100411低于实验¥5情景门限，不宣称实际费用上限保证。
此前95次请求/7个未知用量独立保留，不覆盖旧cost-results或candidate-cost-results。
后续对账需平台回执/账单，不用重发请求猜原usage。

## 复现与边界

```bash
# 仅在受控运行环境配置Base URL与key；本探针固定两个别名和参数。
uv run --script docs/architecture/CL-005/model-gateway/business_chain_probe.py \
  --output /tmp/cl005-chain-first.json
uv run --script docs/architecture/CL-005/model-gateway/business_contract_recheck.py \
  --prior-results /tmp/cl005-chain-first.json --output /tmp/cl005-chain-control.json
python3 docs/architecture/CL-005/model-gateway/summarize_business_results.py \
  --first /tmp/cl005-chain-first.json --recheck /tmp/cl005-chain-control.json \
  --output /tmp/cl005-chain-costs.json
uv run --script docs/architecture/CL-005/model-gateway/business_gate_control.py \
  --prior-results /tmp/cl005-chain-control.json --output /tmp/cl005-chain-gate.json
# 汇总额外规则对照时增加 --gate /tmp/cl005-chain-gate.json
uv run --no-project --with openai==2.54.0 --with httpx==0.28.1 --with pytest \
  python -m pytest docs/architecture/CL-005/model-gateway/test_business_chain_probe.py -q
```

[13项离线故障检查](test_business_chain_probe.py)通过：旧版引用/错误答案/重复ID、无答案与错误校验、
断流/增量不一致/failed/incomplete/503/超时/主动关闭、报价情景超限前拒绝。
使用MockTransport，未增加平台请求；不把它们写成真实429/幂等/取消/故障恢复验收。
业务权限/用途/取消/删除/预算接纳由未来API实现，真实样本与供应商数据边界继续待核验。

官方协议对照：[OpenAI Docs流式指南](https://developers.openai.com/api/docs/guides/streaming-responses)。
官方事件/SDK结构只用于协议对照，不能证明聚合别名的实际上游、参数生效、存储/计费政策。

归档后`pnpm check`、相关Python Ruff lint/format、源码/结果SHA、请求计数、Decimal独立重算及
本地链接检查通过；核验没有新增平台请求。没有重跑应用构建或宣称业务接纳/账本已实现。
