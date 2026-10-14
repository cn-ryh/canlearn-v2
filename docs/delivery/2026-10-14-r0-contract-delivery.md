# R0 分批交付与 Issue 状态核验

2026-10-14（Asia/Shanghai）· GitHub 实际查询快照。
用户明确授权分批提交、推送与相关 Issue 状态处理，再继续下一项；不自动合并 main 或替代非作者签审。

[草稿 PR #55](https://github.com/cn-ryh/canlearn-v2/pull/55)
基于 `docs/cl-004-data-governance`，head 为 `docs/cl-005-technical-decisions`。
保留 CL-004 已推送基线为独立依赖，没有向 main 合并。

| 本轮主题 | 固定提交 |
| --- | --- |
| CL-005b 检索/长块/批量/MinerU 共 GPU | [9070a60](https://github.com/cn-ryh/canlearn-v2/commit/9070a60) |
| CL-005c/d 模型评估与决策 | [4414a48](https://github.com/cn-ryh/canlearn-v2/commit/4414a48) |
| CL-006 模型/写入与版本 | [65fb673](https://github.com/cn-ryh/canlearn-v2/commit/65fb673) |
| CL-009 合法样本与标注准备 | [0cc26ef](https://github.com/cn-ryh/canlearn-v2/commit/0cc26ef) |
| CL-007 REST 草案与健康漂移 | [16ceaf0](https://github.com/cn-ryh/canlearn-v2/commit/16ceaf0) |
| 此前提交/推送授权快照 | [fa0b113](https://github.com/cn-ryh/canlearn-v2/commit/fa0b113) |
| 继续 CL-008 Job/事件/失败设计与门禁 | [d4a9056](https://github.com/cn-ryh/canlearn-v2/commit/d4a9056) |

此前本地已提交的镜像入口、ADR/模板、GPU初测亦随分支完整推送，未重写其提交。
CL-008 固定 SHA `d4a9056a0e7cdcae5cebdbb3329feac548d3c0a4` 已通过 GitHub branch ref 与本地 HEAD 核对。
其 [CI verify](https://github.com/cn-ryh/canlearn-v2/actions/runs/38426857590) 实际 SUCCESS；
本地推送门禁 `pnpm verify` 通过：API122/Web1/Python36，静态/类型、Redocly、Compose配置与构建。
第一次 CL-008 推送被源码/归档摘要不一致门禁拒绝：提交钩子改变了模型格式。
已统一根目录 Ruff 上下文重建归档并修正尚未推送提交，再通过门禁，未跳过钩子。
SSH 连接等待期间使用现有认证作单次 HTTPS 推送/核验，未改全局 Git 配置或远端定义。

## Issue 状态

重查54卡，4卡CLOSED仅为此前CL-004 #4/#23–#25；其余50卡OPEN。
本轮相关17卡 `status:needs-review`、4卡 `status:blocked`，启动时的in-progress已移除。
设计交付/PR证据项按事实勾选；非作者/验收项未勾。CL-009真实样本产出项未勾。
没有擅自指定 B/C/D 的真实身份、伪造人工评论或关闭条件。

| [#5](https://github.com/cn-ryh/canlearn-v2/issues/5) | status:needs-review | [交付证据](https://github.com/cn-ryh/canlearn-v2/issues/5#issuecomment-6149247051) |
| [#6](https://github.com/cn-ryh/canlearn-v2/issues/6) | status:needs-review | [交付证据](https://github.com/cn-ryh/canlearn-v2/issues/6#issuecomment-6149257995) |
| [#7](https://github.com/cn-ryh/canlearn-v2/issues/7) | status:needs-review | [交付证据](https://github.com/cn-ryh/canlearn-v2/issues/7#issuecomment-6149265997) |
| [#8](https://github.com/cn-ryh/canlearn-v2/issues/8) | status:needs-review | [交付证据](https://github.com/cn-ryh/canlearn-v2/issues/8#issuecomment-6149730740) |
| [#9](https://github.com/cn-ryh/canlearn-v2/issues/9) | status:blocked | [交付证据](https://github.com/cn-ryh/canlearn-v2/issues/9#issuecomment-6149274232) |
| [#26](https://github.com/cn-ryh/canlearn-v2/issues/26) | status:needs-review | [交付证据](https://github.com/cn-ryh/canlearn-v2/issues/26#issuecomment-6149249680) |
| [#27](https://github.com/cn-ryh/canlearn-v2/issues/27) | status:needs-review | [交付证据](https://github.com/cn-ryh/canlearn-v2/issues/27#issuecomment-6149252047) |
| [#28](https://github.com/cn-ryh/canlearn-v2/issues/28) | status:needs-review | [交付证据](https://github.com/cn-ryh/canlearn-v2/issues/28#issuecomment-6149254144) |
| [#29](https://github.com/cn-ryh/canlearn-v2/issues/29) | status:needs-review | [交付证据](https://github.com/cn-ryh/canlearn-v2/issues/29#issuecomment-6149256278) |
| [#30](https://github.com/cn-ryh/canlearn-v2/issues/30) | status:needs-review | [交付证据](https://github.com/cn-ryh/canlearn-v2/issues/30#issuecomment-6149260311) |
| [#31](https://github.com/cn-ryh/canlearn-v2/issues/31) | status:needs-review | [交付证据](https://github.com/cn-ryh/canlearn-v2/issues/31#issuecomment-6149262473) |
| [#32](https://github.com/cn-ryh/canlearn-v2/issues/32) | status:needs-review | [交付证据](https://github.com/cn-ryh/canlearn-v2/issues/32#issuecomment-6149264575) |
| [#33](https://github.com/cn-ryh/canlearn-v2/issues/33) | status:needs-review | [交付证据](https://github.com/cn-ryh/canlearn-v2/issues/33#issuecomment-6149268146) |
| [#34](https://github.com/cn-ryh/canlearn-v2/issues/34) | status:needs-review | [交付证据](https://github.com/cn-ryh/canlearn-v2/issues/34#issuecomment-6149270338) |
| [#35](https://github.com/cn-ryh/canlearn-v2/issues/35) | status:needs-review | [交付证据](https://github.com/cn-ryh/canlearn-v2/issues/35#issuecomment-6149272550) |
| [#36](https://github.com/cn-ryh/canlearn-v2/issues/36) | status:needs-review | [交付证据](https://github.com/cn-ryh/canlearn-v2/issues/36#issuecomment-6149732362) |
| [#37](https://github.com/cn-ryh/canlearn-v2/issues/37) | status:needs-review | [交付证据](https://github.com/cn-ryh/canlearn-v2/issues/37#issuecomment-6149733921) |
| [#38](https://github.com/cn-ryh/canlearn-v2/issues/38) | status:needs-review | [交付证据](https://github.com/cn-ryh/canlearn-v2/issues/38#issuecomment-6149735515) |
| [#39](https://github.com/cn-ryh/canlearn-v2/issues/39) | status:blocked | [交付证据](https://github.com/cn-ryh/canlearn-v2/issues/39#issuecomment-6149276412) |
| [#40](https://github.com/cn-ryh/canlearn-v2/issues/40) | status:blocked | [交付证据](https://github.com/cn-ryh/canlearn-v2/issues/40#issuecomment-6149278649) |
| [#41](https://github.com/cn-ryh/canlearn-v2/issues/41) | status:blocked | [交付证据](https://github.com/cn-ryh/canlearn-v2/issues/41#issuecomment-6149280649) |

阻塞面：CL-009外部合法样本0份/0页、真实双标0；CL-005供应商处理/真实质量/部署与
相应外部审批仍由原责任卡接续。CL-008纯内存与Schema验证不代替实际SQL并发、Temporal重放、
GPU停止、物理删除、费用账单或备份恢复。见[CL-008验证记录](../workflow/CL-008/validation-record.json)。

## 下一实现入口

CL-013a #50：按[CL-008恢复矩阵](../workflow/CL-008/failure-and-recovery.md)实现现有
API→业务DB→Temporal→worker的合成最小Job纵向链路，随后CL-013b #51扩展真实契约/故障门禁。
CL-009/010合法样本/质量/许可与CL-014放行保持独立条件；不能将本包通过写成真实资料或生产准入。
任务附件工具调用未返回确认，PR链接与GitHub记录可独立访问，不宣称附件绑定成功。
