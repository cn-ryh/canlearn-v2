# CanLearn 项目记忆

最后检查：2026-10-14（Asia/Shanghai）；早先段落的UTC日期/原始范围保留。以下为带日期的状态快照。

## 最新收尾状态（2026-10-12，取代下文早先未提交/全部 Open 的快照）

- 用户明确要求先提交此前成果、关闭对应 Issue，再继续 CL-005；并选择只关闭
  CL-004 #4/#23/#24/#25，其余保持 Open。A = 任宇航，其他角色暂保留代号。
- 用户明确接受以 A 的 R0 设计验收收尾，调整原卡的非作者评审关闭要求。
  本包已有人工审阅记录；非作者复核、外部权利/隐私/学科签审和真实安全/E2E/恢复验证
  未被宣称完成，按 CL-005/006/007/008/009/010/013、相应实现卡及 CL-014 接续。
  Q01–Q09 不因关闭本卡而清零，R0 放行仍由 CL-014b 决定。
- 已在 GitHub 四卡逐一发布收尾证据并关闭，随后重新查询确认四卡 CLOSED，
  其余 50 卡 OPEN；父项记录：<https://github.com/cn-ryh/canlearn-v2/issues/4#issuecomment-6122928181>。
- 本地在 `docs/cl-004-data-governance` 分批提交：`4142a0d`（路线图、仓库说明、CL-001），
  `a498575`（CL-002 访谈准备与私下记录忽略规则），`915d45b`（CL-003 可重建合成对标资料），
  `728fecc`（CL-004 设计包、用户验收口径及下游交接）；本记忆另作同步提交。
  CL-001/002/003 的未完成状态如实保留，没有补造访谈、实测或签审数据。
- 本次完整 `pnpm verify` 退出码 0；提交钩子的 lint-staged/commitlint 通过。
  40 个变更文件、86 个本地 Markdown 链接、围栏、空白 CSV、脚本与 5 份 PDF 哈希已检查；
  自有文本空白检查通过。字体版权 NOTICE 保留上游原文，其中三处行尾空白未改写，
  所以不能声称新增文件的无例外 `git diff --check` 全部通过；其余文本检查通过。
- 用户已明确授权推送该工作分支；本段记录推送前的收尾状态，实际推送结果随后核验。
  不向 main 合并，不创建未经请求的发布，不关闭其他 Issue。
- CL-005 已收到的选型输入：大陆优先；额外运行预算 ¥300/月，不包含已有服务器、
  云存储和一台 4070 GPU 服务器；除邮件服务外，用户表示已有云账号/额度、域名及模型 API 等资源。
  具体供应商、地域、规格、实际额度、预计人数和登录需求仍未明确，不将资源存在当能力已验收。

## CL-005 启动与当前工作区（2026-10-12）

此前五个提交已成功推送 `origin/docs/cl-004-data-governance`，远端 SHA 与本地
`7da271e2879756c2e427f675543cfb73bd1401ea` 一致；推送钩子的完整 `pnpm verify` 通过。
核验时工作区干净，四卡 CLOSED/COMPLETED、其余 50 卡 OPEN；工作分支尚无远端 CI 运行记录，
没有向 main 合并。父卡已补充可访问的工件/提交链接：
<https://github.com/cn-ryh/canlearn-v2/issues/4#issuecomment-6122980866>。

随后继续用户已授权的 CL-005，切换新本地分支 `docs/cl-005-technical-decisions`，
从上述已推送提交承接。新增 `docs/architecture/CL-005/README.md` 及 ADR-0003–0006
四份**提议**，覆盖身份/私有存储、检索/索引、模型网关和部署/协调的候选、成本、失败与退出。
同时给两份路线图增加入口；本轮设计草案尚未提交或推送，CL-005 仍未验收、未关闭。

用户确认输入：大陆优先，10 人以内内部测试，额外运行预算 ¥300/月，
不包含已有服务器/云存储/GPU；邮箱注册且必填邀请码，接受邮箱/密码登录并接邮件服务验证邮箱。
既有资源为南京腾讯云 4 核 8G、200M 上限且按流量计费，南京 COS；
宁波小厂开发机 16 核 32G，宁波长期持续运行的 4070 主机 24 核 48G。
上述为用户提供规格，未登录主机或检查容量、COS 配置、网络、GPU 显存、邮件送达或费用。

模型经无公开文档的聚合平台，用户提供 deepseek-v4.1-flash、glm-5.3、gpt 系列别名，
并说明支持 OpenAI Responses 格式。按所提供别名记录，不推定官方模型 ID、实际路由或官方数据政策。
平台名称、价格、地域、训练/留存/分包/删除条件仍未核验，真实资料路径未准入；
仅建议用合成资料验证协议。已实际读取 OpenAI Responses create 官方参考，记录 status/output/SSE/usage
以及 `store: false` 的兼容性核验要求；该字段不能作为聚合平台零留存证明。

当前建议：先核验 Better Auth 邮箱/密码与邀请码门禁、南京 COS 私有桶及受控访问；
评估 PostgreSQL＋pgvector/中文词法检索，保留 Temporal 且不新增独立队列库；
先在宁波开发机验证完整链路，再评估南京 4 核 8G 的内部部署负载。
南京业务事实/对象＋宁波受限 GPU 是跨地域计算**例外提议**，尚未批准，
不默认为 ADR-0002 的生产拓扑变更。模型预算 ¥180 等分配仅为建议，总增量上限仍为用户确认的 ¥300。
Better Auth、pgvector、Temporal 与 OpenAI 官方文档已读取；未选择固定新增版本、安装依赖、
修改业务代码/契约/迁移/环境配置、运行真实模型/存储调用或重做业务测试。

## CL-005 第二轮决策与核验（2026-10-12，当前最新）

用户选择腾讯云 SES，企业资质已有，站点 `cl.hangxiaonet.com` 已备案且可配置 DNS，
发件域名 `no-reply.hangxiaonet.com`，地址 `canlearn@no-reply.hangxiaonet.com`。
用户授权制作模板；已交付 `docs/architecture/CL-005/email-templates/` 下的验证与找回
HTML/Text、六份可重建预览/SES 创建请求体及控制台/API 录入说明。模板未上传/审核、未发送真实邮件。
SDK 官方类型已确认变量语法、Base64 正文和 TemplateData JSON 字符串；SES 官网抓取为浏览器校验页，
没有据此断言价格、地域、域名/地址状态、模板审核或送达已验证。

用户最终修正：邀请码**不绑定邮箱**，任意邮箱可使用一个有效且未使用的邀请码，
一码一次、7天有效。注册成功即消费，失败不消费，邮箱验证不重复消费邀请码；
验证链接1小时、找回30分钟、限流后允许重发。只有邀请码邮箱绑定要求被修正，其他期限仍有效。
已更新 ADR-0003 和入口，未在真实应用中实现注册或邀请功能。

网络确认：双方固定公网 IP、UDP 被封；用户确认南京运行 Web/API、业务 DB、Temporal 与 CPU worker，
宁波仅提供 MinerU/解析入口，公网 TCP HTTPS/mTLS 加固定来源 IP 限制。WireGuard 原建议已排除。
该内部测试跨地域计算补充已同步 ADR-0002/0006；实际链路、证书/代理、来源 ACL、4核8G 容量与恢复待验证。

在仓库外临时目录安装 Better Auth 1.7.7、COS SDK 3.0.0、SES SDK 4.1.271，
加载仓库当前 NestJS/Fastify、Drizzle 0.45.3/postgres-js，并使用隔离 PostgreSQL 17 容器和内存邮件桩。
实际通过9组认证/SDK检查：缺失/错误码、失败注册回滚、不同邮箱并发一码仅一个成功、
未验证邮箱拒绝登录、错误Origin拒绝、链接/配置期限、验证后安全cookie/会话、退出撤销以及SDK方法可用。
另通过本地合成证书4条mTLS检查；只证明隔离原型，不等于正式安全/业务验收或远端接入成功。
原型邮件回调在事务内，真实接入仍须验证提交后通知/去重/重试、令牌重放和全部故障时序。
容器及匿名卷已移除，临时网络服务已退出；未启动真实 Compose 基础设施、访问腾讯云私有资源或模型平台。
详情和源摘要记录在 `docs/architecture/CL-005/validation-record.md`，操作节点见
`docs/architecture/CL-005/deployment-and-service-readiness.md`。

用户指定后续 Docker Hub 镜像入口 `jjs7iczbx3i38wpthb.xuanyuan.run`，GHCR 入口
`jjs7iczbx3i38wpthb-ghcr.xuanyuan.run`。已更新 Compose、.env.example、README 和 AGENTS，
提供 `CANLEARN_DOCKERHUB_REGISTRY` 覆盖项；未改全局 daemon 或用户本地环境文件。
默认镜像路径及 docker.io 覆盖经 Compose 检查，镜像入口的 PostgreSQL manifest 读取成功，
其他镜像/标签未逐一拉取验证。用户另提供下载代理，按需只用于对应下载命令，不固化本地代理地址。

本轮 `pnpm check` 退出码0，模板生成脚本 Ruff lint/格式通过，HTML/Text/Base64 回解、
占位符、合成链接转义及连续重建六份输出字节一致检查通过。新增原型没有进入应用依赖或 CI，
未重跑构建；此前完整 `pnpm verify` 结果仍属前轮工程基线。
当前分支 `docs/cl-005-technical-decisions`，所有本轮成果仍未提交/推送，未关闭 CL-005 或其他卡。
除用户要求的镜像入口外，未改业务代码、API、事件、迁移或实际部署配置；先前修改均保留。

## 本地提交与 SES 审核交接（2026-10-12，当前最新）

用户报告 SES 模板审核完成并提供邮箱验证 TemplateID **224682**、密码找回 **224683**。
已同步模板交接记录、ADR-0003 与 CL-005 入口；SES 发送地域、审核正文版本与真实送达仍待补，
没有将用户报告写成独立控制台/API 查询结果，也未发送实际邮件。

按用户“先把现有内容本地提交，再开始下一步”的要求，在
`docs/cl-005-technical-decisions` 完成 `ca629c7`（项目镜像入口）与 `0e3a8cf`
（CL-005 ADR、核验记录、模板与审核交接）两个提交；本记忆另作同步提交。
提交前文档/链接及差异检查通过，提交钩子 Biome/Ruff/commitlint 通过。
业务代码未改变，沿用上一轮 `pnpm check` 和模板/隔离验证结果，没有为状态记录重跑代码门禁。
本次仅本地提交，不推送、不关闭 CL-005。提交完成后继续 CL-005b 的检索/embedding 选型。

## 本地提交后继续 CL-005b（2026-10-12，当前最新）

本轮现有成果已本地提交为 `ca629c7`（镜像入口）、`0e3a8cf`（CL-005设计/核验/模板）
和 `2953565`（记忆），提交后工作区曾干净。未推送。
随后按用户要求继续检索/embedding：用户确认本地多语言优先，接受10人以内、每人5份
20–100页的测算场景，并增加300页大内容观察，不要求解析必定成功。这些不是已冻结上传额度。

新增 `docs/architecture/CL-005/retrieval/` 的设计记录、可复现原型与结果、300页生成脚本/夹具/manifest。
按用户镜像入口实际拉取 `pgvector/pgvector:0.8.7-pg17`，摘要
`sha256:ac08538c6f8b9904c33c8224c5e5706dbe760aca29db1d096972b4052c22a75d`，
在独立回环数据库验证 PostgreSQL17.11＋pgvector0.8.7＋jieba0.42.1。
10项范围/版本/质量/用途/发布索引代过滤、越域、中文分词、删除/重建和事务上下文检查通过，
使用人工3维向量，只证明原型控制，不证明模型语义质量、业务隔离或性能。
主 Compose PostgreSQL 镜像、应用依赖/schema 未改变；不假定原 postgres 镜像已具备 pgvector。

实际读取 BGE-M3 与 multilingual-e5-small 模型卡及仓库 metadata；登记评估候选revision
`5617a9f61b028005a4858fdac845db406aefb181` 与 `614241f622f53c4eeff9890bdc4f31cfecc418b3`。
模型卡 MIT 标签不替代权重/依赖许可核验。当前环境无可用GPU，未下载权重/运行模型，
没有捏造召回/延迟/显存或 MinerU 解析成功。本地GPU候选将与解析排队，实时查询路径亦须测延迟。

300页PDF为原创简单中英文单列重复版式，431347字节、逐页唯一锚点和中文提取已核验，
连续重建字节一致；不是复杂教材/扫描件基准，manifest明确未执行MinerU且解析成功非必达条件。
取消/超时/缺页可见、资源有界、结果不复活等硬控制仍要求后续真实执行验证。
生成脚本固定ReportLab4.4.4/pypdf6.1.1，字体许可/NOTICE沿用既有合法夹具记录并随文件保留。
本次后续工件留在未提交工作区，未关闭Issue、未推送或修改实际基础设施。

## CL-005b 远端GPU烟测（2026-10-12，当前最新）

用户要求继续并授权SSH访问宁波推理机。已连接并只读核验实际4070显存12282MiB、驱动595.84，
约31GiB系统内存、44逻辑CPU（不同于此前用户描述）；磁盘剩余约135GiB。
原有GPU约2494MiB占用保留，没有停止其他工作。凭据、SSH入口与私有网络地址未写入仓库。

在用户家目录独立 `canlearn-cl005-eval` 安装虚拟环境，固定torch2.8.0、CUDA12.8、
sentence-transformers5.1.2、transformers4.57.1，并下载既定两个模型revision；
仅临时下载命令启用用户代理，不固化密钥或代理，未系统级安装、改网络或部署服务。
新增可运行的 `eval_models.py`、`embedding-results.json` 与完整依赖快照，保存权重/Tokenizer/配置文件SHA。
8段原创资料、16个中英文查询，BGE-M3 Recall@1=15/16、E5=14/16，二者Recall@3=16/16。
独立进程复测BGE热单查询中位数31.984ms、峰值已分配2.13GiB；E5为14.046ms、0.45GiB。
首轮同进程模型残留干扰显存比较，已修正并按独立进程结果报告；不含公网网络/完整服务开销，
没有充分负载、多学科、长块/无答案、CPU/MinerU争用或300页真实解析/embedding验证。

建议BGE-M3为主候选、E5为轻量比較候选，不混用维度/模型代，也不以小样本冻结最终模型质量门。
真实模型烟测与数据库人工3维向量的权限控制原型分别记录，不能推定真实应用安全验收通过。
GPU评测进程已退出，占用恢复测试前水平；远端独立环境约6.7GiB和模型缓存约4.8GiB保留供后续复测。
300页夹具再次重建输出字节一致；本轮不自动提交/推送、未关闭Issue，不修改真实业务数据或应用依赖。

## CL-005b 成果本地提交收尾（2026-10-12，当前最新）

用户明确授权本地提交现有成果。本次提交范围为检索原型/结果、4070 embedding 烟测脚本与
依赖快照、300页原创夹具及许可证，以及 ADR-0004、CL-005 入口和本记忆的同步修改。
分支保持 `docs/cl-005-technical-decisions`；提交消息为
`docs(docs): record CL-005 retrieval probes and GPU embedding results`。
本段随成果提交，实际提交 SHA 以 Git 日志为准，不将提交前状态写成远端交付。

提交前本轮 `pnpm check` 退出码0；retrieval Python 的 Ruff lint/format、PDF/生成与评测脚本
SHA-256、四份相关 Markdown 本地链接和自有文本空白检查通过。
上游 FONT-NOTICE 原文空白保留，不作无例外空白检查通过声明。
没有重跑远端GPU/数据库原型或构建，既有实测结果仍按其原始测试范围解释。
仅本地提交，CL-005/#27 未验收关闭。下一步先补长块/批量和无答案测试，再按固定 MinerU
版本与独立环境核验GPU共用；正式质量真值由 CL-009 接续，之后收敛选型并推进模型网关边界。

## CL-005b 补测与 CL-005c 官方SDK/参数核验（2026-10-12，当前最新）

用户要求补长块/批量、无答案/干扰、MinerU共GPU，再收敛ADR并验证聚合Responses；
随后明确直接使用官方`openai` SDK，输出上限先4096再16,384，并比较temperature/effort。
当前仍在`docs/cl-005-technical-decisions`，承接本地`bf10df9`；本轮成果未提交/推送，未关闭Issue。
没有修改实际业务依赖/服务、API/事件/迁移或真实资料准入，不把探针当网关/调度已部署。

4070复用既有独立embedding环境，两个固定revision分别独立进程、float32评测：
BGE 512/1024/2048 token、batch4吞吐39.156/17.778/7.269块/秒，峰值已分配显存
2270.16/2366.22/2558.34 MiB；每档60次热短查询约26–27ms中位，非公网/完整服务延迟。
8个原答案段落＋8个干扰、16个有答案查询＋12个无答案：短文本两模型Top1均12/16、Top3均16/16；
有答案与无答案Top1分数区间重叠，不设上线余弦拒答阈值。E5两个2255 token输入仅尾部答案不同，
截断512后input IDs相同、cosine=1.0；长度预算必须包括特殊token和E5前缀。
内部推荐BGE-M3稠密1024维、512 token目标上限、batch4；1024只作不可拆语义对象例外候选，
重叠/正式质量/无答案规则交CL-009真实合法样本校准/留出集，不能用重复填充语料冻结质量。
详细脚本、排序/性能/文件SHA在`docs/architecture/CL-005/retrieval/`。

另建独立MinerU4.0.7环境，torch2.8.0/torchvision0.23.0/transformers5.19.0，不升级embedding环境。
固定源标签commit `175f031cbcded6b527ddb2045ccec460ffecfa26`，Basic/Torch模型下载核验通过，
实际HF revision `2b3afb86f4d23fa623f6b2f4b2279ed4ef93a89d`、15文件SHA和完整依赖快照已登记。
只运行本地Basic、显式全页/新输出目录、600秒截止与768 MiB余量停止；没有远端解析/VLM/辅助LLM。
300页串行/GPU10秒并发/GPU30秒并发/CPU30秒并发四次解析分别108.345/104.201/100.896/100.948秒，
均退出0且300锚点保留，无缺失/重复/越界；不是正文/公式质量或V1/取消/重启恢复验收。
串行查询约10秒到达，实测等待98.304秒；GPU短突发并发峰值整卡5884 MiB（含原有2494），
热查询约26ms；同模型BGE四线程CPU查询约105ms，解析期间约107ms。建议解析与文档embedding
先串行，实时查询独立有界排队/预算并继续验证同模型CPU路径，不能用E5查询BGE索引。
仅Basic/simple合成/短突发，不能外推Standard/VLM、南京4核8G或长期10人负载。
既有GPU服务未停止，结束GPU回到2494 MiB空闲；测试进程退出，临时回环下载转发和SSH连接已清理，
隔离环境/模型缓存保留复测。MinerU许可附加条件已读取/登记SHA，CL-010a权利签审仍待完成。
300页生成manifest改为仅描述生成及独立评测记录入口；两次重建PDF字节/SHA保持原值。

聚合只用原创资料：原始HTTP10次（256上限历史对照）、官方Python SDK2.54.0七次（4096），
随后16K参数38次，共55次，自动重试均0。SDK直接读取DeepSeek非流式缺`message.status`的文本，
此前拒收来自原型更严格的消息校验，已修正解读；DeepSeek非流式/结构化/流式均通过简单合成检查。
GLM4096流式可用，非流式completed但只有reasoning；16K另测low/high非流式仍无最终答案。
两个不存在的模型负例均HTTP503，SDK分类InternalServerError；没有自动重试/供应商降级。
16K矩阵为temperature0/0.7/1.0×effort low/medium/high，每模型每组合两次流式，固定随机次序；
原创版本/审核过滤/算术JSON真值下DeepSeek17/18、GLM1/18，GLM两次120秒期限后费用/停止未知。
未通过JSON的字段不能解释为已证实算术错误。所有已回执对象未回显temperature/effort/输出上限，
上游参数实际应用未核验；样本最高已报告输出2293 token，不证明实际能完成16K输出。
继续内部比较的基线建议DeepSeek＋temperature0.7＋medium（本组2/2、中位3.574秒），不是正式最优结论。
实际模型回显带`-x`平台标签，法律主体、上游/固定版本/地域/留存/训练/分包/删除条件仍未核验，
真实资料路径保持禁用，`store:false`不能作为零留存证明。

用户报价人民币每百万token：DeepSeek输入0.25/输出0.88，GLM为5倍即1.25/4.40；缓存单价未知。
55请求中48有可用usage、35,193 token；已知可定价部分¥0.07574293，若缓存暂按普通输入计费
为¥0.07870418，两者都不包含7个未知用量（初版拒收丢失3、503两次、流式期限两次），实际扣款未知。
已修复拒收时丢失有效usage的原型问题，不反推旧请求费用；不按空答案/错误/超时记零。
SDK/HTTP原型未来输出上限默认16K，可显式重放旧额度；48项本地故障注入与缓存/推理计费检查已通过。
本轮`pnpm check`退出0：格式/lint/类型、原3项基线单测、OpenAPI与Compose配置通过；
docs下12份Python的Ruff lint/format、48项原型故障注入、76个本地Markdown链接、
评测/原型脚本SHA、矩阵38个/费用55个请求计数、夹具生成器/PDF摘要和凭据/私网入口排除检查通过。
`git diff --check`通过，未改原FONT-NOTICE。没有重跑应用构建或声明正式业务/SDK网关安全验收；
本轮代码仍在文档探针，不在真实API/worker业务路径，所有成果保持未提交。

## CL-005c GLM失败与MiniMax/Step补测（2026-10-13，当前最新）

用户明确要求把glm-5.3彻底标注失败，并以相同16K输出上限、temperature/effort比较
minimax-m3与step-5-preview。新增`model-gateway/selection-record.json`将GLM置为FAILED、
选型资格false、所有路径/备用排除；历史简单流式成功与失败证据保留，不重写结果，未再次调用GLM。
该结论限定当前聚合别名/配置/合成质量门，不能外推到GLM全家族。

新增`candidate_probe.py`直接复用原`parameter_probe.py`的固定PROMPT/Schema/真值/评估函数，
旧评估源码未修改；记录提示与三个脚本SHA。官方openai2.54.0、输出上限16384、store:false、
自动重试0、请求超时60秒/流式120秒检查；temperature0/0.7/1.0×effort low/medium/high，
每模型每组合两次流式，再各加low/high非流式，共40请求，固定随机种子5005。
全部完成且有合法usage，没有超时/HTTP错误；新两模型回显给定别名，不证明官方固定上游。

Step流式18/18完整通过严格JSON、四项真值、S1–S5来源集合和增量/最终一致性；
MiniMax四项数字18/18正确，但完整来源集合仅1/18，严格门禁也仅1/18。
不能把引用问题写成算术错误或更改来源要求提高通过率。两模型各两次非流式均completed，
只有reasoning无最终文本。Step仅保留流式合成候选，MiniMax本轮不选入候选/备用；
DeepSeek继续作为历史合成基线，未部署模型路由或实际网关。
Step继续比较可从temperature0/medium起步（2/2、总耗时中位6.220秒），high没有新增本轮真值收益，
部分输出/耗时更高；每格两次不能宣称最优或稳定学科质量。temperature/effort/输出上限均未回显，
上游参数实际应用未核验；最高已报告输出848token，未验证可实际完成16K输出。

用户新增人民币报价，沿用此前每百万token口径：MiniMax输入1.20/输出5.80/缓存命中0.24，
Step分别1.20/4.00/0.09。Decimal区分缓存、不重复计算推理费；40请求共25,922token，
按报价估算MiniMax¥0.05439600、Step¥0.02966000，合计¥0.08405600；不是实际账单。
新`candidate-cost-results.json`单列此轮，旧55请求/7个未知用量与旧费用工件保持不变。
完整矩阵/非流式/费用见`docs/architecture/CL-005/model-gateway/candidate-evaluation.md`与
`candidate-results.json`；已同步ADR-0005和CL-005入口，真实资料处理条件与CL-009质量验证仍待补。
本轮`pnpm check`退出0；新探针Ruff lint/format通过，离线核验40次组合与汇总、旧提示/源码SHA、
Decimal费用、FAILED别名在创建客户端前拒绝、MockTransport中SDK实际发送参数均通过。
83个本地Markdown链接、20份文本的密钥/私网入口模式排除及`git diff --check`通过。
核验没有新增平台请求，未重跑应用构建或把3项工程基线单测解释为业务网关验收。
本轮保持分支`docs/cl-005-technical-decisions`、承接`bf10df9`，已有未提交修改全部保留；
没有提交/推送、远端Issue操作、业务依赖/契约/迁移变更或真实资料调用。

## CL-005收敛、CL-006设计与CL-009准备（2026-10-13，当前最新）

用户明确授权按上轮规划继续并完成全部可执行工作：合成业务链核验、CL-005c/d选型交接、
CL-006a/b/c数据模型以及CL-009样本/真值准备。本轮不自动提交/推送或关闭Issue，
保留此前所有未提交修改；业务实现/部署与外部签审仍按证据区分。

新增官方SDK业务链探针，DeepSeek temperature0.7、Step0、effort medium、SSE、输出上限16384、
重试0、请求60秒/流式120秒检查；混合current/withdrawn来源、无答案和48题三场景，
生成→跨别名校验→至多一次修复→修复校验。每题本地整数与必要来源集合独立检查，
48题只是6种固定算术任务重复，不代表真实多学科质量；真正上游独立性未证明。
首轮24请求最终0/6链；同一Schema写进提示的对照20请求最终6/6，原失败完整保留。
DeepSeek三场景初稿过门禁，混合版本后注入Q01错误答案/撤回引用，另一别名与本地识别，修复通过。
Step三场景均用一次修复，无答案初稿JSON失败、48题初稿达120秒期限；不把修复通过当初次可用性。
复核发现format包含未显式提示的题干10–600字符本地规则；额外2请求把同规则写入提示，
Step生成/DeepSeek校验通过，无修复。没有改旧grade或统计，不将旧format全部归因模型Schema违规。

合计46新增平台请求，41合法usage、169,372token，最大已报告输出13,480token，
不证明能完成16K最终文本。5次未知用量为3次期限与2次主动关闭连接，上游停止/计费待对账。
已知定价部分¥0.22215464；DeepSeek缓存384token单价未知，若按普通输入报价则为¥0.22225064，
均未计入5次未知调用，不是实际账单。两轮和小对照共用¥5报价情景准入，组合预留情景¥2.15100411，
输入字节余量不是平台tokenizer/账单上限保证。此前95次/7个未知请求与费用工件保持原值。
当前合成比较建议DeepSeek生成＋Step流式校验、提示/本地规则一致、严格结构/版本/来源门禁、
每链至多4次与修复1次；GLM FAILED全路径排除、MiniMax暂不选入保持原决定。
完整证据见`docs/architecture/CL-005/model-gateway/business-chain-evaluation.md`及三轮结果/独立费用。
selection-record增加业务角色与模板规则，仍是R0建议，不是已部署网关/账本或真实资料准入。

新增`docs/architecture/CL-005/decision-closeout.md`汇总a/b/c/d结论、失败/退出、G01–G09责任与验收节点；
同步ADR-0005/0006。南京Web/API/DB/Temporal/CPU worker、宁波受限解析、TCP mTLS/来源限制保持已确认路线。
共享GPU执行器同时1个解析/文档embedding重任务，内部候选限额全局等待10/账户2，
实时同BGE CPU查询截止2秒/等待20是待CL-013负载验证的初始提案，未部署或宣称实测容量。
南京4核8G/真实mTLS/证书ACL/备份恢复/Temporal留存/供应商条款/账单与Q04均留明确责任及放行节点。

新增`docs/architecture/CL-006/`四份设计入口/文档、字段字典与ERD、版本/引用/用途交集、
更正/撤回/删除传播、API模块权威写入、Job步骤/费用/Outbox与迁移回退约束。
只提出schema增量演化，没有改现有jobs七状态、业务代码、契约或迁移文件。
13项纯内存合成设计场景通过，覆盖共享任务容量去重/冲突、私有公共分离、修订/删源晚到拒收、
依赖闭包/旧恢复水位；不能证明实际SQL锁/权限/物理删除/恢复通过。B非作者人工复核未补造。

新增`docs/benchmarks/CL-009/`准入/分层与逐页引用/双标仲裁协议、空白外部样本/人工标注台账、
登记与检查脚本。复用原位置6份原创PDF（含更正版）/5家族/310版本页，6份SHA/请求页声明/
生成器引用/家族切分检查通过，未复制原件或重跑MinerU。300页仅性能，另5小PDF为4家族/10版本页；
这些不等于真实120页质量基准或真人双标。外部合法样本实际0份/0页，目标12份/120页与真实扫描/
公式/表格/至少三其他学科、用途核权及人工标注仍由C与指定权利/学科责任人补。
已同步README、两份路线图和CL-005入口；设计与准备包可供评审，CL-005/006/009未综合验收关闭。
本轮`pnpm check`退出0；新增13项MockTransport故障检查、CL-006的13项纯内存设计场景、
CL-009的6份夹具完整性核验通过。模型网关及CL-006/009共15份Python Ruff lint/format通过，
三轮实测与汇总源码/结果SHA、计数/Decimal费用、175个本地Markdown链接/围栏、44份文本凭据/
私网入口模式排除、空白人工CSV和`git diff --check`通过。没有重跑业务构建、真实解析/部署或人工签审，
最后核验没有新增平台请求；所有本轮成果保持未提交，现有分支/未提交内容完整保留。

## CL-007通用REST契约与真实健康漂移门禁（2026-10-13，当前最新）

用户要求按规划继续；本轮完成CL-007a/b/c的可评审契约与工程门禁，正式人工评审仍待补。
新增`docs/api/CL-007/`通用约定、端点/接纳映射、漂移/增量准入规则、18个原创合成DTO正负例及核验记录。
按CL-005/006设计定义会话/验证邮箱、服务端空间/父子/用途授权、越域404、最小错误与可重试类别、
请求键作用域/同键异载荷、强ETag/If-Match/428/412、快照冲突409、分页与202/任务查询/部分可用。
这些业务规则为规划，没有把空间ID/客户端分数/模型completed当授权或事实。
HTTP条件/受理语义已读HTTPWG RFC9110、RFC6585与Nest官方测试/Swagger文档作为对照。

`contracts/openapi/canlearn.v1.yaml`扩写为28操作：GET /v1/health标implemented，其余27操作均
标planned/[规划]。覆盖文档上传/版本/页状态与纠错、parse-jobs、jobs查询/取消/显式重试、
exercise/explanation-jobs及获准结果、attempts/异步评分、plan-patches/确认/撤销、导出与单Range读取、
来源/引用/质量/错误/版本等33个schema。所有业务实际路由仍不存在，没有安装认证、模型或MinerU服务，
未新增业务DB表/迁移或改变jobs七状态。分页/题数/数组限制是初始契约提案，不是实测容量或已冻结上传额度。
鉴权原生入口、公共编辑/种子、目标/学科包完整CRUD与答案曝光的专门契约由相应功能卡后续补齐；
该稿是路线图关键接口，不宣称完整MVP API已定义/实现。

实际代码只抽出共享`apps/api/src/application.ts`供启动与测试复用，保留版本/校验/helmet/CORS配置；
运行时Swagger改为OpenAPI3.1.0并保持只来自已安装控制器。健康返回体保持service/status固定值，
Swagger补齐类型/必需字段/单值enum/additionalProperties:false、getHealth ID、无会话与implemented标记。
API devDependencies固定新增ajv8.20.0、ajv-formats3.0.1、yaml2.9.1，锁文件同步；不新增生产依赖。

新`health.contract.test.ts`用同一Nest/Fastify应用inject实际HTTP与/docs-json，没有监听端口。
实现集合与手写契约比较路径/方法/ID/security/响应码/200 JSON schema；错误响应字段、
schema变化、漏登记运行路由与误升级planned的负例会失败。27规划路由均实测404，
33 schema编译/18 DTO样例仅校验结构，不能当鉴权/幂等/取消/删除/评分已验证。
新增88检查通过：实际健康HTTP/Swagger2、响应字段负例4、漂移/路由/升级负例3、规划404共27、
schema编译33、DTO18、规划标记1；连同旧健康单测，API89项通过。
测试经现有pnpm check→API Vitest→CI pnpm verify入口接续，未改CI工作流或执行远端CI。
新业务端点需扩展非200/请求/媒体/权限/故障检查再升级implemented，当前比较器不冒充全接口覆盖。

完整`pnpm verify`退出0（格式/lint/类型、API89/Web1/Python1测试、Redocly、Compose配置、Web/API构建）。
另用已编译API复测健康HTTP200/JSON、运行时只列/v1/health与规划parse-jobs404；无DB/Temporal/模型/云调用。
核验记录`docs/api/CL-007/validation-record.json`登记实际编译响应、8份源/契约/锁/样例SHA与检查范围。
65本地Markdown链接/围栏、核验SHA/检查计数、9份新增文本密钥/私网入口模式排除、git diff --check通过。
README/CONTRIBUTING、CL-006入口及两份路线图同步；当前分支/所有既有未提交修改保留，未提交/推送/关闭Issue。
CL-005/006供应商/真实样本/人工复核条件继续保留；下一依赖为CL-008任务状态机、Outbox/幂等及取消删除原子接纳。

## 分批提交与推送授权（2026-10-13，提交后快照）

用户本轮明确要求分批提交、推送及处理相关Issue状态，然后继续CL-008；
该次明确授权优先于此前“不自动提交/推送”的默认约束，没有授权合并main或代替非作者/外部签审。
现有成果已分五批本地提交：9070a60（检索/GPU补测及此前记忆快照）、4414a48（模型网关与CL-005）、
65fb673（CL-006模型）、0cc26ef（CL-009准备）、16ceaf0（CL-007契约/漂移门禁及入口）。
提交钩子的Biome/Ruff/Redocly/commitlint通过；74份待提交文本凭据/私网入口模式检查通过，
严格包版本行按版本而非IPv4判定；各实测/契约源SHA在钩子后保持一致。
本段另作记忆提交；推送/草稿PR与Issue实际结果随后核验，不将本地提交写成远端交付。
已实际读取#5/#6/#7/#9及对应子卡与评论，四组暂无验收/人工审核评论，相关子卡均要求
“实际负责人、非作者审核人和验收人确认；外部权利/教学签审不可自签”。
计划按现有证据更新待审核/阻断状态和可访问工件，不擅自记为综合验收完成或关闭。

## PR/Issue交付核验与CL-008设计门禁（2026-10-13，当前最新）

此前五主题＋记忆已推送`origin/docs/cl-005-technical-decisions`，远端与本地
`fa0b11373720bcebcb1b1631e8e6573a6100af23`一致，推送完整`pnpm verify`通过。
创建[草稿PR #55](https://github.com/cn-ryh/canlearn-v2/pull/55)，base为已推送但未合main的
`docs/cl-004-data-governance`，避免重复混入CL-004成果；未向main合并。
该SHA的GitHub [CI verify](https://github.com/cn-ryh/canlearn-v2/actions/runs/38422860670)实际SUCCESS。
任务附件工具已调用但未返回确认；不将此写成附件已绑定，PR本身已独立查询确认存在。

已逐卡读取最新正文、保留现有标签/内容并补固定提交工件/PR/验证评论：
CL-005/006/007的父子13卡（#5/#6/#7/#26–#35）标`status:needs-review`；
CL-009四卡（#9/#39–#41）标`status:blocked`，外部合法样本0份/0页、真实双标0。
只勾已交付证据/PR项，非作者/验收项未勾；CL-009实际样本产出项未勾。
CL-008 #8/#36–#38启动时标`status:in-progress`。重查54卡：仅CL-004四卡CLOSED，其余50OPEN。
用户本轮授权状态处理，不等同豁免各卡非作者及外部签审条件，没有自动关闭或假指派B/C/D。

随后交付`docs/workflow/CL-008/`a/b/c：七状态转换/不可变终态，PARTIAL_READY为有界尝试结束的
合格子范围、全blank可解析成功但学习可用0，快照/请求作用域/业务与Temporal/上游ID映射；
API步骤/预算准入与取消删除/晚到候选门禁、未知调用/费用和中央GPU停止确认分别对账。
终态后usage可去重更新，取消前合格部分按当前权限可读，删源后全部拒读且历史终态不改。
Outbox与DB消费效果同事务；外部Temporal启动/信号无法和业务DB原子提交，固定ID/派发意图/回执对账。
四类planned事件Schema、7正例/19负例及封闭v1升级规则，未引入通用总线或真实producer/consumer。
34个可执行纯内存故障设计场景覆盖重传/重启/索引丢失/部分页/永久错误/版本与用途撤销/
取消删除晚到/旧备份隔离/事件重放/冲突usage/GPU租约/审核期限/事务回滚，附下游执行卡映射。
这些不是实际SQL并发、Temporal故障恢复、外部恰好一次收费、物理停止/清理或真实备份恢复证据。

事件门禁进入现有API Vitest（新增33项），参考模型回归进入workflow pytest（新增35项含源SHA/归档一致性）。
最终完整`pnpm verify`退出0：API122/Web1/Python36，静态/类型、Redocly、Compose配置与API/Web构建。
文档模型额外Ruff lint/format通过；源/夹具与结果SHA见`docs/workflow/CL-008/validation-record.json`。
README/CONTRIBUTING、CL-006/007及两路线图同步；现有业务仍只有健康API/HealthCheckWorkflow、jobs骨架，
未改业务schema/迁移、OpenAPI操作实现标记、生产依赖或实际运行环境，未新增GPU/平台/云调用。
首次CL-008推送被源SHA回归拦下：归档前的Ruff上下文与根目录提交钩子不同，格式调整导致旧摘要。
已统一按根目录钩子格式重建源/结果摘要并修正尚未推送提交，门禁未绕过，实际推送随后重验。
CL-008待非作者评审；新成果的提交/推送/Issue转待评审结果随后核验。
下一可独立执行CL-013a合成最小Job纵向链路，真实解析质量仍由CL-009/010合法样本与审核条件约束。

## CL-008推送与Issue状态收尾（2026-10-14，当前最新）

CL-008独立提交`d4a9056a0e7cdcae5cebdbb3329feac548d3c0a4`已推送并经GitHub branch ref与本地HEAD核对。
摘要门禁发现提交钩子格式上下文差异后已重建修正；未绕过检查。最终推送完整pnpm verify通过
（API122/Web1/Python36与静态/类型、契约、Compose、构建），[远端CI](https://github.com/cn-ryh/canlearn-v2/actions/runs/38426857590)
实际SUCCESS。SSH等待期间使用现有认证作单次HTTPS操作，未改全局Git配置、原远端或主机设置。
[PR #55](https://github.com/cn-ryh/canlearn-v2/pull/55)仍为草稿，标题/说明已按CL-005～008/009准备最终范围更新；
旧gh pr edit遇到Projects classic查询不兼容，已用认证REST PATCH成功更新并重查，不升级CLI或请求新权限。

CL-008 #8/#36–#38已补固定提交/核验/PR评论并由in-progress转needs-review。
重查54卡：CL-005～008父子17卡needs-review，CL-009四卡blocked；仅此前CL-004四卡Closed，其余50Open。
相关子卡只勾已交付证据/PR项，非作者/验收项仍未勾；没有自动关闭、合并main或补造人工签审。
公开逐卡评论和提交证据集中在`docs/delivery/2026-10-14-r0-contract-delivery.md`。
本轮代码/契约成果已交付，真实业务/SQL/Temporal/物理清理与恢复仍待CL-013及相应实现卡；
下一可独立推进CL-013a合成最小Job纵向链路，CL-009真实样本/双标和供应商条件保持原阻断面。
本段与交付记录另作收尾提交；远端最新HEAD随后核验，不将提交前记忆写成该提交已推送。

## CL-013a 合成 Job 实施与本地验收（2026-10-14，当前最新）

用户确认本轮规划，授权实施、分批提交/推送至既有草稿PR #55、更新证据/Issue状态并等待最新CI。
未授权合并main或豁免非作者/外部验收条件；开工工作区干净，基线ec72dc8。

已实现默认关闭的Web→API→PostgreSQL Job/Outbox→Temporal→Python worker→API接纳回执→Web查询。
合成入口使用固定原创三页状态夹具，API启用时强制回环监听，内部回执需随机服务token，
Web代理限制同源与固定本机路由且不传内部凭据。生产会话/资料授权、MinerU、模型/GPU/云路径未接入。
独立canlearn.smoke.v1.json覆盖三条真实合成操作；生产27条规划接口仍planned。
新增smoke_jobs/smoke_outbox增量迁移，既有jobs七状态不改；WAITING_REVIEW保留设计，未实现审校。
固定workflow ID/快照、请求键与回执去重、取消epoch、终态/结果/Outbox同事务、lease及启动ACK对账已落实。
生产四类事件保持planned，其中三类已有本地合成producer/dispatcher与实际持久Schema证据；失效/删除未实现。

本地完整pnpm verify退出0：API138/Web9/Python43，格式/lint/类型、两份OpenAPI、Compose及API/Web构建。
31项真实集成检查退出0，另以空隔离卷再次从迁移开始验证同31项：并发同键、异载荷、四种页结果、
取消/停止/晚到、worker SIGKILL/heartbeat重试、实际history重放、API重启、启动ACK丢失/过期claim、
SQL故障同事务回滚、接纳与取消实际并发、全栈停止重启、19个持久事件与唯一受理。均只针对免费合成模拟。
7项Chromium真实按钮/轮询/取消/刷新/移动端无横向溢出检查通过；截图只含合成引用，Playwright1.56.1位于仓库外。
复现手册/范围/回退见docs/integration/CL-013a，验证记录含源码摘要、Job/trace ID和镜像摘要。

首次实际启动定位并修复Temporal同名角色导致跳过建库、CLI健康检查错误目的地；保持账号分离，
DBNAME现为canlearn_temporal/visibility独立库。首次运行修复SDK Run ID为UUID v7但回执仅接受v4、
workflow sandbox导入HTTPX，以及Next规范化URL导致同源检查误拒和空取消请求错误JSON Content-Type。
所有失败后完成复验，不跳过门禁。CL-008执行映射CL-013a/b/c纠正为#50/#51/#52。

自动集成接入CI中pnpm verify后的同一smoke:test；真实远端结果待本轮推送后核验，不以本地结果代替。
本轮不宣称生产鉴权、完整Inbox/admission/预算/供应商恰好一次、GPU停止、物理删除、旧备份恢复或R0放行。
非作者审核/真实样本双标仍待补。合成环境由独立canlearn-cl013项目管理；测试结束自动停止本轮进程/容器，
主项目和用户.env/daemon/远端主机均未修改。成果本地已可供评审，提交/推送/Issue实际状态随后核验。

## 定位与依据

CanLearn 是面向自主学习者的资料驱动学习平台。当前产品规划入口是
`docs/CanLearn_Product_Plan_v2.1.tex`；V2.0 文档仍保留。
协作分工见 `docs/CanLearn_V2.1_四人团队协作与任务分配方案.md`。
架构依据为 `docs/architecture/ADR-0001-technology-stack.md` 和
`docs/architecture/ADR-0002-repository-and-deployment-topology.md`。

## 已实现的工程基线

- 单一 Git monorepo，各应用独立构建和部署。
- `apps/web`：Next.js/React/TypeScript，基线首页及默认关闭的CL-013a合成验证页/固定API代理。
- `apps/api`：NestJS/Fastify/TypeScript，已注册健康接口 `GET /v1/health`，Swagger UI 为 `/docs`。
- Drizzle/PostgreSQL：已有 `jobs` 表及初始 SQL 迁移；任务状态枚举包含 QUEUED、RUNNING、WAITING_REVIEW、PARTIAL_READY、SUCCEEDED、FAILED、CANCELLED。存在表结构不等于任务 API 已实现。
- `apps/workflow`：Python/Temporal worker、HealthCheckWorkflow；显式启用时注册合成Job workflow/activity及独立Outbox dispatcher。
- `compose.yaml`：PostgreSQL、Redis、Temporal、Temporal UI 的本地配置。
- 生产OpenAPI为健康接口及27个planned业务提案；默认运行时仅健康，CL-013a启用后另有独立本地合成契约。四类生产事件planned，其中三类已有合成Outbox/dispatcher验证，资源失效未实现。
- 已配置 Biome、Ruff、mypy、TypeScript、Vitest、pytest、Redocly、GitHub Actions 与 Husky 门禁。
- 尚无资料上传、MinerU Adapter、真实解析流程、鉴权或学习业务闭环；不要将产品文档、数据库枚举和健康烟测当作已交付功能。

## 架构与工作约束

- 主 API 负责业务权限、状态、配额和权威写入；Python worker 不绕过这些门禁。
- PostgreSQL 保存业务事实；Redis 保存可重建状态、缓存与短期协调信息。
- 前端只访问 CanLearn API，不直连数据库、Redis 或 MinerU。
- MinerU 是外部独立微服务，通过 Adapter 接入；默认 Compose 不启动它。
- 长任务使用异步任务资源；领域事件计划通过 PostgreSQL Outbox 发布，目前未实现。
- API、事件、数据库迁移、环境变量和部署配置变化须同步更新对应文档与契约。
- 提交规则与检查以 `CONTRIBUTING.md` 为准，使用 Conventional Commits。

## 规划与下一步

路线图入口：`docs/roadmap/CanLearn_V2.1_Issue_Backlog.md`；R0 具体拆分：
`docs/roadmap/CanLearn_V2.1_R0_Issue_Split.md`。
阶段为 R0 定义/基准 → R1A 资料闭环 → R1B 学习 MVP → R2 受邀 Beta → R3A 稳定性，之后按证据决定付费与扩展。

本地 R0 文档将 #1–#14 映射为 14 个父 Issue，#15–#54 映射为 40 个原生子 Issue。
2026-10-03 已通过 GitHub 查询确认 #1–#54 全部存在、Open、未指派负责人，全部归属 R0 里程碑；本次未逐一复核原生父子关联。
R0 重点是范围、合法样本、权限/生命周期、技术决策、数据/API/任务契约、解析评测与可复现纵向烟测。
现有骨架无需重建，进入下一阶段须有验收证据。
身份、对象存储、检索/向量方案、生产平台与模型供应商等仍列为待决事项，不能将本地配置当作生产决策。

2026-10-03 整理 CL-001（#1）与子项 CL-001a/b/c（#15–#17）：产出放在
`docs/product/CL-001-mvp-scope-and-release.md` 和三个对应子项文档中。用户已确认
MVP 首发范围按完整 P0 能力基线冻结，按 R1A/R1B 分阶段交付；单章节闭环仅是早期切片。
用户也确认责任表先使用 A/B/C/D 等角色占位并明确阻断项。实际成员映射、外部权利/法律
和学科审校人仍待指派和签署，旅程也未经过真人验收；因此 CL-001 尚未完成综合验收，
远端 Issue 未关闭或更新。本次为文档交付，没有改业务代码；`git diff --check` 通过，
没有重跑代码测试。

2026-10-03 新建并切换到 `docs/cl-002-user-research`，继续 CL-002（#2）及子项
#18–#20。用户确认目前没有可提供的真实试访记录，本次先准备可执行访谈包。
入口为 `docs/research/CL-002/README.md`；包含招募/同意流程、统一访谈与礼宾脚本、
空白会话及 CSV 台账、未验证假设和探索报告结构。建议目标为三组各约 12 人，其他组
至少三个学科；当前包中可复核的真实会话为 0，CL-002c 未完成，不能虚构访谈结论。
已在 `.gitignore` 添加 `/research-private/`，完成的私下记录/联系方式/同意凭据只放
在受控的私下存储中，仓库保留空白模板。正式招募前须填写实际联系人和数据处理安排。
此前 CL-001、路线图与记忆文件的未提交变更仍保留；本次未提交/推送或修改远端 Issue。

2026-10-03 新建并切换到 `docs/cl-003-competitor-benchmark`，继续 CL-003（#3）
及子项 #21/#22。入口为 `docs/research/CL-003/README.md`。新增四份两页原创合成
PDF（中文双栏栈、含算术错误的物理公式、英文阅读、故意缺原页41的经济学）和一份
纠错 v2、固定版本的可重建脚本、SHA/页数/区域 manifest、字体版权许可、固定问题与
截止日、盲评规则和空白会话/评分表。仅为小型烟测素材，CL-009a 来源准入和 C 复核
仍待完成，不替代真实解析基准。脚本经 Ruff 检查，PDF 页数/中英文提取和算术修订已验证，
预览检查双栏及英文版式；最终版本连续重建得到相同 PDF 哈希，所有段落锚点、页码与
区域边界已检查，Markdown 本地链接和空白 CSV 表头检查通过。
官方 StudyFetch/RemNote/Knowt 页面初筛另列，尚未获得登录后统一任务输出；CL-003b
未满足实测验收，不能从官网描述推断竞品缺失能力。尚未注册/购买/上传或改远端 Issue。

2026-10-12 修复 CL-003 生成文件格式：`build_fixtures.py` 在写入 manifest 前调用
仓库已安装的 Biome，使用根目录配置；缺 Biome 时在生成文件前提示安装依赖。
README 同步补充 `pnpm install --frozen-lockfile` 前置步骤。连续两次重建（含一次
从 `/tmp` 调用）得到相同的 PDF/manifest 字节；5 份 PDF 哈希与修复前一致，
manifest 的语义字段只有 `generator_sha256` 随脚本更新。完整 `pnpm verify` 通过。

同日核对工作顺序：按 R0 子项拆分，CL-004a 依赖 CL-001a 的范围输入，当前已确认的
完整 P0 范围足以开始数据目录与数据流草案；不依赖 CL-002c 的真实访谈或 CL-003b 的
竞品实测，也无需等待 CL-001 父卡关闭。CL-004b 在 a 的输入具备后开展，c 依赖 a/b。
真实访谈和竞品实测仍是对应 R0 研究卡的验收证据，可与设计工作并行；业务 E2E 与
学习效果验证按功能交付和阶段要求收集。外部签审、正式验收和阶段放行的缺口仍保留。
本次只核对 CL-004 的开工条件，未新增 CL-004 工件或宣称该卡已完成。

同日用户要求先规划 CL-004 整个部分，**确认后再开工**。计划已保存到
`docs/plans/CL-004-implementation-plan.md`，状态为待用户确认；覆盖 a 的数据目录/
生命周期、b 的权限/素材用途/供应商矩阵、c 的威胁与验证方案，以及综合评审和
后续实现卡映射。建议按原 R0 边界交付四份设计/评审文档，候选技术与具体期限
继续列待决项；正式业务代码由原后续卡接续。本轮仅新增计划并更新记忆，
没有创建 `docs/security/CL-004/` 实际工件、修改代码/契约/迁移、切换分支或更新远端。
在用户确认前不开展 CL-004 实施；这次规划不代表子项完成或验收放行。

随后用户确认按计划实施，并明确授权细分任务和 subagent 并行工作。
2026-10-12 新建并切换到 `docs/cl-004-data-governance`，保留全部此前未提交修改。
交付 [CL-004 设计包](security/CL-004/README.md) 的入口及 a/b/c 三份文档：
23 类资产及逐资产保留/删除/导出映射、API 权威接纳的数据流、权限/用途与供应商矩阵、
12 条威胁及后续验证规格；包含 7 个生命周期和 14 个权限合成纸面场景。
本地拆为 12 个小任务，三位 subagent 分别编写 a/b/c，root 汇总后进行文档交叉检查；
并行初稿最终依照 a→b、a/b→c 的输入依赖核对，没有将 agent 检查当作真实成员签审。
已统一历史回跳与新生成资格、VLU 与强诊断、合法缓存与日志/Temporal 原文禁止、
付费步骤准入及晚到接纳的原子协调、事件/Outbox 副本和凭据/备份清理边界。
计划确认记录和两份路线图已更新入口；Q01–Q09 的具体人员、期限、方案、用途和外部条件
仍待决定或核验。正式评审、外部权利/隐私/学科签审、真实业务/安全/恢复验证未完成，
CL-004 父项与子项未被自动关闭，R0 未宣布放行。未改业务代码、契约、迁移或环境变量，
没有提交、推送或修改 GitHub 数据；本轮未重新查询远端，远端快照仍为此前只读查询结果。

2026-10-12 用户人工审阅 CL-004 全部设计工件并以“任宇航”署名，确认可发布为 R0 设计工件。
该确认已记录在 `docs/security/CL-004/README.md`，发布范围是文档工件本身；不替代非作者正式评审、
外部权利/隐私/学科签审、真实安全/E2E/恢复验证，也不构成真实资料接入、公共发布或 R0→R1A 放行。
CL-004 的 Q01–Q09、正式验收和下游运行证据继续待补；本次仅更新文档状态与记忆，未提交、推送、
关闭远端 Issue 或修改业务代码、契约、迁移和环境变量。

2026-10-12 再次核对 CL-004 完成情况：本地四份设计工件和人工审阅记录已存在，
结论仍为“设计交付完成、获准作为 R0 设计工件发布；正式评审及综合验收未完成”。
只读查询 GitHub #4/#23/#24/#25，四卡均 Open、无 assignee；父卡无评论，
远端关闭条件仍要求实际负责人、非作者审核及综合评审/风险处理/签审记录。
Q01–Q09 继续按各自节点处理；下游业务安全/E2E/恢复验证不应全部前移为本轮
设计编制的完成条件，也不能因设计交付而宣称这些验证通过。
复核 API 模块、数据库 schema 和 workflow 仍为健康接口、jobs 表及健康工作流骨架。
当前分支仍为 `docs/cl-004-data-governance`，HEAD `82e863f`，39 个未跟踪文件，
既有改动保留；`git diff --check` 通过。本次未重跑完整代码门禁，未提交、推送或修改远端。

2026-10-12 用户明确 A 即任宇航，其他成员暂不考虑姓名，继续使用 B/C/D 等代号。
已同步 CL-004 入口的职责说明、Q01 和实施计划的角色约定。此确认只更新人员映射，
不新增正式评审/外部签审结论；其余姓名暂缺不阻断设计与选型。Q01 部分明确，
Q02–Q09 仍按后续任务节点决策，不要求现在一次性解决。

## 本次验证结果（2026-10-12）

- 最新 `pnpm verify`：退出码 0，格式、lint、类型检查、单测、OpenAPI 校验、
  Compose 配置校验及 API/Web 构建全部通过。
- 同日首次状态检查曾在 `biome format .` 因 CL-003 manifest 数组换行失败；
  后续按用户要求修复生成脚本及输出，以上通过结果来自修复后的完整门禁。
- 后续 CL-004 规划仅验证本地 Markdown 链接和文档空白/差异，未重跑代码测试。
  规划不改变此前代码验证结论，也未提供新的业务或安全验收证据。
- CL-004 实施为纯设计文档交付：本地链接、围栏/尾空白、资产/场景/Q 编号和后续
  路线图引用检查通过；root 与三个 agent 完成文档一致性核对及合成纸面推演。
  `git diff --check` 通过，没有重新运行 `pnpm verify` 或真正执行安全夹具/业务请求。
  最新代码门禁通过结果仍来自前述 CL-003 格式修复，不能用作 CL-004 安全或权利验收。
- 单测共 3 项：Web 1、API 1、Python activity 1；覆盖的是工程基线，不是业务或端到端验收。
- CL-003 生成脚本的 Ruff lint/格式检查通过；重建前后确认 5 份 PDF 的 SHA-256
  及生成脚本 SHA-256 与 manifest 一致，连续两次重建输出一致，PDF 字节保持不变。
  CL-002/CL-003 的 5 份 CSV 模板均只有表头、0 条数据行；结合研究报告和入口文档，
  仓库内仍无可复核的真实访谈或登录后竞品实测证据，不断言仓库外活动情况。
- 构建产物在临时空闲端口启动后，API `/v1/health` 返回 HTTP 200 和准确的健康响应，
  `/docs` 与 `/docs-json` 返回 HTTP 200；运行时 Swagger 仅含 `/v1/health`。
  Web 首页返回 HTTP 200 并包含项目基线标识。所有本次启动的临时进程已停止；
  这不是上传、解析或学习闭环的 E2E。
- 当前工具版本：Node.js 24.21.0、pnpm 12.4.2、uv 0.12.15；pytest 使用 Python 3.12.3。
- Docker socket 本次可访问（Docker 29.1.3、Compose 2.40.3）；
  `docker compose ps --all` 无 CanLearn 容器。默认 3000/3001 端口已有监听，
  但首页响应不含 CanLearn 基线标识、`/v1/health` 返回 404，不能据此确认本项目已启动。
  本次未启动基础设施、执行数据库迁移、验证 Temporal 连通性、接入 MinerU 或跑业务 E2E。

## Git 快照（2026-10-12）

- 当前工作分支 `docs/cl-004-data-governance`，从 CL-003 工作分支新建；HEAD 仍为 `82e863f`（`chore(repo): merge remote repository history`），此前未提交修改保留。
- origin：`git@github.com:cn-ryh/canlearn-v2.git`。
- `git ls-remote --heads origin` 确认远端只有 `main`，其 SHA 与本地 HEAD 相同；
  此前状态检查未 fetch；CL-004 实施只新建本地工作分支，没有提交或推送。
- 开始检查时 `.gitignore` 有 3 行未提交修改；`AGENTS.md`、本记忆、
  `docs/product/`、`docs/research/` 和 `docs/roadmap/` 共 34 个文件未跟踪。
  这些已有改动均保留；状态检查更新记忆，后续格式修复修改 CL-003 脚本、
  README、manifest，并同步记忆；CL-004 规划新增计划，实施新增四份设计文档，
  两份既有路线图更新入口，未跟踪文件共 39 个。
  `git diff --check` 通过。

## GitHub 远端快照（2026-10-12）

查询来源：`git ls-remote --heads origin`、`gh repo view`、GitHub branches/milestones/releases API、`gh run list`、`gh issue list` 和 `gh pr list`。

- 仓库：<https://github.com/cn-ryh/canlearn-v2>，Public，未归档；默认分支 `main`。
- 远端分支列表只有 `main`，SHA 为 `82e863f079935e8925b674c5c6d3c21909a12c91`；分支 API 返回 `protected: false`。
- 最近代码推送时间：2026-09-30 14:35:50 UTC。
- 当前 HEAD 的 CI 已完成并成功，创建于 2026-09-30 14:35:57 UTC：[CI 运行记录](https://github.com/cn-ryh/canlearn-v2/actions/runs/36730325893)。同一 HEAD 的 Dependency Graph 运行也成功；查询返回的两条运行均已完成，没有运行中的记录。
- Issue 总数 54（#1–#54），全部 Open，无负责人；本次查询无 Closed Issue。
- 里程碑 `R0 · 定义与基准` 为 Open，54 个未关闭、0 个已关闭，没有截止日期。
- PR 列表（所有状态）为空；Release 列表为空。路线图尚未体现在已关闭 Issue 或合并 PR 中。
- 本地产品/研究/路线图工件及记忆尚未提交、推送；远端检查没有修改 Issue、分支设置或其他 GitHub 数据。
- 相比 2026-10-03 快照，远端 HEAD、Issue 完成与指派状态、里程碑、PR、Release 和 CI
  查询结果未发生变化；没有复核每一项 Issue 的原生父子关联。
- 以上为查询时状态；后续开始相关任务时应重新检查，尤其是负责人、Issue 完成情况和 CI。

## 常用命令

- 安装：`pnpm install --frozen-lockfile`；在 `apps/workflow` 执行 `uv sync --frozen`。
- 本地准备：复制 `.env.example` 为 `.env`，`pnpm infra:up`，`pnpm --filter @canlearn/api db:migrate`。
- 启动：`pnpm dev`；Web 3000、API 3001、Temporal UI 8080。
- 质量门禁：`pnpm check`；构建：`pnpm build`；完整验证：`pnpm verify`。
