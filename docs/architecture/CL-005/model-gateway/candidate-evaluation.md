# CL-005c · MiniMax / Step 补充比较与 GLM 失败决定

2026-10-13 · 用户要求glm-5.3彻底标注失败，再比较minimax-m3、step-5-preview。
只使用当前聚合入口、用户给定别名与原创合成资料；不推定官方固定模型或真实资料准入。

## 选型决定

- **glm-5.3：FAILED，所有路径从候选和备用排除。** 依据为此前严格JSON/真值1/18、
  两次流式期限、4096与16K非流式无最终答案，加上用户明确决定。历史简单烟测成功记录仍保留，
  不再用它赋予流式候选资格，也不把此失败扩展成所有GLM模型的能力结论。
- **step-5-preview：流式合成候选。** 流式18/18通过，非流式low/high都没有最终文本，
  本轮可用方向限定stream=True，不能作为非流式降级路径。
- **minimax-m3：本轮不选入候选/备用，待引用问题修复后另行评测。** 四项算术18/18正确，
  完整S1–S5来源集合仅1/18通过；不能把引用失败写成算术失败。非流式low/high都无最终文本。
- DeepSeek继续作为此前合成基线。正式真实样本质量、路由/数据处理条件及账单仍待核验。

这些是R0选型记录，现有应用没有模型路由服务可部署/停用。
最终状态见 [selection-record.json](selection-record.json)；新探针拒绝已标FAILED的别名，未再次调用GLM。

## 方法与可复现结果

[candidate_probe.py](candidate_probe.py)直接调用与上一轮相同的
[parameter_probe.py](parameter_probe.py)评估函数。官方SDK2.54.0、相同提示/Schema/真值/源码SHA，
max_output_tokens=16384、store=False、max_retries=0；temperature=0/0.7/1.0、
reasoning.effort=low/medium/high，每模型每组合两次流式，随机顺序种子5005。
每模型另加temperature0、low/high两次非流式，总计40请求，完整结果
[candidate-results.json](candidate-results.json)，仅保存允许的状态/计量/已验证合成答案。

真值仍为44有效页、132候选题、123合格题、9天及S1–S5来源；不改提示、删引用要求、去掉
effort/temperature或放宽JSON来提高通过率。代码差异仅为新别名调度、执行日期、FAILED排除与回执归档。
两次重复是技术烟测，不能给出稳定学科质量、生产P95或普遍参数因果结论。

```bash
# 在受控环境中配置CL005_MODEL_BASE_URL / CL005_MODEL_API_KEY / CL005_MODEL_ALIASES
# 本轮别名为minimax-m3,step-5-preview；不要把密钥写入脚本或仓库。
uv run --script docs/architecture/CL-005/model-gateway/candidate_probe.py \
  --output /tmp/cl005-candidates.json
```

## 流式分组

通过数同时要求顶层completed、严格JSON/四项整数真值、完整S1–S5、增量与最终文本一致。
40个请求都有合法usage，流式无超时/HTTP错误，下面每格n=2；未通过引用的MiniMax仍可能算术正确。

| temperature | effort | MiniMax严格通过 | MiniMax总耗时中位 s | Step严格通过 | Step总耗时中位 s |
| --- | --- | --- | --- | --- | --- |
| 0 | low | 0/2 | 3.821 | 2/2 | 7.209 |
| 0 | medium | 0/2 | 5.833 | 2/2 | 6.220 |
| 0 | high | 0/2 | 3.870 | 2/2 | 7.762 |
| 0.7 | low | 0/2 | 3.608 | 2/2 | 7.194 |
| 0.7 | medium | 0/2 | 4.111 | 2/2 | 6.531 |
| 0.7 | high | 0/2 | 4.439 | 2/2 | 16.023 |
| 1.0 | low | 0/2 | 3.657 | 2/2 | 8.099 |
| 1.0 | medium | 0/2 | 3.968 | 2/2 | 7.995 |
| 1.0 | high | 1/2 | 3.963 | 2/2 | 9.329 |

三个temperature合并后，每个effort n=6：

| 模型 | effort | 严格通过 | 总耗时中位 s | 已报告输出token中位 |
| --- | --- | --- | --- | --- |
| MiniMax | low | 0/6 | 3.657 | 433 |
| MiniMax | medium | 0/6 | 4.361 | 448.5 |
| MiniMax | high | 1/6 | 4.139 | 416 |
| Step | low | 6/6 | 7.209 | 271 |
| Step | medium | 6/6 | 6.952 | 285.5 |
| Step | high | 6/6 | 9.155 | 395.5 |

Step各参数组都通过，high本轮没有额外真值收益，部分输出/耗时更高，不能证明高effort更有价值。
Step的temperature0/medium（2/2、中位6.220秒、输出311/292）可作为继续内部比较的起点，
temperature0.7/medium也通过，但不能从每格两次宣布最优。MiniMax提升temperature/effort没有
稳定修复来源覆盖；不因为数字正确或耗时更低而放宽引用门。

新两模型回显自身别名；temperature、effort、max_output_tokens仍全部未回显，
不能以HTTP200断言上游接受并实际应用。SDK发送的参数已核验，实际传播需平台证据。
最高已报告输出848token，样本没有触达16K边界，不证明可生成完整16K输出。

## 非流式与费用

| 模型 | effort | 状态 | 最终文本 | 输出token | 总耗时 s |
| --- | --- | --- | --- | --- | --- |
| MiniMax | low | completed | 空；只有reasoning | 848 | 7.198 |
| MiniMax | high | completed | 空；只有reasoning | 267 | 2.908 |
| Step | low | completed | 空；只有reasoning | 299 | 6.065 |
| Step | high | completed | 空；只有reasoning | 352 | 7.865 |

因此限制Step到流式；模型返回reasoning不作为最终答案，空文本也不能记零费用。
这种聚合转换表现是否来自平台或真正上游尚未定位，不虚构SDK或模型家族的根因。

用户提供报价，沿用此前每百万token单位：MiniMax输入¥1.20、输出¥5.80、缓存命中¥0.24；
Step分别¥1.20/¥4.00/¥0.09。Decimal计费只按已报告usage、区分缓存输入、不重复加推理费。

| 模型 | 请求 | 已报告总token | 按用户报价估算 CNY |
| --- | --- | --- | --- |
| MiniMax | 20 | 15,840 | 0.05439600 |
| Step | 20 | 10,082 | 0.02966000 |
| 本轮合计 | 40 | 25,922 | **0.08405600** |

[candidate-cost-results.json](candidate-cost-results.json)单列本轮，不覆盖此前55请求的
[历史费用](cost-results.json)。本轮40请求全部有合法usage，实际账单/取整/最低计费未查，
估算不是实际扣款。模型仍回报reasoning_tokens=0，即使存在reasoning item；只按output_tokens
计入已报告输出，不声称可以还原内部推理或上游费用拆分。

归档后`pnpm check`、新探针Ruff lint/format与本地链接检查通过；离线独立重算组合/汇总、
提示/源码SHA和Decimal费用一致。FAILED别名在创建客户端前被拒绝，MockTransport确认SDK
发出16K/temperature/effort与原Schema，核验未增加平台请求，也不证明平台已应用这些参数。

真实资料继续禁用；数据处理、用途、主体/路由及版本条件由ADR-0005/CL-004接续，
真实多学科、无答案、引用质量和独立校验由CL-009定稿。
