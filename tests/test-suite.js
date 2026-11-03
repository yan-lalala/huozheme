const http = require('http');
const https = require('https');

const BASE_URL = process.argv[2] || process.env.TEST_URL || 'https://huozheme-9yrv.onrender.com';
const isHttps = BASE_URL.startsWith('https');
const client = isHttps ? https : http;

console.log(`===============================================`);
console.log(`  🧪 开始全流程自动化测试`);
console.log(`  🎯 目标环境: ${BASE_URL}`);
console.log(`===============================================\n`);

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      headers: {}
    };

    let postData = null;
    if (body) {
      postData = JSON.stringify(body);
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = data;
        }
        resolve({ status: res.statusCode, headers: res.headers, data: json });
      });
    });

    req.on('error', reject);
    req.setTimeout(45000, () => {
      req.destroy();
      reject(new Error('Request timeout (45s)'));
    });

    if (postData) req.write(postData);
    req.end();
  });
}

const results = [];

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
    results.push({ name: testName, pass: true });
  } else {
    console.error(`  ❌ [FAIL] ${testName} - ${details}`);
    results.push({ name: testName, pass: false, details });
  }
}

async function runTests() {
  try {
    // 1. Server info check
    console.log(`▶ 测试项 1: 服务器基础连通性与静态资源`);
    const info = await request('GET', '/api/server-info');
    assert(info.status === 200 && info.data.status === 'RUNNING', 'GET /api/server-info 基础健康检查', JSON.stringify(info.data));

    const html = await request('GET', '/');
    assert(html.status === 200 && typeof html.data === 'string' && html.data.includes('活着么'), 'GET / 前端 HTML 渲染与包含标题', `status: ${html.status}`);

    const apk = await request('HEAD', '/huozheme-companion.apk');
    assert(apk.status === 200, 'HEAD /huozheme-companion.apk 安装包直链可访问', `status: ${apk.status}`);

    // 2. User Creation & Session
    console.log(`\n▶ 测试项 2: 用户系统与会话机制`);
    const guestRes = await request('POST', '/api/user/create-guest', { deviceType: 'ios', nickname: '测试小明' });
    assert(guestRes.status === 200 && guestRes.data.user && guestRes.data.user.device_token, 'POST /api/user/create-guest 自动创建独立账号', JSON.stringify(guestRes.data));
    const userA = guestRes.data.user;

    const meRes = await request('GET', `/api/user/me?token=${userA.device_token}`);
    assert(meRes.status === 200 && meRes.data.user.id === userA.id, 'GET /api/user/me 校验新用户信息', JSON.stringify(meRes.data));

    // 3. Daily Check-in & Timezone Verification
    console.log(`\n▶ 测试项 3: 每日插电打卡与北京时间校准`);
    const pingRes = await request('GET', `/api/v1/ping?token=${userA.device_token}`);
    assert(pingRes.status === 200 && pingRes.data.status === 'ALIVE' && pingRes.data.alreadyCheckedIn === false, 'GET /api/v1/ping 首次插电打卡成功', JSON.stringify(pingRes.data));

    // Check time format (should be HH:MM Beijing time, not UTC)
    const meAfterPing = await request('GET', `/api/user/me?token=${userA.device_token}`);
    const timeMatch = /^([01]\d|2[0-3]):[0-5]\d$/.test(meAfterPing.data.user.checkinTime);
    assert(meAfterPing.data.user.todayCheckedIn === true && timeMatch, `打卡时间格式正确且符合北京时间 (当前打卡时间: ${meAfterPing.data.user.checkinTime})`);

    // Duplicate check-in on the same day (idempotency)
    const dupPingRes = await request('GET', `/api/v1/ping?token=${userA.device_token}`);
    assert(dupPingRes.status === 200 && dupPingRes.data.alreadyCheckedIn === true, '同一天重复插电打卡返回幂等标记 (alreadyCheckedIn: true)');

    // 4. Circle Creation, Joining & Multi-Member Isolation
    console.log(`\n▶ 测试项 4: 守护圈创建、邀请码加入与多成员互通`);
    const circleRes = await request('POST', '/api/circles', { userId: userA.id, name: '自动化测试家庭圈' });
    assert(circleRes.status === 200 && circleRes.data.circle && circleRes.data.circle.code, 'POST /api/circles 创建守护圈', JSON.stringify(circleRes.data));
    const circle = circleRes.data.circle;

    // Create User B (Friend) via quick-join
    const quickJoinRes = await request('POST', '/api/circles/quick-join', {
      code: circle.code,
      nickname: '测试朋友B',
      deviceType: 'android'
    });
    assert(quickJoinRes.status === 200 && quickJoinRes.data.user && quickJoinRes.data.user.id !== userA.id, 'POST /api/circles/quick-join 亲友自动生成独立账号并加入圈子', JSON.stringify(quickJoinRes.data));
    const userB = quickJoinRes.data.user;

    // Verify Circle Details has both members
    const circleDetails = await request('GET', `/api/circles/${circle.id}`);
    assert(circleDetails.status === 200 && circleDetails.data.circle.members.length === 2, 'GET /api/circles/:id 圈内成员数正确显示为 2 人');

    const memberA = circleDetails.data.circle.members.find(m => m.id === userA.id);
    const memberB = circleDetails.data.circle.members.find(m => m.id === userB.id);
    assert(memberA && memberA.isCheckedIn === true, '圈主状态显示为已打卡 (alive)');
    assert(memberB && memberB.isCheckedIn === false && memberB.status === 'pending', '新加入亲友状态显示为等待打卡 (pending)');

    // Friend B checks in
    const pingB = await request('GET', `/api/v1/ping?token=${userB.device_token}`);
    assert(pingB.status === 200 && pingB.data.status === 'ALIVE', '亲友B 使用专属Token 打卡成功');

    const circleDetailsAfterB = await request('GET', `/api/circles/${circle.id}`);
    const memberBUpdated = circleDetailsAfterB.data.circle.members.find(m => m.id === userB.id);
    assert(memberBUpdated && memberBUpdated.isCheckedIn === true, '亲友B 打卡后圈内状态实时同步为已打卡');

    // 5. Circle Member Management (Removal)
    console.log(`\n▶ 测试项 5: 圈子管理员权限与成员移出`);
    // Non-owner (User B) attempts to remove Owner (User A) -> should fail
    const illegalRemove = await request('DELETE', `/api/circles/${circle.id}/members/${userA.id}?operatorId=${userB.id}`);
    assert(illegalRemove.data.success === false, '非圈主无权限移出成员 (安全权限拦截成功)');

    // Owner (User A) attempts to remove self -> should fail
    const selfRemove = await request('DELETE', `/api/circles/${circle.id}/members/${userA.id}?operatorId=${userA.id}`);
    assert(selfRemove.data.success === false, '圈主不能将自己移出圈子');

    // Owner (User A) removes User B -> should succeed
    const legalRemove = await request('DELETE', `/api/circles/${circle.id}/members/${userB.id}?operatorId=${userA.id}`);
    assert(legalRemove.data.success === true, '圈主成功将指定成员移出圈子');

    const circleDetailsAfterRemove = await request('GET', `/api/circles/${circle.id}`);
    assert(circleDetailsAfterRemove.data.circle.members.length === 1, '成员移出后圈内人数恢复为 1 人');

    // 6. Security & Edge Case Handling
    console.log(`\n▶ 测试项 6: 边界异常与安全防御测试`);
    // Invalid / Non-existent Token
    const invalidPing = await request('GET', '/api/v1/ping?token=non_existent_token_99999');
    assert(invalidPing.status === 404, '不存在的 Token 返回 404 错误而不是崩溃或 500');

    // Empty Token
    const emptyPing = await request('GET', '/api/v1/ping');
    assert(emptyPing.status === 400, '缺少 Token 返回 400 提示参数错误');

    // SQL Injection attempt in Token
    const sqliPing = await request('GET', "/api/v1/ping?token=' OR '1'='1");
    assert(sqliPing.status === 404, "SQL 注入测试: '?token=' OR '1'='1' 安全拦截 (404)");

    // Join with non-existent circle code
    const badCodeJoin = await request('POST', '/api/circles/join', { userId: userA.id, code: '000000' });
    assert(badCodeJoin.data.success === false && badCodeJoin.data.message.includes('未找到'), '无效邀请码返回友好错误提示');

    // Quick-join with non-existent circle code
    const badQuickJoin = await request('POST', '/api/circles/quick-join', { code: '000000', nickname: '路人' });
    assert(badQuickJoin.data.success === false, '无效邀请码快捷加入安全拦截');

    // 7. Alert Logic Test
    console.log(`\n▶ 测试项 7: 超时未打卡警报算法校验`);
    // Create User C with alert_time set to a time in the past (e.g. 08:00)
    const alertUserRes = await request('POST', '/api/user/create-guest', { deviceType: 'ios', nickname: '超时测试者' });
    const userC = alertUserRes.data.user;
    await request('PUT', '/api/user/profile', { userId: userC.id, alert_time: '08:00' });

    const alertCheck = await request('POST', '/api/alerts/check');
    const userCAlert = alertCheck.data.alerts && alertCheck.data.alerts.find(a => a.userId === userC.id);
    assert(alertCheck.status === 200 && !!userCAlert, '对超过设定预警时间且未打卡的用户准确触发超时告警');

    // User C checks in
    await request('GET', `/api/v1/ping?token=${userC.device_token}`);
    // Check circle view status
    const circleC = await request('POST', '/api/circles', { userId: userC.id, name: 'C的圈' });
    const detailsC = await request('GET', `/api/circles/${circleC.data.circle.id}`);
    const memberC = detailsC.data.circle.members.find(m => m.id === userC.id);
    assert(memberC.status === 'alive', '用户打卡后状态立即由告警恢复为 alive');

    // 8. Cleanup test circle
    console.log(`\n▶ 测试完成，输出汇总...`);
    const total = results.length;
    const passed = results.filter(r => r.pass).length;
    const failed = total - passed;
    console.log(`\n===============================================`);
    console.log(`  📊 测试总结: 总计 ${total} 项 | 通过 ${passed} 项 | 失败 ${failed} 项`);
    console.log(`===============================================`);

  } catch (err) {
    console.error('测试运行异常中断:', err);
  }
}

runTests();
