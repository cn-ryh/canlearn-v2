# CL-009 · 合法样本与逐页/引用真值准备

2026-10-13 · 准备包与原创合成夹具登记；真实合法基准及人工双人复核尚未完成。
对应#9/#39–#41；C主责，A/权利负责人核用途，B复核标注。

依据：[权利矩阵](../../security/CL-004/permissions-and-content-rights.md)、
[既有原创夹具](../../research/CL-003/corpus-and-ground-truth.md)、
[CL-006引用与版本](../../architecture/CL-006/versions-and-invalidation.md)。
当前没有用户提供的教材、扫描件、真题或受限原件；本包不下载未核权资料补足目标。

| 子项 | 当前产出 | 尚缺 |
| --- | --- | --- |
| CL-009a | [样本准入与分层计划](admission-and-sampling.md)、[登记表](corpus-manifest.json)、[空白外部样本台账](external-samples.csv) | 外部合法样本、用途凭据、权利签审；目标约12份/120页不是已取得量 |
| CL-009b | [逐页与引用协议](annotation-protocol.md)、[人工标注空表](page-annotations.csv) | 两名标注者实际记录、差异与仲裁；不以生成器锚点冒充人工标注 |
| CL-009c | [可执行登记核验](validate_corpus.py)、[核验结果](corpus-check-results.json) | 真实样本逐页烟测、复杂公式/扫描/表格质量与缺口补样 |

合成登记覆盖既有五份小PDF（含同一文档的v1/v2）及300页性能夹具，
按家族计5份、按版本计6个文件、文件页数合计310页。小夹具仅4家族/10版本页，
300页重复简单版式只计性能观察，不能把总页数310宣传为已覆盖真实120页质量目标。
生成器锚点提供精确引用位置，标为generator_reference，未经人工双标与原件复核。

```bash
python3 docs/benchmarks/CL-009/validate_corpus.py \
  --output /tmp/cl009-corpus-checks.json
```

原件继续留在各自已有目录，不复制PDF。未来私有原件/合同只入受控存储，台账仅留最小引用，
不得把原件、个人信息、实际签名URL或合同附件提交仓库/公开Issue。
真实资料模型外发仍受ADR-0005供应商准入限制，解析可用许可不自动包含外部模型评测许可。
