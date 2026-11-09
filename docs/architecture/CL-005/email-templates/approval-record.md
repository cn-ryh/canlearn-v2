# SES 模板审核交接记录

2026-10-12 · 来源：A（任宇航）在本次会话说明“模板已经审核”。

据此登记为用户报告审核完成；用户随后提供两个用途的 TemplateID。
尚未独立读取 SES 控制台或 API，发送地域及审核正文版本待补；不将模板审核报告当真实发送或送达成功。

| 用途 | 本地模板名 | 审核信息 | TemplateID | SES 发送地域 |
| --- | --- | --- | --- | --- |
| 邮箱验证 | canlearn_email_verification_v1 | 用户报告已审核，提供对应 ID；正文版本待对照 | 224682 | 待提供 |
| 密码重置 | canlearn_password_reset_v1 | 用户报告已审核，提供对应 ID；正文版本待对照 | 224683 | 待提供 |

发件地址：`canlearn@no-reply.hangxiaonet.com`；站点：`https://cl.hangxiaonet.com`。
本次提交的本地 v1 正文 SHA-256 如下，后续与审核正文核对，不推定控制台内容字节相同：

| 文件 | SHA-256 |
| --- | --- |
| email-verification.html | 4de337269ec567ca0fbd0fc768104cc99de10764c640ca9398ca381d276cac08 |
| email-verification.txt | b9f0b0fc272ba8fafcfeb2fb4f982bfb20c50cc642018aa8449bee270fd0fa55 |
| password-reset.html | 8377f0f1474c2fceae8eb5718925c6841a93deb8e7d6fc1741b02c721cf04c6a |
| password-reset.txt | 6884c82727832d5e89fca4ab84e5a5f07855a2bfaf6d62f70d6e1f8152a1a00e |

待 A 登记实际配置，B 在正式接入时核对变量、Subject、审核版本和发件身份，
C/D 配合获准收件人的送达及链接路径验证。真实发送需明确获准的测试收件人和发送范围。
