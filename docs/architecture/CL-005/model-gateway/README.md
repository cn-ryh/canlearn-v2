# CL-005c · 聚合 Responses 与官方 Python SDK 核验

2026-10-13 · 只发送原创合成资料。工件是隔离探针与选型建议，未部署模型网关，
未改业务依赖、API/任务契约、费用账本或真实资料的供应商准入状态。

## 当前建议

2026-10-13追加[合成业务链报告](business-chain-evaluation.md)：首轮0/6链，显式提示Schema对照
最终6/6；内部继续比较优先DeepSeek生成＋Step流式校验＋本地整数/来源门禁，至多一次修复。
Step无答案JSON失败与长输出期限仍留证；本地额外题干长度规则的提示遗漏及小对照单列，
不能把全部format失败归因模型。下面18次算术矩阵保留为历史短任务证据。

调用层优先使用固定版本官方 Python SDK `OpenAI(base_url=..., max_retries=0)`，
应用另行检查顶层状态、最终答案、拒绝/工具输出、结构/语义、用途和费用，不把 SDK 返回对象当作业务成功。
DeepSeek保持合成基线；**GLM（glm-5.3）明确标为FAILED，所有路径均从候选和备用中排除**。
依据为16K严格JSON/真值仅1/18、两次流式期限、4096及16K非流式无最终答案；用户明确要求排除。
以往简单流式烟测通过的记录保留为历史证据，不再赋予GLM选型资格。
失败范围是当前聚合别名/样本/质量门，不写成所有GLM模型的普遍结论；未部署路由，禁用为R0选型决定。
新增40次同矩阵比较已完成：**step-5-preview流式18/18通过，仅保留流式合成候选**；
**minimax-m3流式1/18通过，本轮不选入候选/备用**，四项算术18/18正确但完整来源集合仅1/18。
两模型各两次非流式均completed、只有reasoning无最终文本；不作为非流式备用。
Step可从temperature0/medium继续比较，该组2/2、中位6.220秒；每格两次，尚不足以决定最优参数。
决策见 [selection-record.json](selection-record.json)，完整比较见 [补充报告](candidate-evaluation.md)。
历史DeepSeek/GLM回显带`-x`后缀，新两模型回显给定别名；均只证明平台标签，
不证明官方模型 ID、固定权重版本或真实上游。

用户要求输出上限提高到16K，后续探针默认 `max_output_tokens=16384`，并补 temperature/effort 比较。
这是请求上限，不能从短输出证明平台实际上可完成16K输出。正式业务按步骤预留预算并设置合理额度，
不可将16K全局上限解释成每个任务必须用完，也不能用“返回200”替代完成/证据与质量检查。

真实资料路径继续禁用：平台主体、实际路由/版本、处理地域、训练/留存、日志、分包、删除与退出
条件尚未取得可核验证据。`store:false` 已发送，但平台并未完整回显，不构成零留存证明。

## 可复现工具

- [responses_probe.py](responses_probe.py)：原始HTTP/严格归一化对照及错误/usage/成本边界。
- [test_responses_probe.py](test_responses_probe.py)、[contract-results.json](contract-results.json)：
  48项本地故障注入通过，覆盖错误状态、拒绝、不完整输出、缺usage、缓存/推理计量、
  SSE断流/重复/乱序/终止矛盾、超时、重定向、超大响应及缺失消息状态的显式配置。
  使用MockTransport，不是平台429/取消/故障恢复实测，也不代表业务费用账本已实现。
- [sdk_probe.py](sdk_probe.py)、[sdk-results.json](sdk-results.json)：`import openai` / `from openai import OpenAI`
  直接调用官方SDK2.54.0；绕开原始HTTP探针的严格消息状态规则，初次使用4096上限。
- [parameter_probe.py](parameter_probe.py)、[parameter-results.json](parameter-results.json)：
  历史DeepSeek/GLM的16K矩阵与独立GLM非流式观察，原结果保留。
- [candidate_probe.py](candidate_probe.py)、[candidate-results.json](candidate-results.json)：
  复用上一轮提示/Schema/评估函数，MiniMax/Step相同16K矩阵及各两次非流式；拒绝已标FAILED的别名。
- [补充比较](candidate-evaluation.md)、[补充费用](candidate-cost-results.json)：新40次结果与用户报价估算。
- [业务链报告](business-chain-evaluation.md)、[首轮](business-chain-results.json)、
  [显式结构对照](business-contract-results.json)：生成/校验/一次修复、无答案与48题，原失败保留。
- [额外规则对照](business-gate-results.json)、[业务链费用](business-cost-results.json)：补齐题干长度提示后的2请求核验及本轮46请求独立汇总，5次未知用量单列。
- [live-results.json](live-results.json)：此前原始HTTP、结构诊断、显式兼容配置及真实错误请求。
- [报价](quoted-rates.json)：用户提供的输入/输出价格；新增MiniMax/Step缓存价格，DeepSeek/GLM缓存单价仍未知。
  报价不等于平台账单核验。

仅从受控运行环境加载 `CL005_MODEL_BASE_URL`、`CL005_MODEL_API_KEY` 和 `CL005_MODEL_ALIASES`，
不写入Git或命令示例。Base URL包含所需的`/v1`前缀，没有默认外部入口/模型发现/供应商降级。

```bash
uv run --script docs/architecture/CL-005/model-gateway/sdk_probe.py \
  --output /tmp/cl005-sdk.json --max-output-tokens 16384
uv run --script docs/architecture/CL-005/model-gateway/candidate_probe.py \
  --output /tmp/cl005-candidates.json
uv run --project apps/workflow pytest \
  docs/architecture/CL-005/model-gateway/test_responses_probe.py -q
```

新探针固定每模型3个temperature×3个effort×2次流式重复，另各加low/high两次非流式，
MiniMax/Step共40个请求。历史`parameter_probe.py`两模型38次结果保留；GLM现已排除，不继续调用。
SDK重试0、请求超时60秒，流式另有120秒检查；无并发冲击限流。
错误只保存类型/HTTP状态，不保存响应原文、提示、reasoning、密钥或公网请求标识；ID仅留SHA。
SDK结果只保存验证通过的原创合成答案字段，不保存任意模型正文。

## 原始HTTP与SDK结果的区别

原始HTTP初轮每模型各3请求，上限256；DeepSeek两个非流式消息缺少`message.status`，
被原型严格规则拒收，流式通过。不能据此说平台完全无法非流式调用。
随后两次结构诊断确认缺字段及GLM只有reasoning；显式兼容配置下的DeepSeek非流式合成复测通过。
兼容配置只在顶层确认为completed且无错误/不完整详情时允许缺消息状态，不覆盖显式incomplete。
初版没有保留3个被拒收请求的usage，已补修；这3个费用仍待对账，不用重复请求猜原用量。

按用户要求直接使用官方SDK、提高到4096后，结果如下：

| 模型 | 非流式普通JSON | 非流式结构化JSON | 流式 | 观察 |
| --- | --- | --- | --- | --- |
| deepseek-v4.1-flash | 通过 | 通过 | 通过 | SDK能读取缺消息状态的文本；缺字段仍记为兼容差异 |
| glm-5.3 | 无最终文本 | 无最终文本 | 通过 | 非流式completed但只有reasoning；usage输出159/166，远低于4096上限 |

因此，GLM初轮incomplete可能受256上限影响，但提高额度不能解释或修复4096非流式的空最终答案。
不得以reasoning冒充答案；无答案的调用也报告输出用量，不能记作零成本。
SDK读取文本的宽容行为不证明供应商完全符合协议，不替代应用权限/状态/质量门禁。

不存在的合成模型名在原始HTTP及SDK各测试一次，平台均返回503；SDK为`InternalServerError`，
自动重试关闭，两次都没有重试/降级。不把该503解释成已经核验404或平台限流行为。

## 历史DeepSeek/GLM的16K参数比较

2026-10-12轮次使用另一份原创合成算术资料：当前有效版本页数替代旧版本、按页生成题目、排除审核失败题、
按每日上限向上取整。固定真值为44页、132道候选、123道合格题、9天和S1–S5来源。
每组返回严格JSON，与独立整数真值/来源集合比较，不只凭生成成功判断答案正确。

temperature为0/0.7/1.0，`reasoning.effort`为low/medium/high；随机顺序固定种子5005。
每模型每组合两次，记录首文本时间、总耗时、token数、最终/增量一致性、参数回显和错误。
两次重复是小样本技术观察，不能证明稳定延迟、学科质量或temperature的普遍因果效应。
回显不完整或未观察到显著差别时，标为上游实际应用未核验，不因HTTP200声称参数已生效。

38个请求已完成：36次流式矩阵＋2次GLM非流式。流式DeepSeek通过17/18，GLM通过1/18；
GLM有2次在120秒期限后关闭连接，其余未通过多为完整文本不是目标JSON，不能把未解析的字段
计作已经证实算术答错。所有已获得终止对象的temperature/effort/max_output_tokens回显均缺失；
请求参数确实传入SDK，但上游实际应用仍未核验。

以下把三个temperature合并，每个effort共6次；耗时和输出中位仅包含拿到完整usage的请求，
超时另列，不能将其排除后报告全请求P95或总体可用性：

| 模型 | effort | 严格JSON/真值通过 | 未知终止/超时 | 完整回执耗时中位 s | 已报告输出token中位 |
| --- | --- | --- | --- | --- | --- |
| DeepSeek | low | 5/6 | 0 | 5.433 | 705.5 |
| DeepSeek | medium | 6/6 | 0 | 3.857 | 401 |
| DeepSeek | high | 6/6 | 0 | 5.6145 | 741 |
| GLM | low | 1/6 | 1 | 11.154 | 400 |
| GLM | medium | 0/6 | 0 | 18.971 | 671.5 |
| GLM | high | 0/6 | 1 | 18.783 | 710 |

DeepSeek在temperature0/0.7/1.0下分别5/6、6/6、6/6；同一设置也有输出量差异，
不能从两次重复或0温度推定确定性。作为继续内部比较的基线，可采用DeepSeek＋temperature0.7＋medium：
该组2/2通过、耗时中位3.574秒，输出309/475token。high本轮没有显示额外真值收益，
不据此宣称普遍最优；真实学科任务/独立校验与参数实际传递仍交CL-009及平台核验。

GLM的16K非流式low/high均completed但只有reasoning、没有最终文本；提高额度/effort没有修复此例。
36个完整usage回执中最高输出2293token，未靠样本达到16K边界；两个关闭连接的请求上游停止及费用未知。
不自动重试它们、不移除参数或改成另一个供应商；未通过严格JSON的文本不进入业务接纳。

## 报价、费用与业务边界

用户提供人民币每百万token报价：DeepSeek输入0.25、输出0.88；GLM为5倍，即输入1.25、输出4.40，
两者缓存输入价格未知。新增MiniMax输入1.20、输出5.80、缓存0.24；Step输入1.20、输出4.00、缓存0.09，
新报价沿用此前每百万token单位。费用使用Decimal，输出token已包含其中的推理用量，不重复加费。
有usage且无缓存时按报价估算；有缓存时只汇总已知非缓存输入＋输出，再单列“缓存按普通输入计费”
假设情景。缺usage、HTTP错误和取消/断流未知结果仍待对账，不自动记0或盲目付费重试。
本轮未查询账单/最低计费单位、取整、汇率、税费或实际上游计费，估算不是实际扣款。
[历史费用汇总](cost-results.json)：共55个请求，48个有可用usage，已观察到35,193token。
按报价可定价部分合计¥0.07574293；把未知缓存暂按普通输入计费的情景为¥0.07870418，
两者均未计入7个未知用量请求（初版丢失3、真实503两次、流式期限两次），实际总扣款未知。
缓存输入2369token未取得单价；不把上述小额观察扩展成¥180/月可承诺业务题量。
新增40请求全部有合法usage、25,922token；按新报价估算MiniMax¥0.05439600、Step¥0.02966000，
合计¥0.08405600，另见[补充费用](candidate-cost-results.json)。新旧轮次分开，历史7个未知用量仍待对账。

业务API接续实现逐步骤预算预留、准入与取消/删除原子协调、实际用量接纳、未知成本对账及释放。
SDK自动重试关闭后，是否重试由该层决定；供应商幂等/取消未核验，不能保证恰好一次或取消退款。
后续任务还需长输出/断流、真实业务多步骤成本、模型版本漂移与供应商退出验证；真实资料质量交CL-009。

官方对照：[Python SDK](https://developers.openai.com/api/reference/python)、
[Responses create](https://developers.openai.com/api/reference/python/resources/responses/methods/create)、
[推理参数](https://developers.openai.com/api/docs/guides/reasoning)。SDK参数定义是协议对照，
不是这些聚合别名的官方模型支持或数据政策证明。
