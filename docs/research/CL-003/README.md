# CL-003 · 可重复竞品对标

版本：1.0-draft · 2026-10-03 · 分支：`docs/cl-003-competitor-benchmark`

对应 [CL-003 #3](https://github.com/cn-ryh/canlearn-v2/issues/3) 与 #21/#22。
D 执行，C 复核资料/评分，A 审核可比性；真实成员沿用角色占位。

| 子项 | 工件 | 状态 |
| --- | --- | --- |
| CL-003a / #21 | 原创合成 PDF、来源/使用边界、固定任务与评分表、空白记录 | 已准备；待 C 复核及 CL-009a 来源准入，不声称样本已签审 |
| CL-003b / #22 | 官方来源初筛、会话和盲评记录模板 | 未执行登录后统一任务；账号/可用客户端尚未提供 |

## 工件与执行

- [资料说明与真值](corpus-and-ground-truth.md)：只将指定 PDF 输入竞品，不上传答案、manifest 或评审文档。
- [固定任务与评分](protocol-and-rubric.md)：v1.0 候选协议须在首轮前由 D/C 记录确认；后续修改须升版本并重跑所有对象。
- [公开信息初筛](official-sources-and-results.md)：官网说明与实测分开；读取公开页面不是一轮产品对标。
- [记录格式](templates/README.md)：空白 CSV 与会话模板，完成记录放到 `research-private/CL-003/`。

建议首轮对象为 StudyFetch、RemNote、Knowt，覆盖资料学习与计划的不同实现。其他产品可后续追加，但必须使用同样协议；CanLearn 目前只有骨架，不能把纸面方案当成运行产品参与排名。

可重建资料：先在仓库根目录执行 `pnpm install --frozen-lockfile`，再执行 `uv run --script docs/research/CL-003/build_fixtures.py`。脚本使用固定 ReportLab 版本和 Droid Sans Fallback 字体；字体路径可通过 `--font` 指定同一字体，字体 SHA 记入 manifest。JSON 在写入前由仓库安装的 Biome 按根目录配置格式化，重建后可直接通过格式门禁；若尚未安装 Biome，脚本在生成文件前退出并提示安装依赖。生成目录含字体版权及 Apache-2.0 全文，不改全仓库许可证。

开始实测前：确认账号/地区/客户端/套餐和上传许可；建立新学习空间；保存 PDF 的 SHA、协议版本和会话参数；按固定顺序执行；输出去敏后由隐藏产品名的评审人评分；D 最后恢复对象映射并解释不可比项。默认不付费、不注册新账号、不发布共享资源、不发送邀请，套餐限额只能作为本会话约束记录。

CL-002b 已有脚本但尚未真实试跑；CL-009a 尚无已签审基准集。本包先准备不含第三方正文的独立合成烟测素材，不替代真实 PDF 基准或访谈。样本与规则待复核、登录后记录未到齐时，CL-003 不关闭。
