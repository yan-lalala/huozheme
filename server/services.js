const crypto = require('node:crypto');
const db = require('./db');

function getTodayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function generateToken() {
  return 'hzm_' + crypto.randomBytes(8).toString('hex');
}

function generateCircleCode() {
  return Math.random().toString().slice(2, 8);
}

// Initialize real production database & purge demo data
function seedDemoDataIfEmpty() {
  try {
    // 1. Purge fake demo users and fake test data
    const fakeTokens = ['hzm_demo_mom', 'hzm_demo_dad', 'hzm_demo_friend'];
    for (const t of fakeTokens) {
      const u = db.prepare('SELECT id FROM users WHERE device_token = ?').get(t);
      if (u) {
        db.prepare('DELETE FROM circle_members WHERE user_id = ?').run(u.id);
        db.prepare('DELETE FROM daily_checkins WHERE user_id = ?').run(u.id);
        db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
      }
    }

    // Delete fake demo circles
    const fakeCircles = db.prepare("SELECT id FROM circles WHERE code IN ('666888', '520131')").all();
    for (const c of fakeCircles) {
      db.prepare('DELETE FROM circle_members WHERE circle_id = ?').run(c.id);
      db.prepare('DELETE FROM circles WHERE id = ?').run(c.id);
    }
  } catch (err) {
    console.error('Error cleaning demo data:', err);
  }

  // 2. Ensure the primary user account exists (matching user's iPhone shortcut token)
  const nowStr = new Date().toISOString();
  const me = db.prepare("SELECT * FROM users WHERE device_token = 'hzm_demo_me'").get();
  if (!me) {
    db.prepare(`
      INSERT INTO users (device_token, nickname, avatar, device_type, alert_time, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('hzm_demo_me', '我', '🧑', 'ios', '21:00', nowStr);
  } else if (me.nickname && (me.nickname.includes('守护者') || me.nickname.includes('('))) {
    db.prepare("UPDATE users SET nickname = '我' WHERE device_token = 'hzm_demo_me'").run();
  }
}

// User Services
function getUserByToken(token) {
  const stmt = db.prepare('SELECT * FROM users WHERE device_token = ?');
  return stmt.get(token);
}

function getUserById(id) {
  const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
  return stmt.get(id);
}

function createUser(nickname, deviceType = 'ios', alertTime = '21:00') {
  const token = generateToken();
  const now = new Date().toISOString();
  const avatarList = ['🧑', '👧', '👦', '🐱', '🐶', '🐼', '🦊', '🦁'];
  const avatar = avatarList[Math.floor(Math.random() * avatarList.length)];

  const stmt = db.prepare(`
    INSERT INTO users (device_token, nickname, avatar, device_type, alert_time, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(token, nickname, avatar, deviceType, alertTime, now);
  return getUserById(result.lastInsertRowid);
}

function updateUser(userId, data) {
  const fields = [];
  const values = [];
  if (data.nickname !== undefined) {
    fields.push('nickname = ?');
    values.push(data.nickname);
  }
  if (data.alert_time !== undefined) {
    fields.push('alert_time = ?');
    values.push(data.alert_time);
  }
  if (data.emergency_contact_name !== undefined) {
    fields.push('emergency_contact_name = ?');
    values.push(data.emergency_contact_name);
  }
  if (data.emergency_contact_phone !== undefined) {
    fields.push('emergency_contact_phone = ?');
    values.push(data.emergency_contact_phone);
  }
  if (fields.length === 0) return getUserById(userId);

  values.push(userId);
  const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
  db.prepare(sql).run(...values);
  return getUserById(userId);
}

// Daily Check-in Logic
function performCheckin(token, ip = '', userAgent = '') {
  const user = getUserByToken(token);
  if (!user) {
    return { success: false, code: 404, message: '无效的设备打卡 Token' };
  }

  const today = getTodayString();
  const nowIso = new Date().toISOString();

  // Check if already checked in today
  const checkStmt = db.prepare(`
    SELECT * FROM daily_checkins WHERE user_id = ? AND checkin_date = ?
  `);
  const existing = checkStmt.get(user.id, today);

  if (existing) {
    return {
      success: true,
      alreadyCheckedIn: true,
      user,
      checkin: existing,
      message: `今日已报平安！打卡时间: ${new Date(existing.checkin_time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
    };
  }

  // Insert check-in record
  const insertStmt = db.prepare(`
    INSERT INTO daily_checkins (user_id, checkin_date, checkin_time, ip, user_agent)
    VALUES (?, ?, ?, ?, ?)
  `);
  insertStmt.run(user.id, today, nowIso, ip, userAgent);

  return {
    success: true,
    alreadyCheckedIn: false,
    user,
    checkin: {
      user_id: user.id,
      checkin_date: today,
      checkin_time: nowIso
    },
    message: `手机连接电源成功，今日平安打卡完成！`
  };
}

// Circle Services
function getUserCircles(userId) {
  const stmt = db.prepare(`
    SELECT c.*, 
      (SELECT COUNT(*) FROM circle_members WHERE circle_id = c.id) as member_count
    FROM circles c
    JOIN circle_members cm ON cm.circle_id = c.id
    WHERE cm.user_id = ?
    ORDER BY c.id ASC
  `);
  return stmt.all(userId);
}

function createCircle(ownerId, name) {
  const code = generateCircleCode();
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO circles (name, code, owner_id, created_at)
    VALUES (?, ?, ?, ?)
  `);
  const result = stmt.run(name, code, ownerId, now);
  const circleId = result.lastInsertRowid;

  // Add owner to members
  db.prepare(`
    INSERT INTO circle_members (circle_id, user_id, joined_at)
    VALUES (?, ?, ?)
  `).run(circleId, ownerId, now);

  return { id: circleId, name, code, owner_id: ownerId, created_at: now };
}

function joinCircleByCode(userId, code) {
  const circle = db.prepare('SELECT * FROM circles WHERE code = ?').get(code);
  if (!circle) {
    return { success: false, message: '未找到该圈子邀请码' };
  }

  const existingMember = db.prepare(`
    SELECT * FROM circle_members WHERE circle_id = ? AND user_id = ?
  `).get(circle.id, userId);

  if (existingMember) {
    return { success: true, message: '您已经在该圈子中', circle };
  }

  db.prepare(`
    INSERT INTO circle_members (circle_id, user_id, joined_at)
    VALUES (?, ?, ?)
  `).run(circle.id, userId, new Date().toISOString());

  return { success: true, message: `已成功加入「${circle.name}」`, circle };
}

function getCircleDetailsWithMembers(circleId) {
  const circle = db.prepare('SELECT * FROM circles WHERE id = ?').get(circleId);
  if (!circle) return null;

  const today = getTodayString();
  const membersStmt = db.prepare(`
    SELECT 
      u.id, u.nickname, u.avatar, u.device_type, u.alert_time,
      u.emergency_contact_name, u.emergency_contact_phone,
      cm.joined_at,
      dc.checkin_time,
      dc.checkin_date
    FROM circle_members cm
    JOIN users u ON u.id = cm.user_id
    LEFT JOIN daily_checkins dc ON dc.user_id = u.id AND dc.checkin_date = ?
    WHERE cm.circle_id = ?
    ORDER BY dc.checkin_time DESC, u.id ASC
  `);

  const members = membersStmt.all(today, circleId).map(m => {
    const isCheckedIn = !!m.checkin_time;
    // Calculate alert status
    let status = 'alive'; // 正常打卡
    if (!isCheckedIn) {
      // Check current hour vs alert_time
      const now = new Date();
      const currentHoursMinutes = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      if (currentHoursMinutes >= (m.alert_time || '21:00')) {
        status = 'timeout_alert'; // 超时未打卡警报
      } else {
        status = 'pending'; // 当天尚未打卡，等待中
      }
    }

    return {
      id: m.id,
      nickname: m.nickname,
      avatar: m.avatar,
      device_type: m.device_type,
      alert_time: m.alert_time,
      emergency_contact_name: m.emergency_contact_name,
      emergency_contact_phone: m.emergency_contact_phone,
      isCheckedIn,
      checkinTime: m.checkin_time ? new Date(m.checkin_time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : null,
      status
    };
  });

  return {
    ...circle,
    members
  };
}

// Check all pending users and generate system alert logs
function checkAndGenerateAlerts() {
  const today = getTodayString();
  const now = new Date();
  const currentHM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const unCheckedUsers = db.prepare(`
    SELECT u.* FROM users u
    LEFT JOIN daily_checkins dc ON dc.user_id = u.id AND dc.checkin_date = ?
    WHERE dc.id IS NULL
  `).all(today);

  const alerts = [];
  for (const user of unCheckedUsers) {
    if (currentHM >= user.alert_time) {
      // Check if alert already logged today
      const existingAlert = db.prepare(`
        SELECT * FROM alerts_log 
        WHERE user_id = ? AND alert_date = ? AND alert_type = 'timeout_warning'
      `).get(user.id, today);

      if (!existingAlert) {
        const msg = `用户【${user.nickname}】今日超过预警时间 ${user.alert_time} 仍未解锁手机打卡，请注意联系确认！`;
        db.prepare(`
          INSERT INTO alerts_log (user_id, alert_date, alert_type, message, created_at)
          VALUES (?, ?, 'timeout_warning', ?, ?)
        `).run(user.id, today, msg, now.toISOString());

        alerts.push({
          userId: user.id,
          nickname: user.nickname,
          alertTime: user.alert_time,
          message: msg
        });
      }
    }
  }

  return alerts;
}

module.exports = {
  getTodayString,
  seedDemoDataIfEmpty,
  getUserByToken,
  getUserById,
  createUser,
  updateUser,
  performCheckin,
  getUserCircles,
  createCircle,
  joinCircleByCode,
  getCircleDetailsWithMembers,
  checkAndGenerateAlerts
};
