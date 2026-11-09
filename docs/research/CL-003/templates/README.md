# 对标记录格式

复制空白模板到 `research-private/CL-003/` 后使用。公开目录只保留空白表；密码、令牌、账号 ID、付款信息和受限输出不进 Git。输出只在服务条件允许的范围保存，去敏后保留足够复核证据。

`runs.csv`：每次对象/输入模式一行；actual_region 必须由实际执行者确认，不能根据语言推测；protocol_version、输入 SHA 集合和样本版本不得省略。费用未知留空，币种分别统计。

`scores.csv`：每个 run/任务/评分项一行；status 为 tested / not_run / unavailable / timeout，后三种 score 留空。rubric_item 如 citation_D01_R1，题目评分逐题写 q_1–q_5。匿名 run ID 与产品映射分开；blind 为 yes / no 并记录未盲理由。首测、重试分开 attempt，不能选最好结果覆盖首测。

elapsed_seconds 包括排队，超时标 censored 并记录实际等待；操作次数与费用单列，失败/拒绝或限额均保留。评分争议不覆盖原行，另增 adjudication 记录和说明。
