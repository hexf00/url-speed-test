# URL Speed Test

[English](./README.md) | 简体中文

[**在线体验**](https://hexf00.github.io/url-speed-test/)

[![CI](https://github.com/hexf00/url-speed-test/actions/workflows/ci.yml/badge.svg)](https://github.com/hexf00/url-speed-test/actions/workflows/ci.yml)

一个无后端、无遥测的浏览器下载测速页，直接测量“当前客户端到你指定的那个
HTTP(S) 文件或接口”的路径，无需第三方测速节点。

## 能测什么

- 原样请求手动输入或预置的 URL，不追加 cache-busting 查询参数。
- 展示解码平均、最近窗口和峰值速度，并按 250 ms 窗口绘制响应体解码后的实时吞吐
  曲线。
- 响应完整结束且浏览器能提供精确数据时，额外展示压缩后响应体大小、实际平均传输
  速度、压缩比和节省流量。
- 展示浏览器可见的 DNS、连接、TLS、TTFB、传输、总耗时和 HTTP 协议。
- 默认一个下载请求，可选择 1–8 个对同一 URL 的并发请求。
- 结果仅写入浏览器 `localStorage`；历史中的 URL 会移除 query 和 hash。

测速使用原生 `fetch`、`ReadableStream` 和 Resource Timing API，运行时没有框架或
测速库依赖。

## 直接运行

这是一个静态站点，需通过 HTTP(S) 提供：

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

若还要通过 Resource Timing 看到 DNS、连接、TLS、TTFB 等详细阶段和压缩后响应体
大小，需要额外返回：

```http
Timing-Allow-Origin: https://speed.example.com
```

请按你的安全策略明确列出允许的来源。只有在确实允许任意站点读取这些响应时，才使用
`*`。

对于完整响应，准确的 `Content-Length` 也能在 Resource Timing 大小受保护时提供压缩后
响应体大小。跨域 chunked 响应若要得到这个指标，则需要 `Timing-Allow-Origin`。

推荐目标满足以下条件：

- 只读、幂等的 `GET` 资源，不产生业务副作用。
- 文件足够大，或接口能持续输出；达到设定时长后浏览器会中止未完成的请求。
- 可以使用 gzip、Brotli 或浏览器支持的其它内容编码。浏览器会自动协商压缩；应按压缩
  后体积选择足够大的资源，避免高度可压缩的响应在形成有效采样窗口前就已结束。
- 接受匿名请求或查询参数签名。本工具使用 `credentials: "omit"`，不会携带 Cookie。

`cache: "no-store"` 用于绕过浏览器 HTTP 缓存，并且不会修改目标 URL。上游 CDN、
反向代理或源站如何缓存，仍由目标服务控制，也属于本次客户端到该服务路径的一部分。

## 如何理解结果

- Mbps 使用十进制定义：`bytes × 8 / elapsed seconds / 1,000,000`。
- 大小使用十进制 `kB`、`MB`、`GB`，与 Mbps 和常见浏览器 Network 面板一致。
  `48.0 MiB` 约等于 `50.3 MB`，与压缩后传输的 `37.6 MB` 不是同一个量。
- **实际平均速度**使用内容解码前的压缩后响应体字节，不包含 HTTP 头和协议帧；
  **解码平均速度**、**最近窗口速度**、峰值及曲线使用 Fetch 解码后交给 JavaScript
  的字节。浏览器在请求进行中不提供精确的压缩后字节进度。
- 压缩比定义为 `解码后字节 / 实际传输响应体字节`。
- 默认并发为 1，最接近一次普通下载。增加并发会同时请求同一 URL，常用于观察单连接
  未跑满时的聚合吞吐，也会按并发数增加服务端请求和流量。
- DNS、连接或 TLS 为 `0 ms` 通常表示浏览器复用了已有解析或连接，并非测量错误。
- 跨域目标没有 `Timing-Allow-Origin` 时，受保护的分阶段耗时会显示为空；完整响应若有
  `Content-Length`，仍可得到实际传输指标，否则只能得到解码吞吐。
- 达到时长上限而中断的响应仍是有效 Result：主结果和本地历史会展示解码平均、最近
  窗口和峰值速度；精确的压缩后传输大小仍不可见，因为浏览器不公开中断响应的部分
  编码字节。
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

单元测试覆盖 URL、解码与传输计量、Resource Timing 和历史脱敏边界；Playwright 测试
使用真实跨域流式与 gzip 响应验证手动 URL、预置 Target、压缩指标、TAO 降级、超长 URL
布局和 localStorage 脱敏。

领域词汇见 [`CONTEXT.md`](./CONTEXT.md)，关键设计决策见 [`docs/adr`](./docs/adr)。

## 范围边界

当前版本只做浏览器到指定目标的下载测速。它不提供上传测速、ICMP ping、服务端内部
阶段拆分、绕过 CORS 的代理，或把历史发送到后端。

## License

[MIT](./LICENSE)
