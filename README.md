# URL Speed Test

[![CI](https://github.com/hexf00/url-speed-test/actions/workflows/ci.yml/badge.svg)](https://github.com/hexf00/url-speed-test/actions/workflows/ci.yml)

一个无后端、无遥测的浏览器下载测速页。它测试的是“当前客户端到你指定的那个
HTTP(S) 文件或接口”的路径，不是某个第三方测速节点。

## 能测什么

- 原样请求手动输入或预置的 URL，不追加 cache-busting 查询参数。
- 按 250 ms 窗口绘制实时速度曲线，展示当前、平均、峰值、流量与时长。
- 展示浏览器可见的 DNS、连接、TLS、TTFB、传输、总耗时和 HTTP 协议。
- 默认一个下载请求，可选择 1–8 个对同一 URL 的并发请求。
- 结果仅写入浏览器 `localStorage`；历史中的 URL 会移除 query 和 hash。

测速使用原生 `fetch`、`ReadableStream` 和 Resource Timing API，运行时没有框架或
测速库依赖。

## 直接运行

这是一个静态站点，需通过 HTTP(S) 提供，不能直接双击 `index.html`：

```bash
python3 -m http.server 8080
```

然后访问 <http://localhost:8080>，输入一个允许浏览器跨域读取的大文件 URL。

也可以把仓库根目录部署到 GitHub Pages、对象存储静态站点或任意 Web 服务器。
若测速页使用 HTTPS，目标也必须使用 HTTPS，否则浏览器会按 mixed content 阻止请求。

## 配置预置目标

编辑 [`targets.json`](./targets.json)：

```json
{
  "targets": [
    {
      "id": "cdn-east",
      "label": "CDN East",
      "url": "https://cdn.example.com/speed/100mb.bin"
    }
  ]
}
```

预置与手动输入最终都会变成同一个 Target，并进入同一条 `Target → Run → Result`
执行路径。一次 Run 只测一个 Target；未来若增加批量能力，Batch 会按顺序发起多个
相互独立的 Run。

不要把长期密钥写进公开的 `targets.json`。临时签名 URL 更适合在页面中手动输入。

## 目标服务配置

跨域下载至少需要允许测速页读取响应：

```http
Access-Control-Allow-Origin: https://speed.example.com
```

若还要看到 DNS、连接、TLS、TTFB 等详细阶段，需要额外返回：

```http
Timing-Allow-Origin: https://speed.example.com
```

也可以按你的安全策略使用明确的多源配置。只有在确实允许任意站点读取这些响应时，
才使用 `*`。

推荐目标满足以下条件：

- 只读、幂等的 `GET` 资源，不产生业务副作用。
- 文件足够大，或接口能持续输出；达到设定时长后浏览器会中止未完成的请求。
- 返回不可压缩或已压缩的二进制数据。Fetch 读取的是应用可见的响应体；高度可压缩且
  使用 `Content-Encoding` 的内容不适合代表线上传输字节率。
- 接受匿名请求或查询参数签名。本工具使用 `credentials: "omit"`，不会携带 Cookie。

`cache: "no-store"` 用于绕过浏览器 HTTP 缓存，并且不会修改目标 URL。上游 CDN、
反向代理或源站如何缓存，仍由目标服务控制，也属于本次客户端到该服务路径的一部分。

## 如何理解结果

- Mbps 使用十进制定义：`bytes × 8 / elapsed seconds / 1,000,000`。
- 默认并发为 1，最接近一次普通下载。增加并发会同时请求同一 URL，常用于观察单连接
  未跑满时的聚合吞吐，也会按并发数增加服务端请求和流量。
- DNS、连接或 TLS 为 `0 ms` 通常表示浏览器复用了已有解析或连接，并非测量错误。
- 跨域目标没有 `Timing-Allow-Origin` 时，吞吐仍可测，但受保护的分阶段耗时会显示为空。
- 结果代表本次浏览器、网络、目标服务与缓存链路的共同表现，不等同于物理链路上限。

## 开发与验证

需要 Node.js 24：

```bash
npm ci
npm run check
npm test
npx playwright install chromium
npm run test:e2e
```

单元测试覆盖 URL、计量、Resource Timing 与历史脱敏边界；Playwright 测试使用真实
跨域流式响应验证手动 URL、预置 Target、速度曲线、TAO 降级和 localStorage 脱敏。

领域词汇见 [`CONTEXT.md`](./CONTEXT.md)，关键设计决策见 [`docs/adr`](./docs/adr)。

## 范围边界

当前版本只做浏览器到指定目标的下载测速。它不提供上传测速、ICMP ping、服务端内部
阶段拆分、绕过 CORS 的代理，或把历史发送到后端。

## License

[MIT](./LICENSE)
