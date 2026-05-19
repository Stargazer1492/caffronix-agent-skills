# 公司来源约定

## 支持范围

v1 目标公司：

- 字节
- 阿里
- 腾讯
- 美团

v1 渠道：

- 校招
- 社招
- 两者

## 适配器边界

- 每个适配器必须以“公司 + 渠道”命名。
- 校招和社招不得共用适配器。
- 适配器负责发现公开岗位详情页和保留原始字段，不负责最终人工智能岗位语义判断。
- 人工智能岗位判断放在分析层，避免某家公司筛选参数变化导致口径漂移。
- 适配器不只需要入口 URL，还必须知道查询词如何传入、页码如何推进、总量上限如何生效。
- `config.toml` 中的 `sources.*` 是默认来源契约；用户命令行提供 source URL 时可以覆盖默认 URL，但不能跳过 adapter 对分页和详情页的处理。
- 面向用户暴露的是单次任务总量上限，不暴露每页抓取数量，也不要求用户理解公司或来源级预算。所有适配器共同消耗 `crawl.max_jobs_per_task`。
- `crawl.hard_max_pages_per_source` 只是兜底保护，防止某个来源异常无限翻页；正常停止条件应该优先看任务总量、无更多结果、登录/验证码阻断或页面重复。
- 单页数量、页面内部批大小、接口 `limit` 等属于 adapter 内部实现细节。adapter 可以用这些细节提高效率，但不能把它们作为用户必须理解的配置。

## 来源与分页契约

### 字节社招

- 入口：`https://jobs.bytedance.com/experienced/position`
- 查询参数：`keywords`
- 页码参数：`current`
- 内部批量参数：`limit`
- 页码起点：`1`
- 模板：

```text
https://jobs.bytedance.com/experienced/position?keywords={query}&category=&location=&project=&type=&job_hot_flag=&current={page}&limit={limit}&functionCategory=&tag=
```

### 字节校招

- 入口：`https://jobs.bytedance.com/campus/position`
- 查询参数：`keywords`
- 页码参数：`current`
- 内部批量参数：`limit`
- 页码起点：`1`
- 模板：

```text
https://jobs.bytedance.com/campus/position?keywords={query}&category=&location=&project=&type=&job_hot_flag=&current={page}&limit={limit}&functionCategory=&tag=
```

### 美团社招

- 入口：`https://zhaopin.meituan.com/web/social`
- 查询参数：`keyword`
- 页码参数：`pageNo`
- 页码起点：`1`
- 模板：

```text
https://zhaopin.meituan.com/web/social?keyword={query}&pageNo={page}
```

### 美团校招

- 入口：`https://zhaopin.meituan.com/web/campus`
- 查询参数：`keyword`
- 页码参数：`pageNo`
- 页码起点：`1`
- 模板：

```text
https://zhaopin.meituan.com/web/campus?keyword={query}&pageNo={page}
```

### 腾讯社招

- 入口：`https://careers.tencent.com/search.html`
- 查询参数：`keyword`
- 页码参数：`index`
- 页码起点：`1`
- 模板：

```text
https://careers.tencent.com/search.html?index={page}&keyword={query}
```

### 腾讯校招

- 入口：`https://careers.tencent.com/search.html`
- 查询参数：`keyword`
- 校招固定筛选：`query=at_2,at_3`
- 模板：

```text
https://careers.tencent.com/search.html?keyword={query}&query=at_2,at_3
```

腾讯校招分页参数需要在 adapter 实现时进一步确认。不能只依赖首屏 URL。

### 阿里社招

- 入口：`https://talent-holding.alibaba.com/off-campus/position-list`
- 分页模式：特殊适配。

社招 URL 中没有暴露关键词和分页参数。实现 adapter 时必须通过浏览器观察前端请求、路由状态或接口载荷，确认以下内容：

- 查询关键词如何提交。
- 页码或 cursor 如何推进。
- 是否存在接口级分页参数。
- 详情页 URL 如何构造。

在确认前，阿里社招 adapter 不得假设可以通过 URL query string 翻页。

### 阿里实习生

- 入口：`https://campus-talent.alibaba.com/campus/position`
- 模板：

```text
https://campus-talent.alibaba.com/campus/position?batchId=100000540002&circleCode=60000&filterParams=%7B%22customDept%22%3A%5B%22YKCNU1%22%2C%22P1ZVE7%22%2C%22O1BGLD%22%2C%222OAHS3%22%2C%22R4NF3G%22%2C%22UXLZSO%22%5D%7D
```

### 阿里应届生

- 入口：`https://talent-holding.alibaba.com/campus/position-list`
- 模板：

```text
https://talent-holding.alibaba.com/campus/position-list?campusType=freshman&lang=zh&batchId=100000060001
```

阿里实习生和应届生都属于校招大类，但应在 adapter 内用 `sub_channel` 区分。

## 最小字段

- 公司
- 渠道
- 来源链接
- 来源岗位 ID
- 标题
- 地点
- 部门
- 岗位描述
- 岗位要求
- 抓取时间

## 阻断处理

遇到登录、验证码、风控、安全验证或权限弹窗时，适配器必须停止该来源，并返回结构化失败信息。
