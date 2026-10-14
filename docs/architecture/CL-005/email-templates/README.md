# CanLearn · SES 账户邮件模板

2026-10-12 · **任宇航报告 SES 模板已审核；邮箱验证 ID 224682、密码重置 ID 224683 已登记，发送地域及真实发送待核验。**

用户确认：站点 `https://cl.hangxiaonet.com` 已备案、可配置 DNS，
SES 发件域名 `no-reply.hangxiaonet.com`，发件地址 `canlearn@no-reply.hangxiaonet.com`。
企业资质已有；本次用户已报告模板审核完成并提供逐用途 TemplateID。审核正文版本、
SES 地域与域名/地址状态及实际发送能力仍需登记或核验，详见 [审核交接记录](approval-record.md)。

## 模板与参数

| 用途 | SES 模板名称 | Subject | 正文与期限 | TemplateData 键 |
| --- | --- | --- | --- | --- |
| 验证注册邮箱 | `canlearn_email_verification_v1` | `验证你的 CanLearn 邮箱` | [HTML](email-verification.html) / [纯文本](email-verification.txt)，1 小时 | `verification_url`、`verification_url_html` |
| 找回密码 | `canlearn_password_reset_v1` | `重置你的 CanLearn 密码` | [HTML](password-reset.html) / [纯文本](password-reset.txt)，30 分钟 | `reset_url`、`reset_url_html` |

内容采用中文、单列布局和内联样式；没有外部字体、图片、追踪或第三方链接。
密码和邀请码均不进入邮件，注册准入在服务端完成；用户未提供可收回复的邮箱，因此不设置 ReplyTo。
模板中的链接期限必须与真实认证配置一致，期限变化时升版并重新核验。
有效期从 token 签发起计，不从送达/打开邮件重置；发送队列不得交付已过期令牌，重试/重发需核验剩余有效期。

## 本地重建与预览

先安装仓库依赖，再执行：

```bash
pnpm install --frozen-lockfile
python3 docs/architecture/CL-005/email-templates/build_templates.py
```

脚本无网络请求、不会上传模板或发邮件，生成格式使用根 Biome 配置。

- [验证邮件预览](generated/preview-email-verification.html)
- [找回邮件预览](generated/preview-password-reset.html)
- [验证模板 CreateEmailTemplate 请求体](generated/create-email-verification.json)
- [找回模板 CreateEmailTemplate 请求体](generated/create-password-reset.json)

预览仅使用无效合成 token，预览提示不进入 SES 正文。
生成的 JSON 是 `CreateEmailTemplate` 请求体，包含 Base64 编码的 HTML/Text；
控制台编辑 HTML 时应使用源 HTML，不能直接粘贴 Base64 请求体。

## SES 录入与后续调用

1. 核验 SES 发件域名/地址状态及控制台要求的 DNS 记录、发送地域、额度与价格。
2. 在 SES 创建两份模板，录入对应源正文；若用 API 创建，使用生成的请求体。
3. 用户已报告模板审核；补齐实际 TemplateID、审核状态/日期、内容版本和 SHA。
   SDK 的模板状态字段定义为 0 已通过、1 审核中、2 拒绝；其他状态不可当可用。
4. 应用按用途绑定实际 TemplateID，固定 Subject 与发件地址，`Destination` 每次只含一个收件人。
   收件人及发件地址来自服务端确认的注册/账户配置，不由客户端任意覆盖。
5. `TemplateData` 必须是 JSON 字符串；普通链接与 HTML 转义链接分两个字符串变量传入，
   不传任意 HTML。原始链接由认证组件/受控前端生成，确认 HTTPS、准确站点 origin、允许路径，
   禁止自定义凭据、控制字符和外部回跳；HTML 变量按属性/文本上下文转义。
6. 创建/发送接入完成后，用获准测试收件人核验实际替换、链接、纯文本与送达。
   SES 接受请求/返回 MessageId 不等于送达，发送失败和未知状态有界重试，不记录 token 或完整链接。

例如验证模板变量结构如下，**不是实际可用 token 或发送命令**：

```json
{
  "verification_url": "https://cl.hangxiaonet.com/v1/auth/verify-email?token=SYNTHETIC&callbackURL=https%3A%2F%2Fcl.hangxiaonet.com",
  "verification_url_html": "https://cl.hangxiaonet.com/v1/auth/verify-email?token=SYNTHETIC&amp;callbackURL=https%3A%2F%2Fcl.hangxiaonet.com"
}
```

正文中的验证 API 和找回前端路径为待实现的契约候选，CL-007/101 定稿时核对。
不能因为预览可打开而宣称当前站点已有注册/找回功能。
邮件通知应在注册事务提交后由受控发送路径交付；合成兼容性探针使用内存邮件桩，
不证明数据库回滚与真实外部发送已原子协调。通知去重/重试/过期处理交后续实现验证。

## 已核验依据与限制

实际读取腾讯云官方 SDK 的
[Template / TemplateContent / CreateEmailTemplate / SendEmail 类型](https://github.com/TencentCloud/tencentcloud-sdk-nodejs/blob/master/src/services/ses/v20201002/ses_models.ts)
及 [SendEmail 接口说明](https://github.com/TencentCloud/tencentcloud-sdk-nodejs/blob/master/src/services/ses/v20201002/ses_client.ts)：
参数语法为 `{{键}}`，创建模板 Html/Text 使用 Base64，发送时 TemplateData 是 JSON 字符串。
固定候选 SDK 为 `tencentcloud-sdk-nodejs-ses@4.1.271`，已在隔离环境验证导入。
官网文档抓取返回浏览器校验页，因此未据此报告 SES 价格、地域、审批或实际配置已通过。

已检查编码、占位符、请求体回解、合成链接转义和重建一致性；
没有在 Outlook/Gmail/QQ 等真实客户端做送达/渲染测试；agent 没有创建远端模板或发送真实邮件。
远端审核完成依据是用户于 2026-10-12 的报告，并非本轮 SDK/控制台独立查询结果。
