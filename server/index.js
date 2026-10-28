const express = require('express');
const cors = require('cors');
const path = require('node:path');
const os = require('node:os');
const services = require('./services');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend assets
app.use(express.static(path.join(__dirname, '..', 'public')));

// Seed database on startup
services.seedDemoDataIfEmpty();

// Get LAN IP for mobile scanning
app.get('/api/server-info', (req, res) => {
  const nets = os.networkInterfaces();
  let localIp = '127.0.0.1';
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254')) {
        localIp = net.address;
        break;
      }
    }
  }
  res.json({
    port: PORT,
    ip: localIp,
    mobileUrl: `http://${localIp}:${PORT}`
  });
});

// --- Core Webhook: Daily Unlock Ping ---
// Supports both GET and POST for iOS Shortcuts & Android Helper
app.all('/api/v1/ping', (req, res) => {
  const token = req.query.token || req.body.token || req.headers['x-device-token'];
  if (!token) {
    return res.status(400).json({ success: false, message: '缺少 token 参数' });
  }

  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  const userAgent = req.headers['user-agent'] || '';

  const result = services.performCheckin(token, clientIp, userAgent);
  if (!result.success) {
    return res.status(result.code || 400).json(result);
  }

  return res.json({
    code: 0,
    status: 'ALIVE',
    message: result.message,
    user: {
      id: result.user.id,
      nickname: result.user.nickname
    },
    alreadyCheckedIn: result.alreadyCheckedIn,
    checkin: result.checkin
  });
});

// --- User & Auth APIs ---
// Retrieve user info by token or default to demo user
app.get('/api/user/me', (req, res) => {
  const token = req.query.token || 'hzm_demo_me';
  const user = services.getUserByToken(token);
  if (!user) {
    return res.status(404).json({ success: false, message: '用户不存在' });
  }

  const circles = services.getUserCircles(user.id);
  const today = services.getTodayString();
  const db = require('./db');
  const todayCheckin = db.prepare('SELECT * FROM daily_checkins WHERE user_id = ? AND checkin_date = ?').get(user.id, today);

  res.json({
    success: true,
    user: {
      ...user,
      todayCheckedIn: !!todayCheckin,
      checkinTime: todayCheckin ? new Date(todayCheckin.checkin_time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : null
    },
    circles
  });
});

// Create new user (e.g. from WeChat login simulation)
app.post('/api/user/register', (req, res) => {
  const { nickname, deviceType, alertTime } = req.body;
  if (!nickname) {
    return res.status(400).json({ success: false, message: '昵称不能为空' });
  }
  const user = services.createUser(nickname, deviceType || 'ios', alertTime || '21:00');
  res.json({ success: true, user });
});

// Update user settings
app.put('/api/user/profile', (req, res) => {
  const { userId, nickname, alert_time, emergency_contact_name, emergency_contact_phone } = req.body;
  if (!userId) {
    return res.status(400).json({ success: false, message: '缺少 userId' });
  }
  const updated = services.updateUser(userId, {
    nickname,
    alert_time,
    emergency_contact_name,
    emergency_contact_phone
  });
  res.json({ success: true, user: updated });
});

// --- Circles APIs ---
app.get('/api/circles', (req, res) => {
  const userId = parseInt(req.query.userId || 1);
  const circles = services.getUserCircles(userId);
  res.json({ success: true, circles });
});

app.post('/api/circles', (req, res) => {
  const { userId, name } = req.body;
  if (!userId || !name) {
    return res.status(400).json({ success: false, message: '缺少参数' });
  }
  const circle = services.createCircle(userId, name);
  res.json({ success: true, circle });
});

app.post('/api/circles/join', (req, res) => {
  const { userId, code } = req.body;
  if (!userId || !code) {
    return res.status(400).json({ success: false, message: '缺少参数' });
  }
  const result = services.joinCircleByCode(userId, code);
  res.json(result);
});

app.get('/api/circles/:id', (req, res) => {
  const circleId = parseInt(req.params.id);
  const details = services.getCircleDetailsWithMembers(circleId);
  if (!details) {
    return res.status(404).json({ success: false, message: '圈子不存在' });
  }
  res.json({ success: true, circle: details });
});

// --- Manual Test & Trigger APIs ---
// Simulates an unlock ping for a given user
app.post('/api/simulate-checkin', (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ success: false, message: '缺少 token' });
  const result = services.performCheckin(token, '127.0.0.1 (Web 模拟)', 'Web-Simulator/1.0');
  res.json(result);
});

// Trigger timeout alerts check
app.post('/api/alerts/check', (req, res) => {
  const alerts = services.checkAndGenerateAlerts();
  res.json({ success: true, count: alerts.length, alerts });
});

// Serve iOS Shortcut installation helper
app.get('/api/shortcut/guide', (req, res) => {
  const token = req.query.token || 'hzm_demo_me';
  const pingUrl = `${req.protocol}://${req.get('host')}/api/v1/ping?token=${token}`;
  res.json({
    success: true,
    token,
    pingUrl,
    steps: [
      "1. 打开 iPhone 自带的「快捷指令」App，点击底部「自动化」",
      "2. 点击右上角「+」，找到并选择触发条件「当 iPhone 解锁时」",
      "3. 选择「立即运行」，并关闭「运行时通知」",
      "4. 下一步添加操作：「获取 URL 的内容」",
      `5. 粘贴专属请求链接: ${pingUrl}`,
      "6. 点击完成。从此每天首次解锁手机，即自动静默打卡报平安！"
    ]
  });
});

app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`  🌟「活着么」平安打卡守护平台服务已启动`);
  console.log(`  🔗 服务地址: http://localhost:${PORT}`);
  console.log(`  📱 WebHook 打卡接口: http://localhost:${PORT}/api/v1/ping?token=hzm_demo_me`);
  console.log(`===============================================`);
});
