# 🌱 活着么 (Huozheme) - 每日手机平安打卡与亲友守护平台

> **“每日一次 · 充上电即安好”**  
> 专为独居青年、空巢老人、异地亲友打造的**轻量无感平安守护系统**。手机每天只要连接充电器（或安卓屏幕解锁），即可静默完成打卡报平安；圈子内亲友可实时查看健康状态，超时未充电自动触发紧急预警。

---

## 🌐 线上体验地址

* **正式服务地址**：[https://huozheme-9yrv.onrender.com](https://huozheme-9yrv.onrender.com)
* **安卓官方安装包下载**：[huozheme-companion.apk](https://huozheme-9yrv.onrender.com/huozheme-companion.apk)
* **GitHub 开源仓库**：[https://github.com/yan-lalala/huozheme](https://github.com/yan-lalala/huozheme)

---

## 🏗️ 整体架构设计（Apple HIG 极简风 + 双端无感触发器）

```
[ iPhone 用户 (iOS) ]                     [ 安卓用户 (Android) ]
iOS 原生快捷指令自动化                      极轻量伴侣 APK (~5.3MB)
(每天插上充电器 -> 0.1s 静默 Webhook)    (监听解锁/充电广播 -> 静默单次请求)
         │                                         │
         └───────────────────┬─────────────────────┘
                             ▼
                ┌────────────────────────┐
                │   Node.js 极简后端服务  │
                │  (SQLite 幂等日历引擎)  │
                └────────────┬───────────┘
                             │
           ┌─────────────────┴─────────────────┐
           ▼                                   ▼
 ┌──────────────────┐                ┌───────────────────┐
 │ Apple HIG 移动H5  │                │ 微信服务号 / 短信 │
 │ - 亲友健康状态环 │                │ 超时未打卡紧急告警│
 │ - 圈子管理与邀请 │                │ (例如超过 21:00)  │
 └──────────────────┘                └───────────────────┘
```

---

## ✨ 核心特性

1. **绝对静默，无需手动打开应用**：
   * **iOS 端**：每天睡觉前插上充电线或放上无线充，后台 0.1 秒自动完成打卡报平安。
   * **安卓端**：支持底层屏幕解锁与插电双监听，每天首次触发后立即休眠，**零额外耗电**。
   * 当天后续的所有插电或解锁，本地和云端均自动幂等休眠。
2. **手机重启依然自动生效**：
   * iOS 快捷指令属于操作系统级服务，永久常驻。
   * Android 内置开机自启监听，关机重启后系统自动就绪。
3. **圈层化共享与房主管理**：
   * 支持创建家庭圈、密友圈、情侣圈，6 位邀请码快捷加入，自动生成专属亲友独立身份。
   * 房主/圈主拥有成员管理权限，可一键将误入或无效成员移出圈子。
   * 成员状态直观展示：🟢 **已充上电 (安全)** | 🟡 **等待充电 (XX:XX 前)** | 🔴 **全天未充电 (急需联系)**。
4. **云端 CI/CD 自动编译 APK**：
   * GitHub Actions 自动构建 Android APK 并部署到服务端供用户直接下载。

---

## 🚀 快速启动与本地测试

### 1. 启动后端与前端页面
```bash
# 安装依赖
npm install

# 启动服务 (默认端口 3000)
npm start
```
服务启动后，在浏览器访问：**`http://localhost:3000`** 即可打开 Apple Health 风格看板。

### 2. 运行自动化测试套件
```bash
# 一键运行覆盖 26 个核心功能的测试套件
npm test
```

---

## 📱 双端无感打卡配置指引

### 方案 1：苹果 iPhone (iOS 快捷指令自动化，零 App 依赖)

iPhone 用户无需安装任何外部应用，利用苹果系统自带的「快捷指令」即可：

1. 打开 iPhone 自带的 **「快捷指令」** App，切换到中间的 **「自动化」** 标签。
2. 点击右上角 **「+」**，搜索并选择触发条件：**「充电器」**。
3. 选项勾选 **「已连接」**。
4. 下方勾选 **「立即运行」**（可关闭“运行时通知”保持无感）。
5. 下一步添加操作：选择 **「获取 URL 的内容」**。
6. URL 粘贴你的专属打卡 Webhook 链接（可在网页端「打卡配置」中一键复制）：
   ```text
   https://huozheme-9yrv.onrender.com/api/v1/ping?token=YOUR_TOKEN
   ```
7. 点击完成。从今往后，每天只要插上充电器，平安即刻自动报达！

---

### 方案 2：安卓手机 (Android 极简伴侣 APK)

安卓端源码位于 `android/` 目录，已通过 GitHub Actions 自动云端编译：

* **直接下载安装**：在网页端「打卡配置」切换到 Android 选项卡，或访问直链下载安装 `huozheme-companion.apk`。
* **极简配置 2 步**：
  1. 打开伴侣 App，粘贴网页一键复制的专属 Token，点击 **「保存并启用自动监听」**。
  2. 点击 **「设置自启与白名单」**，允许应用自启动并忽略电池优化即可。

---

## 🔌 API 核心接口说明

| 方法 | 路径 | 描述 |
| :--- | :--- | :--- |
| `GET / POST` | `/api/v1/ping?token=xxx` | **核心打卡 Webhook**，手机插电/解锁时静默调用，具备天然幂等性 |
| `GET` | `/api/user/me?token=xxx` | 获取当前用户信息、今天是否打卡、加入的圈子 |
| `POST` | `/api/user/create-guest` | 为新亲友自动创建独立身份与专属 Token |
| `GET` | `/api/circles/:id` | 获取圈子详情与全员今日实时状态 |
| `POST` | `/api/circles` | 创建新圈子 |
| `POST` | `/api/circles/join` | 凭 6 位邀请码加入圈子 |
| `POST` | `/api/circles/quick-join` | 凭 6 位邀请码与昵称快速加入圈子 |
| `DELETE` | `/api/circles/:circleId/members/:memberId` | 圈主移出指定圈子成员 |
| `POST` | `/api/alerts/check` | 触发巡检未打卡超时预警 |

---

## 📦 项目目录结构

```text
huozheme/
  ├── server/                 # 后端业务层
  │    ├── index.js           # Express RESTful API 服务
  │    ├── services.js        # 打卡业务逻辑、圈子管理、时区校准、幂等计算
  │    └── db.js              # SQLite 数据库模型
  ├── public/                 # 前端 UI (Apple HIG 风格移动看板)
  │    ├── index.html         # 移动端看板与配置弹窗
  │    ├── app.js             # 实时状态心跳、打卡模拟、圈子管理
  │    └── huozheme-companion.apk # 编译好的安卓原生伴侣安装包
  ├── android/                # 安卓端极简伴侣工程 (Kotlin + Gradle)
  ├── tests/                  # 自动化测试套件 (26项全覆盖)
  │    └── test-suite.js
  ├── .github/workflows/      # GitHub Actions CI/CD 流水线 (自动编译 APK)
  ├── data/                   # 本地数据库存储目录
  └── package.json
```
