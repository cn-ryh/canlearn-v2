# CL-013b/c 门禁交付

2026-10-14（UTC）。按用户确认规划，将既有本地门禁包提交/推送到草稿
[PR #55](https://github.com/cn-ryh/canlearn-v2/pull/55)，保留原基分支，不合并 main、不关闭卡或代签。

实现提交 [6714527](https://github.com/cn-ryh/canlearn-v2/commit/6714527940187c8c4d0d7f448d35871a43cea41f)
的 [GitHub CI](https://github.com/cn-ryh/canlearn-v2/actions/runs/38560276486) SUCCESS，verify/security 两 job 成功。
推送钩子完整 `pnpm verify` 通过；远端 branch/PR head 与提交核对一致。
[门禁包及历史源/工件 SHA](../integration/CL-013bc/README.md)仍绑定初次本地归档代码，
不把后续 CL-010 的新增行为混入旧结果。

验证范围：API143/Web9/Python43、14 项质量故障检查、35 项真实合成集成及实际 HTTP/事件破坏探针、
7 项 PostgreSQL 增量/兼容/失败回滚、密钥历史/当前工作区扫描、全部 pnpm/uv 依赖和固定镜像扫描、2 项受控扫描负例。
依赖 HIGH/CRITICAL 0；镜像 223 HIGH/3 CRITICAL 仍为报告，处置目标 10 月 21 日，到期阻断。

已发布 [#51 证据](https://github.com/cn-ryh/canlearn-v2/issues/51#issuecomment-6167938717)及
[#52 证据](https://github.com/cn-ryh/canlearn-v2/issues/52#issuecomment-6167939937)，两卡 Open/needs-review；
只勾可复核产出与 PR/验证项，实际负责人、非作者审核及验收人项未勾。真人标注继续延期，
CL-009 四卡仍 Open/blocked。本轮后续工程为 [CL-010 固定候选与真实 MinerU V1](../workflow/CL-010/README.md)，
许可、安全、生产及 R0 验收条件分别保留。
