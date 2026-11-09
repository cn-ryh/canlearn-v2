# CL-010a 固定候选、许可与待签事项

2026-10-14（UTC）。这是本次独立评测候选的事实快照，不能将源码版本等同于部署镜像或生产许可批准。
MinerU 是 CanLearn 使用的独立文档解析服务；本包保存许可/NOTICE 和原创解析结果，未复制其业务源码。

| 项目 | 固定身份与核验 |
| --- | --- |
| MinerU | 4.0.7；标签 `mineru-4.0.7-released` → commit `175f031cbcded6b527ddb2045ccec460ffecfa26` |
| 已安装 API server | SHA-256 `333b94786cd651cce6bed0dbbca0874ad80a8e960719a95f805bacb572d410fa`，与固定官方源码一致 |
| MinerU wheel | `mineru-4.0.7-py3-none-any.whl`；PyPI SHA-256 `a08b24f733f0160eb9a836b0bb721640caef61d8d4f0ba2fd3aff28c6718111d` |
| DocVortex | 0.5.16；固定 commit `fb59f89dcb4f76dd1adbb3c84bd8dfd51a982c16`；linux x86_64 wheel SHA-256 `28780eba1d72627fa1aa60e21c4a378d156d919f676b83988d01106271637ee2` |
| Basic 模型 | `opendatalab/MinerU-4_models_torch` revision `2b3afb86f4d23fa623f6b2f4b2279ed4ef93a89d`，15 个缓存文件字节/SHA 与既有固定记录复核一致 |
| GPU 环境 | torch 2.8.0、transformers 5.19.0，独立 MinerU venv；[137 个实际安装包版本](package-versions.json) |
| 部署镜像 | 本轮没有选用/构建 MinerU Docker 镜像；目标镜像摘要、系统/原生组件完整清单及供应链签审待补 |

版本身份与上游资料摘要见[上游快照索引](upstream-record.json)。旧模型文件与完整依赖基线见
[CL-005 实测](../../architecture/CL-005/retrieval/coexistence-results.json)和
[独立环境 requirements](../../architecture/CL-005/retrieval/mineru-requirements.txt)。
模型目录包含下载完成标记/锁等辅助文件，15 文件不是 15 个权重模型。
本轮重新只读列出已安装版本，源码与模型散列实查；没有将 wheel 仓库摘要当作整个现有 venv 的逐包安装证明。
Flash CPU 在另一独立临时环境运行，不用于 GPU 依赖/性能或档位质量等价声明。

## 许可事实与义务清单

[MinerU 固定源码许可](https://github.com/opendatalab/MinerU/blob/175f031cbcded6b527ddb2045ccec460ffecfa26/LICENSE.md)
与[安装包原文快照](licenses/mineru-LICENSE.md)一致（SHA 见[索引](licenses/wheel-license-index.json)）。
许可为 Apache-2.0 加附加条款，不能简写为无附加条件的 Apache-2.0：

- 使用方与关联方按合并口径 MAU 超过 1 亿，或月总收入超过 2000 万美元，需要另行商业许可。
- 基于 MinerU 向第三方提供在线服务，需要在相关界面或公开文档显著标明使用 MinerU。
- 应取得商业许可但未取得，或未履行在线署名义务，许可条款规定自动终止。

内部 10 人测试人数不是法律主体/关联方合并口径证明。本包已明确解析服务名称；未来生产界面的显著署名位置、
实际使用主体和商业许可适用判断，仍需 A（任宇航）组织外部权利负责人审核，不能由实现作者自签。

DocVortex 根项目 [MIT 原文](licenses/docvortex-LICENSE.md)已保存；
[固定 pyproject](https://github.com/opendatalab/DocVortex/blob/fb59f89dcb4f76dd1adbb3c84bd8dfd51a982c16/pyproject.toml)
声明分发许可 `MIT AND Apache-2.0 AND BSD-3-Clause`。其 wheel 含字体 NOTICE，本包原样保存
[docvortex-NOTICE](licenses/docvortex-NOTICE)，不删除上游空白/版权告知；原生组件与其他依赖仍需部署分发清单核对。
不能仅凭根 MIT 文本为整个 wheel 签署单一许可证结论。

Basic 模型的[固定模型卡](https://huggingface.co/opendatalab/MinerU-4_models_torch/blob/2b3afb86f4d23fa623f6b2f4b2279ed4ef93a89d/README.md)
及 [metadata 快照](licenses/model-metadata.json)标记 Apache-2.0，保存[卡片正文](licenses/model-card.md)。
模型卡标签不能替代所有组件/训练来源与将来再分发的逐项权利检查。固定 hash 是身份和复现证据，不是权利许可证明。

## 仍保留的验收项

| 待办 | 责任与验收证据 |
| --- | --- |
| 使用主体/关联方门槛、署名方案、必要商业许可 | A → 外部权利负责人，实际签审或明确阻断记录 |
| 目标部署镜像、原生组件/依赖许可与 NOTICE | B/A 固定 tag+digest、软件清单、保留告知及非作者核验；换版本重新评测 |
| 原创工程夹具的范围及将来真实资料准入 | 当前仅仓库原创 PDF；CL-009 真实样本、授权和独立双标仍缺失 |
| GPU/服务行为的非作者审核 | B → C，按本包真实 HTTP 与故障记录审核；不将自动测试当人工确认 |

CL-010a 保留 Open/needs-review，包含上述待决条件；本轮提供可审核的固定候选，不声称法律或生产部署验收完成。

主要依据：上述固定源码/模型卡；[MinerU 4.0.7 PyPI 元数据](https://pypi.org/pypi/mineru/4.0.7/json)、
[DocVortex 0.5.16 PyPI 元数据](https://pypi.org/pypi/docvortex/0.5.16/json)、
[固定 V1 客户端](https://github.com/opendatalab/MinerU/blob/175f031cbcded6b527ddb2045ccec460ffecfa26/mineru/parser/api_client.py)。
