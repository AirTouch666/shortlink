# shortlink

这是一个使用 Cloudflare Workers 构建的短链接生成器，可以将长 URL 转换为短链接，并提供访问统计功能。

## 功能特点

- 创建短链接：自动生成短链接或使用自定义短链接
- 访问重定向：访问短链接时自动重定向到原始 URL
- 访问统计：记录每个短链接的访问次数
- 信息查询：查看短链接的详细信息
- 简洁的 Web 界面：提供用户友好的 Web 界面来创建短链接

## 部署指南

1. 复制 [index.js](index.js) 中的代码
2. 打开 [Cloudflare](https://dash.cloudflare.com/) ，进入`计算(Workers)->Workers 和 Pages`
	<img src="https://img.airtouch.top/7b6f7866a0b0aa35bbb13272ee9e8e31.png" style="zoom: 33%;" />

3. 点击创建，选择`从 Hello World! 开始`，点击部署，随后选择`编辑代码`

   <img src="https://img.airtouch.top/848bb4ef3f458337758126f7cb880167.png" style="zoom: 25%;" /><img src="https://img.airtouch.top/9b18f6c1163c99158a1ddae5279841fd.png" style="zoom:25%;" />

4. 拷贝[index.js](index.js) 中的代码，修改以下内容

   ```js
   const CONFIG = {
     // 短链接的域名，部署后需要修改为实际的域名
     BASE_URL: 'https://your-worker-domain.workers.dev',
     // 短链接的长度
     SHORT_ID_LENGTH: 6,
     // 管理员密钥，用于创建短链接时的认证
     ADMIN_KEY: 'your-admin-key-here',
   };
   ```

   其中的域名是在部署成功页面出现的（或者你自己绑定的域名）

5. 随后点击部署

6. 打开 [Cloudflare](https://dash.cloudflare.com/) ，进入`存储与数据库->KV`

<img src="https://img.airtouch.top/857381da8aa6a9352b6058bd28d5dfad.png" style="zoom: 33%;" />

7. 点击`Create Instance`创建一个存储库，记好他的名字

8. 回到 Worker，进入你部署的项目，依次点击`绑定->添加绑定`，选择`KV 命名空间`

   <img src="https://img.airtouch.top/f9724aedcd7f02f19b30f7a87d2928f1.png" style="zoom: 25%;" /> 

9. 在`变量名称`填写`SHORTLINK_KV`，然后在下面选择你的 KV 存储库，随后点击部署

   <img src="https://img.airtouch.top/6aab01ae01656de458a055eaf3691ba3.png" style="zoom:33%;" />

## 使用方法

### Web 界面

访问你的 Worker URL 可以使用 Web 界面创建短链接。

### API 接口

#### 创建短链接

```
POST /api/create
Content-Type: application/json

{
  "url": "https://example.com/very/long/url",
  "customId": "custom", // 可选
  "adminKey": "你的管理员密钥"
}
```

响应:

```json
{
  "shortId": "abc123",
  "shortUrl": "https://your-worker.workers.dev/abc123",
  "originalUrl": "https://example.com/very/long/url"
}
```

#### 获取短链接信息

```
GET /api/info/:shortId
```

响应:

```json
{
  "shortId": "abc123",
  "shortUrl": "https://your-worker.workers.dev/abc123",
  "originalUrl": "https://example.com/very/long/url",
  "createdAt": "2023-09-04T12:34:56.789Z",
  "visits": 42
}
```

#### 访问短链接

```
GET /:shortId
```

这将重定向到原始 URL。

## 自定义和扩展

- **自定义域名**: 你可以在 Cloudflare Dashboard 中为你的 Worker 配置自定义域名
- **修改短链接长度**: 在 `CONFIG` 对象中修改 `SHORT_ID_LENGTH` 值
- **添加更多功能**: 例如链接过期、密码保护等

## 许可证

MIT 