// Read token from URL query or localStorage
const urlParams = new URLSearchParams(window.location.search);
let currentToken = urlParams.get('token') || localStorage.getItem('hzm_user_token');

let currentUser = null;
let currentCircleId = null;
let allCircles = [];

// Initialize app on DOM ready
document.addEventListener('DOMContentLoaded', async () => {
  await initUserSession();
  await loadUserData();

  // Check if invited via URL
  const inviteCode = urlParams.get('invite');
  if (inviteCode) {
    setTimeout(() => {
      document.getElementById('joinCircleCode').value = inviteCode;
      openJoinModal();
    }, 500);
  }

  // Smart auto-polling: refresh status every 6 seconds so charging checkin reflects on screen in real time
  setInterval(() => {
    if (document.visibilityState === 'visible') {
      loadUserData();
    }
  }, 6000);

  // Instant refresh when user switches back to browser tab
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      loadUserData();
    }
  });
});

async function initUserSession() {
  const urlToken = urlParams.get('token');
  if (urlToken) {
    currentToken = urlToken;
    localStorage.setItem('hzm_user_token', currentToken);
    return;
  }

  if (currentToken) {
    return;
  }

  // If visitor has no token at all, create a fresh guest user
  const isAndroid = /Android/i.test(navigator.userAgent);
  const deviceType = isAndroid ? 'android' : 'ios';

  try {
    const res = await fetch('/api/user/create-guest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceType, nickname: '新亲友' })
    });
    const data = await res.json();
    if (data.success && data.user) {
      currentToken = data.user.device_token;
      localStorage.setItem('hzm_user_token', currentToken);
    } else {
      currentToken = 'hzm_demo_me';
    }
  } catch (err) {
    console.error('initUserSession error:', err);
    currentToken = 'hzm_demo_me';
  }
}

// Fetch user data & circles
async function loadUserData() {
  try {
    const res = await fetch(`/api/user/me?token=${currentToken}`);
    const data = await res.json();
    if (!data.success) {
      console.warn('用户不存在，重置为默认用户');
      currentToken = 'hzm_demo_me';
      localStorage.setItem('hzm_user_token', currentToken);
      const retryRes = await fetch(`/api/user/me?token=${currentToken}`);
      const retryData = await retryRes.json();
      if (!retryData.success) return;
      currentUser = retryData.user;
      allCircles = retryData.circles || [];
    } else {
      currentUser = data.user;
      allCircles = data.circles || [];
    }

    // Update Header Profile
    const headerAvatar = document.getElementById('headerAvatar');
    const headerNickname = document.getElementById('headerNickname');
    if (headerAvatar) headerAvatar.textContent = currentUser.avatar || '🧑';
    if (headerNickname) headerNickname.textContent = currentUser.nickname || '我';

    renderMyStatusCard(currentUser);
    renderCircleTabs(allCircles);

    // Default to first circle if any exist
    if (allCircles.length > 0) {
      if (!currentCircleId || !allCircles.some(c => c.id === currentCircleId)) {
        currentCircleId = allCircles[0].id;
      }
      loadCircleDetails(currentCircleId);
    } else {
      currentCircleId = null;
      document.getElementById('circleCodeBox').classList.add('hidden');
      document.getElementById('membersContainer').innerHTML = `
        <div class="p-6 text-center space-y-3">
          <div class="w-12 h-12 rounded-2xl bg-ios-blue/10 text-ios-blue flex items-center justify-center text-xl mx-auto">
            <i class="fa-solid fa-people-roof"></i>
          </div>
          <div class="space-y-1">
            <h4 class="font-semibold text-sm text-ios-label">尚未加入任何守护圈</h4>
            <p class="text-xs text-ios-secondaryLabel leading-relaxed max-w-xs mx-auto">
              创建你的家庭或密友守护圈，把邀请码发给亲友，每天手机只要充上电即可自动互报平安。
            </p>
          </div>
          <div class="flex justify-center space-x-2 pt-1">
            <button onclick="openCreateModal()" class="bg-ios-blue text-white px-4 py-2 rounded-xl text-xs font-semibold hover:bg-blue-600 transition shadow-xs">
              + 创建我的圈子
            </button>
            <button onclick="openJoinModal()" class="bg-ios-bg text-ios-label px-4 py-2 rounded-xl text-xs font-semibold hover:bg-slate-200 transition">
              输入邀请码
            </button>
          </div>
        </div>
      `;
    }

    // Update settings modal inputs
    document.getElementById('settingNickname').value = currentUser.nickname || '';
    document.getElementById('settingAlertTime').value = currentUser.alert_time || '21:00';
    document.getElementById('settingEmergencyName').value = currentUser.emergency_contact_name || '';
    document.getElementById('settingEmergencyPhone').value = currentUser.emergency_contact_phone || '';

    // Update webhook url & Android token in setup modal
    const origin = window.location.origin;
    document.getElementById('myWebhookUrl').value = `${origin}/api/v1/ping?token=${currentUser.device_token}`;
    const androidTokenInput = document.getElementById('myAndroidToken');
    if (androidTokenInput) {
      androidTokenInput.value = currentUser.device_token;
    }

  } catch (err) {
    console.error('loadUserData error:', err);
  }
}

// Render Apple Health/Watch Activity Style Hero Card
function renderMyStatusCard(user) {
  const avatarBox = document.getElementById('userAvatar');
  avatarBox.textContent = user.avatar || '🧑';

  document.getElementById('userName').textContent = `${user.nickname}`;
  document.getElementById('deviceBadge').textContent = user.device_type === 'ios' ? 'iPhone · 充电自动化' : 'Android · 守护伴侣';

  const ring = document.getElementById('statusRing');
  const dot = document.getElementById('statusIndicatorDot');
  const title = document.getElementById('statusTitle');
  const desc = document.getElementById('statusDesc');

  if (user.todayCheckedIn) {
    ring.className = 'w-12 h-12 rounded-2xl bg-ios-green/10 flex items-center justify-center text-2xl border border-ios-green/20';
    dot.className = 'absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-ios-green border-2 border-white status-ring-active';
    
    title.className = 'text-sm font-semibold text-ios-green flex items-center gap-1.5 pt-0.5';
    title.innerHTML = '<i class="fa-solid fa-bolt-lightning text-xs"></i> <span>今日已充上电 (安全)</span>';
    desc.textContent = `今天 ${user.checkinTime} 连接充电器自动打卡 · 全天静默`;
  } else {
    ring.className = 'w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-2xl border border-ios-separator';
    dot.className = 'absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-ios-orange border-2 border-white';
    
    title.className = 'text-sm font-semibold text-ios-secondaryLabel flex items-center gap-1.5 pt-0.5';
    title.innerHTML = '<i class="fa-regular fa-clock text-xs"></i> <span>等待今天连接充电器</span>';
    desc.textContent = `预警截止时间: ${user.alert_time} · 插上电源自动报备`;
  }
}

// Render Apple Segmented Control Tabs
function renderCircleTabs(circles) {
  const container = document.getElementById('circleTabs');
  if (!circles || circles.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = circles.map(c => {
    const isActive = c.id === currentCircleId;
    return `
      <button onclick="selectCircle(${c.id})" class="px-3.5 py-1.5 rounded-lg text-xs transition flex items-center space-x-1.5 shrink-0 ${
        isActive 
          ? 'bg-white text-ios-label shadow-xs font-semibold' 
          : 'text-ios-secondaryLabel hover:text-ios-label font-medium'
      }">
        <span>${c.name}</span>
        <span class="text-[10px] opacity-60 font-mono">(${c.member_count})</span>
      </button>
    `;
  }).join('');
}

function selectCircle(circleId) {
  currentCircleId = circleId;
  renderCircleTabs(allCircles);
  loadCircleDetails(circleId);
}

// Load circle details with members' real-time status
async function loadCircleDetails(circleId) {
  try {
    const res = await fetch(`/api/circles/${circleId}`);
    const data = await res.json();
    if (!data.success) return;

    // Show circle code in the banner
    const codeBox = document.getElementById('circleCodeBox');
    const codeVal = document.getElementById('circleCodeVal');
    if (data.circle && data.circle.code) {
      codeBox.classList.remove('hidden');
      codeVal.textContent = data.circle.code;
      codeBox.setAttribute('data-code', data.circle.code);
    }

    renderMembersList(data.circle);
  } catch (err) {
    console.error('loadCircleDetails error:', err);
  }
}

// Copy current circle code from banner
function copyCurrentCircleCode() {
  const codeBox = document.getElementById('circleCodeBox');
  const code = codeBox.getAttribute('data-code');
  if (code) {
    const inviteText = `我在「活着么」创建了亲友守护圈，邀请码是【${code}】。每天只要手机充上电即可自动互报平安！点击直接加入：${window.location.origin}?invite=${code}`;
    navigator.clipboard.writeText(inviteText);
    alert(`邀请信息已复制到剪贴板！\n可直接粘贴发给微信亲友：\n\n"${inviteText}"`);
  }
}

// Render members card list (Apple Inset Grouped Table Row Style)
function renderMembersList(circle) {
  const container = document.getElementById('membersContainer');
  const members = circle.members || [];
  const isOwner = currentUser && circle.owner_id === currentUser.id;

  if (members.length === 0) {
    container.innerHTML = `
      <div class="text-center py-8 text-ios-secondaryLabel text-xs">
        圈子中还没有其他成员
      </div>
    `;
    return;
  }

  const memberRowsHtml = members.map(m => {
    let statusBadge = '';
    let statusDot = '';

    if (m.status === 'alive') {
      statusBadge = `
        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-ios-green/10 text-ios-green">
          <span class="w-1.5 h-1.5 rounded-full bg-ios-green mr-1.5 status-ring-active"></span>
          已充上电 (${m.checkinTime})
        </span>
      `;
      statusDot = `<span class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-ios-green border-2 border-white"></span>`;
    } else if (m.status === 'pending') {
      statusBadge = `
        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-ios-orange/10 text-ios-orange">
          <span class="w-1.5 h-1.5 rounded-full bg-ios-orange mr-1.5"></span>
          等待充电 (${m.alert_time} 前)
        </span>
      `;
      statusDot = `<span class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-ios-orange border-2 border-white"></span>`;
    } else if (m.status === 'timeout_alert') {
      statusBadge = `
        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-ios-red/10 text-ios-red">
          <span class="w-1.5 h-1.5 rounded-full bg-ios-red mr-1.5 animate-ping"></span>
          全天未充电 (急需联系)
        </span>
      `;
      statusDot = `<span class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-ios-red border-2 border-white animate-pulse"></span>`;
    }

    return `
      <div class="p-3.5 flex items-center justify-between hover:bg-slate-50/80 transition">
        <div class="flex items-center space-x-3">
          <!-- Avatar with subtle status ring -->
          <div class="relative w-10 h-10 rounded-full bg-ios-bg flex items-center justify-center text-xl shrink-0 border border-black/[0.04]">
            ${m.avatar || '🧑'}
            ${statusDot}
          </div>

          <div>
            <div class="flex items-center space-x-1.5">
              <span class="text-xs font-semibold text-ios-label">${m.nickname}</span>
              ${m.id === currentUser.id ? '<span class="text-[9px] bg-ios-blue text-white font-bold px-1.5 py-0.5 rounded-md shadow-2xs">本机 · 我</span>' : ''}
              <span class="text-[10px] text-ios-secondaryLabel">· ${m.device_type === 'ios' ? 'iPhone' : '安卓'}</span>
            </div>
            <div class="mt-1">
              ${statusBadge}
            </div>
          </div>
        </div>

        <div class="flex items-center space-x-2">
          ${m.emergency_contact_phone ? `
            <a href="tel:${m.emergency_contact_phone}" title="联系人: ${m.emergency_contact_name || '紧急联系人'}" class="w-8 h-8 rounded-full bg-ios-bg text-ios-blue flex items-center justify-center hover:bg-ios-blue/10 active:scale-95 transition text-xs">
              <i class="fa-solid fa-phone"></i>
            </a>
          ` : ''}
          ${isOwner && m.id !== currentUser.id ? `
            <button onclick="confirmRemoveMember(${circle.id}, ${m.id}, '${m.nickname}')" class="text-[11px] text-ios-secondaryLabel hover:text-ios-red bg-slate-100 hover:bg-ios-red/10 px-2 py-1 rounded-lg transition font-medium" title="移出该成员">
              移出
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = memberRowsHtml;
}

async function confirmRemoveMember(circleId, memberId, nickname) {
  if (!confirm(`确定要将成员「${nickname}」移出当前守护圈吗？`)) {
    return;
  }
  try {
    const res = await fetch(`/api/circles/${circleId}/members/${memberId}?operatorId=${currentUser.id}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    alert(data.message);
    if (data.success) {
      await loadCircleDetails(circleId);
      await loadUserData();
    }
  } catch (err) {
    alert('操作失败');
  }
}

// Trigger simulated unlock check-in
async function triggerSimulatedUnlock() {
  if (!currentUser) return;
  try {
    const res = await fetch('/api/simulate-checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: currentUser.device_token })
    });
    const result = await res.json();
    
    // Refresh user & circle data
    await loadUserData();

    // Show nice feedback
    alert(`⚡ 手机插上充电器事件模拟成功：\n${result.message}`);
  } catch (err) {
    alert('触发失败');
  }
}

// Trigger timeout check
async function triggerAlertCheck() {
  try {
    const res = await fetch('/api/alerts/check', { method: 'POST' });
    const data = await res.json();
    
    const banner = document.getElementById('alertNoticeBox');
    const msgElem = document.getElementById('alertNoticeMsg');

    if (data.count > 0) {
      const names = data.alerts.map(a => a.nickname).join('、');
      msgElem.innerHTML = `⚠️ 巡检发现：<strong>${names}</strong> 超过设定时间仍未解锁手机，系统已生成模拟微信服务号紧急模板消息！`;
      banner.classList.remove('hidden');
    } else {
      msgElem.innerHTML = `✅ 巡检完成：圈内所有人员体征状态均在正常时限内，暂无超时警报。`;
      banner.classList.remove('hidden');
    }

    // Refresh view
    if (currentCircleId) {
      loadCircleDetails(currentCircleId);
    }
  } catch (err) {
    console.error(err);
  }
}

// Modals management
async function openQrModal() {
  try {
    const res = await fetch('/api/server-info');
    const data = await res.json();
    const url = data.mobileUrl || window.location.href;
    document.getElementById('qrCodeImg').src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(url)}`;
    document.getElementById('qrUrlText').textContent = url;
    document.getElementById('qrModal').classList.remove('hidden');
  } catch (err) {
    document.getElementById('qrUrlText').textContent = window.location.href;
    document.getElementById('qrModal').classList.remove('hidden');
  }
}

function showSetupModal() {
  document.getElementById('setupModal').classList.remove('hidden');
}
function showSettingsModal() {
  document.getElementById('settingsModal').classList.remove('hidden');
}
function openCreateModal() {
  document.getElementById('createModal').classList.remove('hidden');
}
function openJoinModal() {
  document.getElementById('joinModal').classList.remove('hidden');
}
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

function switchSetupTab(platform) {
  const btnIos = document.getElementById('btnTabIos');
  const btnAndroid = document.getElementById('btnTabAndroid');
  const contentIos = document.getElementById('contentIos');
  const contentAndroid = document.getElementById('contentAndroid');

  if (platform === 'ios') {
    btnIos.className = 'flex-1 py-1.5 rounded-lg bg-white text-ios-label shadow-xs transition';
    btnAndroid.className = 'flex-1 py-1.5 rounded-lg text-ios-secondaryLabel hover:text-ios-label transition';
    contentIos.classList.remove('hidden');
    contentAndroid.classList.add('hidden');
  } else {
    btnAndroid.className = 'flex-1 py-1.5 rounded-lg bg-white text-ios-label shadow-xs transition';
    btnIos.className = 'flex-1 py-1.5 rounded-lg text-ios-secondaryLabel hover:text-ios-label transition';
    contentAndroid.classList.remove('hidden');
    contentIos.classList.add('hidden');
  }
}

function copyWebhookUrl() {
  const input = document.getElementById('myWebhookUrl');
  input.select();
  navigator.clipboard.writeText(input.value);
  alert('已复制专属打卡 Webhook 链接！\n前往 iPhone「快捷指令」App 粘贴即可。');
}

function copyAndroidToken() {
  const input = document.getElementById('myAndroidToken');
  input.select();
  navigator.clipboard.writeText(input.value);
  alert('已复制专属设备 Token！\n在安卓守护伴侣 App 中粘贴保存即可。');
}

async function submitCreateCircle() {
  const name = document.getElementById('newCircleName').value.trim();
  if (!name) return alert('请输入圈子名称');

  try {
    const res = await fetch('/api/circles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id, name })
    });
    const data = await res.json();
    if (data.success) {
      closeModal('createModal');
      document.getElementById('newCircleName').value = '';
      currentCircleId = data.circle.id;
      await loadUserData();
      alert(`创建成功！专属邀请码: ${data.circle.code}`);
    }
  } catch (err) {
    alert('创建失败');
  }
}

async function submitJoinCircle() {
  const code = document.getElementById('joinCircleCode').value.trim();
  const nickname = (document.getElementById('joinNickname') ? document.getElementById('joinNickname').value.trim() : '');
  if (!code) return alert('请输入 6 位邀请码');

  try {
    const isAndroid = /Android/i.test(navigator.userAgent);
    const deviceType = isAndroid ? 'android' : 'ios';

    // If current user is 'hzm_demo_me' OR user entered a custom nickname, we use quick-join to create their real independent identity!
    if (currentUser && (currentUser.device_token === 'hzm_demo_me' || nickname)) {
      const res = await fetch('/api/circles/quick-join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          nickname: nickname || '亲友',
          deviceType
        })
      });
      const data = await res.json();
      if (data.success) {
        currentToken = data.user.device_token;
        localStorage.setItem('hzm_user_token', currentToken);
        closeModal('joinModal');
        document.getElementById('joinCircleCode').value = '';
        if (document.getElementById('joinNickname')) document.getElementById('joinNickname').value = '';
        currentCircleId = data.circle.id;
        await loadUserData();
        alert(`🎉 成功加入！\n您已作为「${data.user.nickname}」加入圈子「${data.circle.name}」！\n现在圈内可以互相看到打卡状态了。`);
        return;
      } else {
        alert(data.message || '加入失败');
        return;
      }
    }

    // Otherwise standard join with current user
    const res = await fetch('/api/circles/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id, code })
    });
    const data = await res.json();
    if (data.isOwner) {
      // Owner tried to join their own circle on friend's device
      const friendName = prompt('您当前处于圈主身份（我）。如果是亲友手机，请输入亲友昵称加入：', '亲友');
      if (friendName) {
        const quickRes = await fetch('/api/circles/quick-join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, nickname: friendName, deviceType })
        });
        const quickData = await quickRes.json();
        if (quickData.success) {
          currentToken = quickData.user.device_token;
          localStorage.setItem('hzm_user_token', currentToken);
          closeModal('joinModal');
          document.getElementById('joinCircleCode').value = '';
          currentCircleId = quickData.circle.id;
          await loadUserData();
          alert(`🎉 欢迎加入！\n已成功以「${quickData.user.nickname}」身份加入圈子！`);
          return;
        }
      }
      return;
    }

    if (data.success) {
      closeModal('joinModal');
      document.getElementById('joinCircleCode').value = '';
      currentCircleId = data.circle.id;
      await loadUserData();
      alert(data.message);
    } else {
      alert(data.message || '加入失败');
    }
  } catch (err) {
    alert('网络请求失败');
  }
}

function switchOrResetAccount() {
  if (confirm('确定要退出当前身份吗？\n退出后可重新新建或绑定专属成员账号。')) {
    localStorage.removeItem('hzm_user_token');
    window.location.href = window.location.pathname;
  }
}

async function saveUserSettings() {
  const nickname = document.getElementById('settingNickname').value.trim();
  const alert_time = document.getElementById('settingAlertTime').value;
  const emergency_contact_name = document.getElementById('settingEmergencyName').value.trim();
  const emergency_contact_phone = document.getElementById('settingEmergencyPhone').value.trim();

  try {
    const res = await fetch('/api/user/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUser.id,
        nickname,
        alert_time,
        emergency_contact_name,
        emergency_contact_phone
      })
    });
    const data = await res.json();
    if (data.success) {
      closeModal('settingsModal');
      await loadUserData();
      alert('守护规则设置已保存！');
    }
  } catch (err) {
    alert('保存失败');
  }
}
