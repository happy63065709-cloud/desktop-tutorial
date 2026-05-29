/* ============================================================
   ECLADO Cowork — 메인 앱 JavaScript
   ============================================================ */
'use strict';

/* ─── 파일 첨부 전역 변수 ─── */
let _taskPendingFiles    = [];   // 작업 모달 첨부 대기
let _commentPendingFiles = [];   // 댓글 첨부 대기
let _chatPendingFiles    = [];   // 채팅 첨부 대기
let _emailPendingFiles   = [];   // 이메일 작성 첨부 대기

/* ─── 전역 상태 ─── */
const State = {
  projects: [], tasks: [], members: [], comments: [],
  departments: [], chatRooms: [], messages: [], emails: [], calendarEvents: [],
  currentPage: 'dashboard',
  calendarYear: new Date().getFullYear(),
  calendarMonth: new Date().getMonth(),
  currentTaskId: null, currentProjectId: null, currentRoomId: null, currentEmailId: null,
  currentDeptId: null,
  projectFilter: 'all', taskProjectFilter: 'all', emailFolder: 'inbox', emailSearch: '',
  owner: { id: 'm1', name: '김지훈', role: '오너', email: 'ceo@eclado.kr', dept: '경영팀', phone: '', avatarColor: '#1B3A6B' },
  // 로그인 권한
  loginRole: null, // 'admin1' | 'admin2' | 'member'
  selectedLoginRole: 'admin1',
};

/* ─── 권한 설정 ─── */
// 비밀번호를 JSONBlob 클라우드에 저장 — PC·모바일 모든 기기 동기화
// https://jsonblob.com — 무료, 키 불필요, CORS 허용
const _BLOB_ID   = '019e74d5-2a09-7b67-9cd9-57220ed5a02c';
const _BLOB_URL  = `https://jsonblob.com/api/jsonBlob/${_BLOB_ID}`;
let _credCache   = null; // { admin1, admin2, member }
const CRED_DEFAULTS = { admin1: 'eclado1', admin2: 'eclado2', member: 'eclado' };

// 클라우드에서 비밀번호 로드 (앱 시작 시 1회)
async function loadCredentials() {
  try {
    const res  = await fetch(_BLOB_URL, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    _credCache = {
      admin1: data.admin1 || CRED_DEFAULTS.admin1,
      admin2: data.admin2 || CRED_DEFAULTS.admin2,
      member: data.member || CRED_DEFAULTS.member,
    };
    console.log('[ECLADO] 계정 정보 로드 완료 (클라우드 동기화)');
  } catch(e) {
    console.warn('[ECLADO] 클라우드 로드 실패, 기본값 사용:', e.message);
    _credCache = { ...CRED_DEFAULTS };
  }
  // 구버전 localStorage 잔재 제거
  try { localStorage.removeItem('eclado_credentials'); } catch(_) {}
}

// 현재 캐시된 비밀번호 반환 (동기)
function getCredentials() {
  return _credCache || { ...CRED_DEFAULTS };
}

// 비밀번호 클라우드 저장 + 캐시 갱신 (PC·모바일 즉시 반영)
async function saveCredentials(newValues) {
  const current = getCredentials();
  const payload = {
    admin1: newValues.admin1 !== undefined ? newValues.admin1 : current.admin1,
    admin2: newValues.admin2 !== undefined ? newValues.admin2 : current.admin2,
    member: newValues.member !== undefined ? newValues.member : current.member,
  };
  try {
    const res = await fetch(_BLOB_URL, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body:    JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    _credCache = { ...payload };
    console.log('[ECLADO] 비밀번호 클라우드 저장 완료');
  } catch(e) {
    console.error('[ECLADO] 비밀번호 저장 실패:', e);
    throw e;
  }
}
// 역할별 접근 가능 페이지
const ACCESS_MAP = {
  admin1: ['dashboard','projects','dooray','tasks','departments','members','calendar','messenger','email','leave','admin1','admin2','personal','cloud'],
  admin2: ['dashboard','projects','dooray','tasks','departments','members','calendar','messenger','email','leave','admin2','personal','cloud'],
  member: ['dashboard','projects','dooray','tasks','calendar','messenger','email','leave','personal','cloud'],
};

/* ─── 상수 ─── */
const STATUS_LABEL  = { planning:'계획', in_progress:'진행 중', review:'검토', completed:'완료', on_hold:'보류', todo:'할 일', done:'완료' };
const PRIORITY_LABEL= { low:'낮음', medium:'보통', high:'높음', urgent:'긴급' };
const ROLE_LABEL    = {
  owner:              '오너',
  general:            '총괄',
  planner:            '기획',
  marketer:           '마케터',
  instructor:         '강사',
  overseas_sales:     '해외영업',
  management_support: '경영지원',
  accounting:         '회계',
  designer:           '디자인',
  // 하위 호환 (구 역할값)
  manager:   '매니저',
  developer: '개발자',
  member:    '멤버',
};
const ROLE_LOGIN_LABEL = { admin1:'관리자 1', admin2:'관리자 2', member:'일반 멤버' };
const MONTHS_KR     = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
const AVATAR_COLORS = ['#1B3A6B','#2A5298','#4A90E2','#27AE60','#E67E22','#E74C3C','#8E44AD','#1ABC9C','#F39C12','#16A085','#2980B9','#C0392B'];
const DEPT_COLORS   = ['#1B3A6B','#2A5298','#27AE60','#E67E22','#E74C3C','#8E44AD','#1ABC9C','#F39C12','#16A085'];

/* ─── API ─── */
// 안전한 JSON 파싱 — 서버가 "Internal Server Error" 같은 텍스트를 반환해도 크래시 없이 에러로 처리
async function _apiParseResponse(r) {
  const text = await r.text();
  if (!r.ok) {
    // HTTP 4xx / 5xx → payload 크기 초과 or 서버 오류
    let detail = text.slice(0, 120);
    if (r.status === 413 || text.toLowerCase().includes('too large') || text.toLowerCase().includes('entity')) {
      throw new Error('파일이 너무 큽니다. 더 작은 파일을 사용해 주세요. (서버 용량 초과)');
    }
    throw new Error(`서버 오류 (${r.status}): ${detail}`);
  }
  try {
    return JSON.parse(text);
  } catch(e) {
    // 성공 응답(2xx)인데 JSON이 아닌 경우 — 빈 객체 반환
    console.warn('API 응답 JSON 파싱 실패 (non-JSON body):', text.slice(0, 80));
    return {};
  }
}
const api = {
  async get(t,p='')      { const r=await fetch(`tables/${t}?limit=300${p?'&'+p:''}`); return _apiParseResponse(r); },
  async getOne(t,id)     { const r=await fetch(`tables/${t}/${id}`); return _apiParseResponse(r); },
  async post(t,d)        { const r=await fetch(`tables/${t}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)}); return _apiParseResponse(r); },
  async put(t,id,d)      { const r=await fetch(`tables/${t}/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)}); return _apiParseResponse(r); },
  async patch(t,id,d)    { const r=await fetch(`tables/${t}/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)}); return _apiParseResponse(r); },
  async del(t,id)        { await fetch(`tables/${t}/${id}`,{method:'DELETE'}); },
};

/* ─── 유틸 ─── */
const genId  = () => 'id_'+Math.random().toString(36).slice(2,10)+Date.now().toString(36);
const fmt    = d => { if(!d) return '—'; const x=new Date(d); return isNaN(x)?d:`${x.getFullYear()}. ${x.getMonth()+1}. ${x.getDate()}`; };
const overdue= d => d && new Date(d)<new Date();
const relTime= ts => { const m=Math.floor((Date.now()-ts)/60000); if(m<1)return'방금 전'; if(m<60)return`${m}분 전`; const h=Math.floor(m/60); if(h<24)return`${h}시간 전`; return`${Math.floor(h/24)}일 전`; };
const getMember  = id => State.members.find(m=>m.id===id)||null;
const getProject = id => State.projects.find(p=>p.id===id)||null;
const getDept    = id => State.departments.find(d=>d.id===id)||null;
const avatarEl   = (m,sz='') => m ? `<span class="avatar ${sz}" style="background:${m.avatar_color||'#1B3A6B'}">${m.name.charAt(0)}</span>` : `<span class="avatar ${sz}" style="background:#ccc">?</span>`;
const statusBadge  = s => `<span class="badge badge-${s}">${STATUS_LABEL[s]||s}</span>`;
const priorityBadge= p => `<span class="badge badge-${p}">${PRIORITY_LABEL[p]||p}</span>`;
const emptyState   = (ic,tx) => `<div class="empty-state"><i class="fas fa-${ic}"></i><p>${tx}</p></div>`;

/* ─── 토스트 ─── */
function toast(msg, type='info') {
  const c=document.getElementById('toast-container');
  const el=document.createElement('div'); el.className=`toast toast-${type}`;
  const icon={success:'check-circle',error:'times-circle',warning:'exclamation-triangle'}[type]||'info-circle';
  el.innerHTML=`<i class="fas fa-${icon}"></i> ${msg}`; c.appendChild(el);
  setTimeout(()=>{ el.classList.add('removing'); el.addEventListener('animationend',()=>el.remove()); },3200);
}

/* ============================================================  LOAD ALL  ============================================================ */
async function loadAll() {
  const [proj,tasks,mem,cmt,dept,rooms,msgs,mails,calEvts] = await Promise.all([
    api.get('projects'), api.get('tasks'), api.get('members'), api.get('comments'),
    api.get('departments'), api.get('chat_rooms'), api.get('messages'), api.get('emails'),
    api.get('calendar_events'),
  ]);
  State.projects        = proj.data    ||[];
  State.tasks           = tasks.data   ||[];
  State.members         = mem.data     ||[];
  State.comments        = cmt.data     ||[];
  State.departments     = dept.data    ||[];
  State.chatRooms       = rooms.data   ||[];
  State.messages        = msgs.data    ||[];
  State.emails          = mails.data   ||[];
  State.calendarEvents  = calEvts.data ||[];

  // 전체 조직원 채팅방 없을 경우 자동 생성
  await ensureAllHandsRoom();

  updateSidebarBadges();
  renderCurrentPage();
}

/* 전체 조직원 채팅방 보장 */
async function ensureAllHandsRoom() {
  const exists = State.chatRooms.find(r=>r.id==='room_allhands');
  if (!exists) {
    try {
      const data = {
        id: 'room_allhands',
        name: '전체 조직원',
        type: 'channel',
        members: [],
        last_message: '전체 채널에 오신 것을 환영합니다! 조직원 누구나 참여할 수 있습니다.',
        last_sender_id: 'system',
        icon: '🏢',
      };
      const r = await api.post('chat_rooms', data);
      State.chatRooms.unshift(r);
    } catch(e) {}
  }
}

function updateSidebarBadges() {
  const projBadge = document.getElementById('project-count-badge');
  if(projBadge) projBadge.textContent = State.projects.filter(p=>p.status==='in_progress'||p.status==='planning').length||'';

  const unreadMsgs = State.messages.filter(m=>!( m.read_by||[]).includes(State.owner.id) && m.sender_id!==State.owner.id).length;
  const msgBadge = document.getElementById('msg-unread-badge');
  if(msgBadge) msgBadge.textContent = unreadMsgs||'';

  const unreadEmails = State.emails.filter(e=>!e.is_read && e.folder==='inbox' && e.from_id!==State.owner.id).length;
  const emailBadge = document.getElementById('email-unread-badge');
  if(emailBadge) emailBadge.textContent = unreadEmails||'';
  const inboxCnt = document.getElementById('inbox-count');
  if(inboxCnt) inboxCnt.textContent = unreadEmails||'';
}

/* ============================================================  ROUTING  ============================================================ */
function showPage(name) {
  // 권한 체크
  const allowed = ACCESS_MAP[State.loginRole] || [];
  if (!allowed.includes(name)) {
    toast('접근 권한이 없습니다.', 'error'); return;
  }

  // 사이드바 먼저 닫기 (닫힘과 동시에 페이지 전환 → 흰화면 방지)
  closeSidebar();

  State.currentPage = name;

  // 페이지 전환 (즉각 처리 — 지연 없음)
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById(`page-${name}`);
  if (page) {
    page.classList.add('active');
    // main-content 상단으로 스크롤
    const mc = document.getElementById('main-content');
    if (mc) mc.scrollTop = 0;
  }

  // 네비 active
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const nav = document.querySelector(`.nav-item[data-page="${name}"]`);
  if (nav) nav.classList.add('active');

  // 담당업무 서브메뉴
  if (name === 'dooray') {
    openDooraySubmenu();
  } else {
    closeDooraySubmenu();
  }

  // 모바일 상단 바 타이틀 업데이트
  const pageTitleEl = document.getElementById('mobile-top-title');
  if (pageTitleEl) {
    const span = nav && nav.querySelector('span:not(.nav-badge):not(.nav-leave-badge):not(.nav-admin-badge):not(.nav-chevron)');
    pageTitleEl.textContent = span ? span.textContent : 'ECLADO Cowork';
  }

  renderCurrentPage();
}
function renderCurrentPage() {
  switch(State.currentPage){
    case 'dashboard':   renderDashboard();    break;
    case 'projects':    renderProjects();     break;
    case 'dooray':      renderDooray();       break;
    case 'tasks':       renderKanban();       break;
    case 'departments': renderDepartments();  break;
    case 'members':     renderMembers();      break;
    case 'calendar':    renderCalendar();     break;
    case 'messenger':   renderMessenger();    break;
    case 'email':       renderEmail();        break;
    case 'admin1':      renderAdminPage(1);   break;
    case 'admin2':      renderAdminPage(2);   break;
    case 'leave':       renderLeave();        break;
    case 'cloud':       initCloudPage();      break;
    case 'personal':    initPersonalPage();   break;
  }
}

/* 사이드바 nav-item 권한에 따라 dim 처리 + visibility 복원 */
function applySidebarPermissions() {
  // 사이드바·헤더 visibility 복원 (로그인 후 CSS :has() 규칙 해제 보완)
  const sidebar = document.getElementById('sidebar');
  const topBar  = document.getElementById('mobile-top-bar');
  const toggle  = document.getElementById('sidebar-toggle');
  if (sidebar) sidebar.style.visibility = 'visible';
  if (topBar)  topBar.style.visibility  = 'visible';
  if (toggle)  toggle.style.visibility  = 'visible';

  const allowed = ACCESS_MAP[State.loginRole] || [];
  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    const page = el.dataset.page;
    if (!allowed.includes(page)) {
      el.style.opacity = '0.35';
      el.style.pointerEvents = 'none';
      el.title = '접근 권한 없음';
    } else {
      el.style.opacity = '';
      el.style.pointerEvents = '';
      el.title = '';
    }
  });
}

/* ============================================================  DASHBOARD  ============================================================ */
function renderDashboard() {
  const ownerEl = document.getElementById('dash-greeting');
  if(ownerEl) ownerEl.textContent=`안녕하세요, ${State.owner.name} 님 👋`;

  document.getElementById('stat-total-projects').textContent = State.projects.length;
  document.getElementById('stat-total-tasks').textContent    = State.tasks.length;
  document.getElementById('stat-done-tasks').textContent     = State.tasks.filter(t=>t.status==='done').length;
  document.getElementById('stat-total-members').textContent  = State.members.length;

  const activeProjs = State.projects.filter(p=>p.status!=='completed'&&p.status!=='on_hold').slice(0,5);
  document.getElementById('dashboard-projects-list').innerHTML = activeProjs.length
    ? activeProjs.map(p=>`
        <div class="dash-project-item" onclick="openProjectDetail('${p.id}')">
          <div class="dash-proj-info">
            <div class="dash-proj-name">${p.title}</div>
            <div class="progress-bar-wrap"><div class="progress-bar" style="width:${p.progress||0}%"></div></div>
            <div class="dash-proj-meta">${p.progress||0}% 완료 · ${fmt(p.end_date)} 마감</div>
          </div>
          ${statusBadge(p.status)}
        </div>`).join('')
    : emptyState('folder-open','진행 중인 프로젝트가 없습니다');

  const myTasks = State.tasks.filter(t=>t.assignee_id===State.owner.id).slice(0,6);
  document.getElementById('dashboard-tasks-list').innerHTML = myTasks.length
    ? myTasks.map(t=>`
        <div class="dash-task-item" onclick="openTaskDetail('${t.id}')">
          <div class="task-check ${t.status==='done'?'done':''}"></div>
          <div class="dash-task-info">
            <div class="dash-task-name ${t.status==='done'?'done':''}">${t.title}</div>
            <div class="dash-task-meta">${getProject(t.project_id)?.title||'—'} · ${fmt(t.due_date)}</div>
          </div>
          ${priorityBadge(t.priority)}
        </div>`).join('')
    : emptyState('tasks','할당된 작업이 없습니다');

  renderActivityFeed();
}

function renderActivityFeed() {
  const acts = State.tasks.slice(0,8).map((t,i)=>{
    const m = getMember(t.assignee_id);
    const msgs = [
      `<strong>${t.title}</strong> 작업을 <strong>${STATUS_LABEL[t.status]}</strong> 상태로 변경했습니다.`,
      `<strong>${getProject(t.project_id)?.title||'프로젝트'}</strong>에 작업을 추가했습니다.`,
      `<strong>${t.title}</strong> 작업에 댓글을 남겼습니다.`,
    ];
    return { member:m, text:msgs[i%3], time: relTime(Date.now()-(i+1)*7200000) };
  });
  document.getElementById('dashboard-activity').innerHTML = acts.length
    ? `<div class="activity-list">${acts.map(a=>`
        <div class="activity-item">
          ${avatarEl(a.member,'avatar-sm')}
          <div class="activity-text"><strong>${a.member?.name||'알 수 없음'}</strong> ${a.text}</div>
          <span class="activity-time">${a.time}</span>
        </div>`).join('')}</div>`
    : emptyState('stream','최근 활동이 없습니다');
}

/* ============================================================
   PROJECTS — 담당직원 · 노트 · 파일 · 이력
   ============================================================ */

/* ── 프로젝트 목록 렌더링 ── */
function renderProjects() {
  const grid   = document.getElementById('projects-grid');
  const search = (document.getElementById('project-search')?.value||'').toLowerCase();
  let list = State.projects;
  if(State.projectFilter!=='all') list=list.filter(p=>p.status===State.projectFilter);
  if(search) list=list.filter(p=>p.title.toLowerCase().includes(search)||(p.description||'').toLowerCase().includes(search));
  if(!list.length){ grid.innerHTML=`<div style="grid-column:1/-1">${emptyState('folder-open','조건에 맞는 프로젝트가 없습니다.')}</div>`; return; }
  grid.innerHTML = list.map(p=>{
    const avatars = (p.members||[]).slice(0,4).map(mid=>{ const m=getMember(mid); return m?`<span class="avatar avatar-sm" style="background:${m.avatar_color||'#1B3A6B'}" title="${m.name}">${m.name.charAt(0)}</span>`:''; }).join('');
    const extraCount = (p.members||[]).length > 4 ? `<span class="avatar avatar-sm" style="background:#9AAAC0;font-size:10px">+${(p.members||[]).length-4}</span>` : '';
    const tags = (p.tags||[]).map(t=>`<span class="tag-chip">${t}</span>`).join('');
    return `
    <article class="project-card priority-${p.priority}" onclick="openProjectDetail('${p.id}')">
      <div class="project-card-header"><h3 class="project-title">${p.title}</h3><div class="project-card-badges">${statusBadge(p.status)}${priorityBadge(p.priority)}</div></div>
      ${p.description?`<p class="project-desc">${p.description}</p>`:''}
      <div class="project-progress">
        <div class="progress-label"><span>진행률</span><span class="progress-pct">${p.progress||0}%</span></div>
        <div class="progress-bar-wrap"><div class="progress-bar" style="width:${p.progress||0}%"></div></div>
      </div>
      ${tags?`<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px">${tags}</div>`:''}
      <div class="project-footer"><div class="member-avatars">${avatars}${extraCount}</div><span class="project-dates"><i class="fas fa-calendar-alt"></i>${fmt(p.start_date)} ~ ${fmt(p.end_date)}</span></div>
    </article>`;
  }).join('');
}

/* ── 프로젝트 상세 모달 열기 ── */
async function openProjectDetail(id) {
  const p = getProject(id); if(!p) return;
  State.currentProjectId = id;
  const projTasks = State.tasks.filter(t=>t.project_id===id);
  const mems = (p.members||[]).map(mid=>getMember(mid)).filter(Boolean);

  // 헤더 정보
  document.getElementById('modal-proj-detail-title').textContent = p.title;
  document.getElementById('proj-detail-status-badge').innerHTML   = statusBadge(p.status);
  document.getElementById('proj-detail-priority-badge').innerHTML = priorityBadge(p.priority);

  // 버튼
  document.getElementById('btn-delete-project').onclick = ()=>deleteProject(id);
  document.getElementById('btn-edit-project').onclick   = ()=>openProjectEdit(id);

  // 탭 초기화
  document.querySelectorAll('.proj-tab-btn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.proj-tab-panel').forEach(p=>p.classList.remove('active'));
  document.querySelector('.proj-tab-btn[data-tab="overview"]').classList.add('active');
  document.getElementById('proj-tab-overview').classList.add('active');

  // ── 개요 탭 내용 ──
  document.getElementById('project-detail-body').innerHTML = `
    ${p.description?`<p style="font-size:14px;color:var(--text-secondary);line-height:1.7;margin-bottom:18px">${escHtml(p.description)}</p>`:''}
    <div class="task-detail-section"><h4>프로젝트 정보</h4>
      <div class="task-detail-meta">
        <div class="detail-meta-item"><span class="detail-meta-label">시작일</span><span>${fmt(p.start_date)}</span></div>
        <div class="detail-meta-item"><span class="detail-meta-label">마감일</span><span>${fmt(p.end_date)}</span></div>
        <div class="detail-meta-item"><span class="detail-meta-label">담당 직원</span><span>${mems.length}명</span></div>
        <div class="detail-meta-item"><span class="detail-meta-label">작업 수</span><span>${projTasks.length}개</span></div>
        <div class="detail-meta-item"><span class="detail-meta-label">완료 작업</span><span>${projTasks.filter(t=>t.status==='done').length}개</span></div>
      </div>
    </div>
    <div class="task-detail-section"><h4>진행률</h4>
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:5px"><span>전체</span><strong>${p.progress||0}%</strong></div>
      <div class="progress-bar-wrap"><div class="progress-bar" style="width:${p.progress||0}%"></div></div>
    </div>
    <div class="task-detail-section"><h4>담당 직원 (${mems.length}명)</h4>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${mems.map(m=>`<div class="proj-member-chip">${avatarEl(m,'avatar-sm')} ${escHtml(m.name)} <small style="color:var(--text-muted)">${ROLE_LABEL[m.role]||m.role}</small></div>`).join('')||'<p style="color:var(--text-muted);font-size:13px">담당 직원 없음</p>'}</div>
    </div>
    <div class="task-detail-section"><h4>작업 목록 (${projTasks.length})</h4>
      <div class="proj-task-list">${projTasks.map(t=>`
        <div class="proj-task-item" onclick="openTaskDetail('${t.id}');closeModal('modal-project-detail')">
          <span class="col-dot ${t.status==='done'?'dot-green':t.status==='in_progress'?'dot-blue':t.status==='review'?'dot-yellow':'dot-gray'}"></span>
          <span class="proj-task-title">${escHtml(t.title)}</span>${priorityBadge(t.priority)}${statusBadge(t.status)}
        </div>`).join('')||emptyState('tasks','작업이 없습니다')}</div>
    </div>`;

  // ── 담당 직원 탭 ──
  renderProjMemberPanel(id);

  // ── 노트 탭 ──
  document.getElementById('proj-note-input').value = '';
  await loadAndRenderProjNotes(id);

  // ── 파일 탭 ──
  await loadAndRenderProjFiles(id);

  // ── 이력 탭 ──
  await loadAndRenderProjHistory(id);

  openModal('modal-project-detail');
  // 드롭존 초기화 — 매번 새로 바인딩 (중복 방지 플래그 리셋)
  const oldZone = document.getElementById('proj-file-drop-zone');
  if (oldZone) {
    oldZone._projDropInited = false;
    // 기존 리스너 완전 제거를 위해 cloneNode 사용
    const newZone = oldZone.cloneNode(true);
    oldZone.parentNode.replaceChild(newZone, oldZone);
  }
  setTimeout(initProjFileDrop, 150);

  // 탭 전환 이벤트
  document.querySelectorAll('.proj-tab-btn').forEach(btn=>{
    btn.onclick = () => {
      document.querySelectorAll('.proj-tab-btn').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('.proj-tab-panel').forEach(p=>p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`proj-tab-${btn.dataset.tab}`).classList.add('active');
    };
  });
}

/* ── HTML 이스케이프 유틸 ── */
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── 담당 직원 탭 패널 렌더 ── */
function renderProjMemberPanel(id) {
  const p = getProject(id); if(!p) return;
  const mems = (p.members||[]).map(mid=>getMember(mid)).filter(Boolean);
  const list = document.getElementById('proj-member-panel-list');
  if(!list) return;
  list.innerHTML = mems.length
    ? mems.map(m=>`
      <div class="proj-member-chip-lg">
        ${avatarEl(m,'avatar-sm')}
        <div class="member-info">
          <div class="member-name">${escHtml(m.name)}</div>
          <div class="member-meta">${m.department||'—'} · ${ROLE_LABEL[m.role]||m.role}</div>
        </div>
        <button class="btn-remove-mem" onclick="removeProjMember('${id}','${m.id}')"><i class="fas fa-times"></i> 제거</button>
      </div>`).join('')
    : `<div style="color:var(--text-muted);font-size:13px;padding:20px;text-align:center"><i class="fas fa-user-slash" style="font-size:24px;display:block;margin-bottom:8px"></i>담당 직원이 없습니다</div>`;
}

/* ── 담당 직원 편집 모달 열기 ── */
function openProjMemberEditor() {
  const p = getProject(State.currentProjectId); if(!p) return;
  _projMeSelected = [...(p.members||[])];
  renderProjMeList();
  renderProjMeSelectedList();
  openModal('modal-proj-member-edit');
}
let _projMeSelected = [];

function renderProjMeList() {
  const search = (document.getElementById('proj-me-search')?.value||'').toLowerCase();
  const list   = document.getElementById('proj-me-list'); if(!list) return;
  const mems   = State.members.filter(m=> !search || m.name.toLowerCase().includes(search) || (m.department||'').toLowerCase().includes(search));
  list.innerHTML = mems.map(m=>{
    const sel = _projMeSelected.includes(m.id);
    return `<div class="proj-member-item ${sel?'selected':''}" onclick="toggleProjMeItem('${m.id}')">
      <div class="pm-check"></div>
      ${avatarEl(m,'avatar-sm')}
      <div style="flex:1">
        <div style="font-weight:600">${escHtml(m.name)}</div>
        <div style="font-size:11px;color:var(--text-muted)">${m.department||'—'} · ${ROLE_LABEL[m.role]||m.role}</div>
      </div>
    </div>`;
  }).join('') || '<div style="padding:20px;text-align:center;color:var(--text-muted)">팀원이 없습니다</div>';
}

function filterProjMeList() { renderProjMeList(); }

function toggleProjMeItem(memberId) {
  const idx = _projMeSelected.indexOf(memberId);
  if(idx === -1) _projMeSelected.push(memberId);
  else _projMeSelected.splice(idx, 1);
  renderProjMeList();
  renderProjMeSelectedList();
}

function renderProjMeSelectedList() {
  const el = document.getElementById('proj-me-selected-list'); if(!el) return;
  el.innerHTML = _projMeSelected.length
    ? _projMeSelected.map(mid=>{
        const m = getMember(mid);
        return m ? `<span class="proj-selected-chip">${avatarEl(m,'avatar-sm')} ${escHtml(m.name)}<button onclick="toggleProjMeItem('${m.id}')">✕</button></span>` : '';
      }).join('')
    : '<span style="font-size:12px;color:var(--text-muted)">선택된 직원 없음</span>';
}

async function saveProjMembers() {
  const p = getProject(State.currentProjectId); if(!p) return;
  const oldMems = [...(p.members||[])];
  try {
    const updated = await api.put('projects', p.id, { ...p, members: _projMeSelected });
    const idx = State.projects.findIndex(x=>x.id===p.id);
    if(idx!==-1) State.projects[idx] = { ...State.projects[idx], members: _projMeSelected };

    // 이력 기록: 추가된 멤버
    const added   = _projMeSelected.filter(id=>!oldMems.includes(id));
    const removed = oldMems.filter(id=>!_projMeSelected.includes(id));
    for(const mid of added) {
      const m = getMember(mid);
      await addProjHistory(p.id, 'member_add', '', '', m?.name||mid, `${m?.name||'직원'} 님을 담당 직원으로 추가했습니다.`);
    }
    for(const mid of removed) {
      const m = getMember(mid);
      await addProjHistory(p.id, 'member_remove', '', m?.name||mid, '', `${m?.name||'직원'} 님을 담당 직원에서 제거했습니다.`);
    }

    closeModal('modal-proj-member-edit');
    toast('담당 직원이 저장되었습니다.', 'success');
    renderProjMemberPanel(p.id);
    renderProjects();
    await loadAndRenderProjHistory(p.id);
  } catch(e) { toast('저장 오류', 'error'); }
}

async function removeProjMember(projId, memberId) {
  const p = getProject(projId); if(!p) return;
  const m = getMember(memberId);
  if(!confirm(`${m?.name||'직원'} 님을 담당 직원에서 제거하시겠습니까?`)) return;
  const newMems = (p.members||[]).filter(id=>id!==memberId);
  try {
    await api.put('projects', projId, { ...p, members: newMems });
    const idx = State.projects.findIndex(x=>x.id===projId);
    if(idx!==-1) State.projects[idx] = { ...State.projects[idx], members: newMems };
    await addProjHistory(projId, 'member_remove', '', m?.name||memberId, '', `${m?.name||'직원'} 님을 담당 직원에서 제거했습니다.`);
    toast('제거되었습니다.', 'success');
    renderProjMemberPanel(projId);
    renderProjects();
    await loadAndRenderProjHistory(projId);
  } catch(e) { toast('오류가 발생했습니다.', 'error'); }
}

/* ── 새 프로젝트 모달 직원 선택 ── */
let _projCreateSelected = [];

/* ── 프로젝트 설명란 파일 첨부 전역 상태 ── */
let _projDescPendingFiles = [];

function openNewProjectModal() {
  _projCreateSelected = [];
  _projDescPendingFiles = [];
  document.getElementById('proj-id').value = '';
  document.getElementById('modal-project-title').innerHTML = '<i class="fas fa-folder-plus" style="color:var(--primary)"></i> 새 프로젝트';
  ['proj-title','proj-desc','proj-start','proj-end','proj-tags'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('proj-status').value   = 'planning';
  document.getElementById('proj-priority').value = 'medium';
  const prev = document.getElementById('proj-desc-preview');
  if(prev) prev.innerHTML = '';
  renderProjCreateMemberList();
  renderProjCreateSelectedChips();
  initProjDescDrop();
  openModal('modal-project');
}

function renderProjCreateMemberList() {
  const search = (document.getElementById('proj-member-search')?.value||'').toLowerCase();
  const list   = document.getElementById('proj-member-list'); if(!list) return;
  const mems   = State.members.filter(m=> !search || m.name.toLowerCase().includes(search) || (m.department||'').toLowerCase().includes(search));
  list.innerHTML = mems.map(m=>{
    const sel = _projCreateSelected.includes(m.id);
    return `<div class="proj-member-item ${sel?'selected':''}" onclick="toggleProjCreateMember('${m.id}')">
      <div class="pm-check"></div>
      ${avatarEl(m,'avatar-sm')}
      <div style="flex:1">
        <div style="font-weight:600">${escHtml(m.name)}</div>
        <div style="font-size:11px;color:var(--text-muted)">${m.department||'—'} · ${ROLE_LABEL[m.role]||m.role}</div>
      </div>
    </div>`;
  }).join('') || '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:12px">등록된 팀원이 없습니다</div>';
}

function filterProjMemberList() { renderProjCreateMemberList(); }

function toggleProjCreateMember(memberId) {
  const idx = _projCreateSelected.indexOf(memberId);
  if(idx === -1) _projCreateSelected.push(memberId);
  else _projCreateSelected.splice(idx, 1);
  renderProjCreateMemberList();
  renderProjCreateSelectedChips();
}

function renderProjCreateSelectedChips() {
  const el = document.getElementById('proj-selected-members'); if(!el) return;
  el.innerHTML = _projCreateSelected.map(mid=>{
    const m = getMember(mid);
    return m ? `<span class="proj-selected-chip">${avatarEl(m,'avatar-sm')} ${escHtml(m.name)}<button onclick="toggleProjCreateMember('${m.id}')">✕</button></span>` : '';
  }).join('') || '';
}

/* ── 프로젝트 편집 모달 열기 ── */
function openProjectEdit(id) {
  const p = getProject(id); if(!p) return;
  _projCreateSelected = [...(p.members||[])];
  _projDescPendingFiles = [];
  document.getElementById('proj-id').value = p.id;
  document.getElementById('modal-project-title').innerHTML = '<i class="fas fa-edit" style="color:var(--accent-orange)"></i> 프로젝트 편집';
  document.getElementById('proj-title').value    = p.title||'';
  document.getElementById('proj-desc').value     = p.description||'';
  document.getElementById('proj-status').value   = p.status||'planning';
  document.getElementById('proj-priority').value = p.priority||'medium';
  document.getElementById('proj-start').value    = p.start_date||'';
  document.getElementById('proj-end').value      = p.end_date||'';
  document.getElementById('proj-tags').value     = (p.tags||[]).join(', ');
  const prev = document.getElementById('proj-desc-preview');
  if(prev) prev.innerHTML = '';
  renderProjCreateMemberList();
  renderProjCreateSelectedChips();
  initProjDescDrop();
  openModal('modal-project');
}

/* ── 프로젝트 저장 (신규/수정) ── */
async function saveProject() {
  const title = document.getElementById('proj-title').value.trim();
  if(!title){ toast('프로젝트 이름을 입력하세요.','error'); return; }
  const btn = document.getElementById('btn-save-project');
  btn.disabled=true; btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> 저장 중...';

  const existingId = document.getElementById('proj-id').value;
  const data = {
    title,
    description: document.getElementById('proj-desc').value.trim(),
    status:      document.getElementById('proj-status').value,
    priority:    document.getElementById('proj-priority').value,
    start_date:  document.getElementById('proj-start').value,
    end_date:    document.getElementById('proj-end').value,
    tags:        document.getElementById('proj-tags').value.split(',').map(t=>t.trim()).filter(Boolean),
    members:     _projCreateSelected,
    progress:    existingId ? (getProject(existingId)?.progress||0) : 0,
  };

  try {
    if(existingId) {
      // 수정
      const old = getProject(existingId);
      const r = await api.put('projects', existingId, { ...data, id: existingId });
      const idx = State.projects.findIndex(x=>x.id===existingId);
      if(idx!==-1) State.projects[idx] = r;
      // 설명란 첨부 파일 업로드
      if(_projDescPendingFiles.length > 0) await uploadProjDescFiles(existingId);
      // 이력 기록
      const fields = [
        ['title','제목'],['description','설명'],['status','상태'],['priority','우선순위'],
        ['start_date','시작일'],['end_date','마감일']
      ];
      for(const [f,label] of fields) {
        if(String(old[f]||'') !== String(data[f]||'')) {
          await addProjHistory(existingId,'update',label,
            f==='status'?STATUS_LABEL[old[f]]||old[f]:old[f]||'—',
            f==='status'?STATUS_LABEL[data[f]]||data[f]:data[f]||'—',
            `"${label}" 항목이 변경되었습니다.`);
        }
      }
      closeModal('modal-project'); toast('프로젝트가 수정되었습니다.','success');
    } else {
      // 신규
      data.id = genId();
      const r = await api.post('projects', data);
      State.projects.push(r);
      // 설명란 첨부 파일 업로드
      if(_projDescPendingFiles.length > 0) await uploadProjDescFiles(r.id);
      await addProjHistory(r.id,'create','','',title,`프로젝트 "${title}"이 생성되었습니다.`);
      closeModal('modal-project'); toast('프로젝트가 생성되었습니다! 🎉','success');
    }
    _projDescPendingFiles = [];
    updateSidebarBadges(); renderCurrentPage();
  } catch(e){ toast('저장 중 오류가 발생했습니다.','error'); }
  finally{ btn.disabled=false; btn.innerHTML='<i class="fas fa-save"></i> 저장'; }
}

async function deleteProject(id) {
  if(!confirm('이 프로젝트를 삭제하시겠습니까?\n관련 노트와 파일 이력도 삭제됩니다.')) return;
  const p = getProject(id); if(!p) return;
  try {
    await api.del('projects',p.id);
    State.projects = State.projects.filter(pr=>pr.id!==id);
    closeModal('modal-project-detail'); toast('프로젝트가 삭제되었습니다.','success');
    updateSidebarBadges(); renderCurrentPage();
  } catch(e) { toast('삭제 오류','error'); }
}

/* ══════════════════════════════════════
   프로젝트 노트
   ══════════════════════════════════════ */
async function loadAndRenderProjNotes(projId) {
  try {
    const res = await api.get('project_notes', `search=${projId}`);
    const notes = (res.data||[]).filter(n=>n.project_id===projId).sort((a,b)=>(b.created_at||0)-(a.created_at||0));
    renderProjNotesList(notes);
  } catch(e) { document.getElementById('proj-notes-list').innerHTML = '<div style="color:var(--text-muted);font-size:12px">노트 로드 실패</div>'; }
}

function renderProjNotesList(notes) {
  const el = document.getElementById('proj-notes-list'); if(!el) return;
  el.innerHTML = notes.length
    ? notes.map(n=>`
      <div class="proj-note-item${n.pinned?' pinned':''}" id="pnote-${n.id}">
        <div class="proj-note-meta">
          <span class="proj-note-author"><i class="fas fa-user-circle"></i> ${escHtml(n.author_name||'알 수 없음')}</span>
          <span class="proj-note-time">${relTime(n.created_at||Date.now())}</span>
          ${n.pinned?'<span style="font-size:10px;background:#fef3e2;color:#E67E22;padding:1px 6px;border-radius:4px;font-weight:600">📌 고정</span>':''}
        </div>
        <div class="proj-note-content">${escHtml(n.content)}</div>
        <div class="proj-note-actions">
          <button class="proj-note-del-btn" onclick="deleteProjectNote('${n.id}','${n.project_id}')"><i class="fas fa-trash"></i> 삭제</button>
        </div>
      </div>`).join('')
    : '<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:30px"><i class="fas fa-sticky-note" style="font-size:24px;display:block;margin-bottom:8px;opacity:.4"></i>노트가 없습니다. 첫 노트를 추가해보세요!</div>';
}

async function saveProjectNote() {
  const content = document.getElementById('proj-note-input').value.trim();
  if(!content) { toast('내용을 입력하세요.','warning'); return; }
  const projId = State.currentProjectId;
  try {
    const data = {
      id: genId(), project_id: projId,
      content, author_id: State.owner.id, author_name: State.owner.name, pinned: false
    };
    await api.post('project_notes', data);
    document.getElementById('proj-note-input').value = '';
    await addProjHistory(projId,'note_add','','',content.slice(0,50),'노트가 추가되었습니다.');
    toast('노트가 추가되었습니다.','success');
    await loadAndRenderProjNotes(projId);
    await loadAndRenderProjHistory(projId);
  } catch(e) { toast('저장 오류','error'); }
}

async function deleteProjectNote(noteId, projId) {
  if(!confirm('이 노트를 삭제하시겠습니까?')) return;
  try {
    await api.del('project_notes', noteId);
    await addProjHistory(projId,'note_add','','','','노트가 삭제되었습니다.');
    toast('삭제되었습니다.','success');
    await loadAndRenderProjNotes(projId);
    await loadAndRenderProjHistory(projId);
  } catch(e) { toast('삭제 오류','error'); }
}

/* ══════════════════════════════════════
   프로젝트 파일
   ══════════════════════════════════════ */
async function loadAndRenderProjFiles(projId) {
  try {
    const res = await api.get('project_files', `search=${projId}`);
    const files = (res.data||[]).filter(f=>f.project_id===projId).sort((a,b)=>(b.created_at||0)-(a.created_at||0));
    renderProjFilesList(files);
  } catch(e) { document.getElementById('proj-files-list').innerHTML = '<div style="color:var(--text-muted);font-size:12px">파일 목록 로드 실패</div>'; }
}

function renderProjFilesList(files) {
  const el = document.getElementById('proj-files-list'); if(!el) return;
  el.innerHTML = files.length
    ? `<div class="proj-files-header" style="font-size:12px;font-weight:700;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:.4px">
         <i class="fas fa-paperclip"></i> 첨부 파일 ${files.length}개
       </div>` +
      files.map(f=>{
        const isImg = (f.file_type||'').startsWith('image') || f.file_type === 'image';
        const isVid = (f.file_type||'').startsWith('video') || f.file_type === 'video';
        const mimeType = isImg ? 'image/' : isVid ? 'video/' : '';
        let thumbHtml = '';
        if (isImg && f.data_url) {
          thumbHtml = `<img src="${f.data_url}" class="proj-file-thumb" alt="${escHtml(f.file_name||'')}" onclick="openLightbox('${f.data_url}')" style="cursor:pointer;object-fit:cover;width:44px;height:44px;border-radius:6px;flex-shrink:0">`;
        } else {
          const icon = getFileIcon(mimeType || (f.file_name||''));
          thumbHtml = `<div class="proj-file-icon-wrap" style="width:44px;height:44px;border-radius:6px;background:var(--primary-light);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:20px;color:var(--primary)"><i class="fas ${icon}"></i></div>`;
        }
        const dlBtn = f.data_url
          ? `<a href="${f.data_url}" download="${escHtml(f.file_name||'파일')}" class="proj-file-dl-btn btn btn-ghost btn-sm" title="다운로드"><i class="fas fa-download"></i> 받기</a>`
          : '';
        // 댓글 수 뱃지
        let cmtCount = 0;
        try { cmtCount = JSON.parse(f.file_comments||'[]').length; } catch(e){}
        const cmtBadge = cmtCount > 0 ? `<span class="file-cmt-badge">${cmtCount}</span>` : '';
        return `<div class="proj-file-item" id="pfile-${f.id}">
          ${thumbHtml}
          <div class="proj-file-info">
            <div class="proj-file-name" title="${escHtml(f.file_name||'')}">${escHtml(f.file_name||'파일')}</div>
            <div class="proj-file-meta">${f.file_size||''} · ${escHtml(f.uploader_name||'')} · ${relTime(f.created_at||Date.now())}</div>
            ${f.file_desc ? `<div class="proj-file-desc">${escHtml(f.file_desc)}</div>` : ''}
          </div>
          <div class="proj-file-actions">
            ${dlBtn}
            <button class="btn btn-ghost btn-sm file-detail-btn" onclick="openFileDetailModal('project_files','${f.id}','${f.project_id}')" title="상세/수정/댓글">
              <i class="fas fa-comment-alt"></i>${cmtBadge}
            </button>
            <button class="proj-file-del-btn btn btn-danger btn-sm" onclick="deleteProjectFile('${f.id}','${f.project_id}')" title="삭제"><i class="fas fa-trash"></i></button>
          </div>
        </div>`;
      }).join('')
    : '<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:30px"><i class="fas fa-paperclip" style="font-size:28px;display:block;margin-bottom:10px;opacity:.3"></i>첨부 파일이 없습니다.<br><small style="font-size:11px">위 영역에 파일을 드래그하거나 클릭하여 업로드하세요</small></div>';
}

function handleProjFileUpload(event) {
  const files = Array.from(event.target.files);
  if(!files.length) return;
  files.forEach(file => uploadProjFile(file));
  event.target.value = '';
}

async function uploadProjFile(file) {
  const MAX = 100 * 1024 * 1024;
  if (file.size > MAX) { toast(`⚠️ ${file.name}: 파일 크기가 100MB를 초과합니다.`, 'error'); return; }
  const projId = State.currentProjectId;
  if (!projId) { toast('프로젝트 ID를 찾을 수 없습니다.', 'error'); return; }

  if (file.size > 2 * 1024 * 1024) {
    toast(`⏳ "${file.name}" (${fmtSize(file.size)}) 변환 중...`, 'info');
  }

  try {
    const dataUrl = await compressFileForUpload(file);
    const isImg  = file.type.startsWith('image/');
    const isVid  = file.type.startsWith('video/');
    const sizeStr = fmtSize(file.size);
    const payload = {
      id:           genId(),
      project_id:   projId,
      file_name:    file.name,
      file_type:    isImg ? 'image' : isVid ? 'video' : 'document',
      file_size:    sizeStr,
      data_url:     dataUrl,
      uploader_id:  State.owner.id   || 'm1',
      uploader_name: State.owner.name || '—',
    };
    const result = await api.post('project_files', payload);
    if (!result || result.error) throw new Error(result?.error || '저장 실패');
    toast(`✅ "${file.name}" (${sizeStr}) 업로드 완료!`, 'success');
    await addProjHistory(projId, 'file_upload', '', '', file.name, `"${file.name}" 파일이 업로드되었습니다.`);
    await loadAndRenderProjFiles(projId);
    await loadAndRenderProjHistory(projId);
  } catch(e) {
    console.error('프로젝트 파일 업로드 실패:', file.name, e);
    toast(`❌ "${file.name}" 업로드 실패 — ${e.message||'오류'}`, 'error');
  }
}

async function deleteProjectFile(fileId, projId) {
  if(!confirm('이 파일을 삭제하시겠습니까?')) return;
  try {
    await api.del('project_files', fileId);
    await addProjHistory(projId,'file_upload','','','','파일이 삭제되었습니다.');
    toast('삭제되었습니다.','success');
    await loadAndRenderProjFiles(projId);
    await loadAndRenderProjHistory(projId);
  } catch(e) { toast('삭제 오류','error'); }
}

// 드래그 앤 드롭 — 중복 이벤트 방지 플래그
function initProjFileDrop() {
  const zone = document.getElementById('proj-file-drop-zone');
  if (!zone || zone._projDropInited) return;
  zone._projDropInited = true;

  // click 시 input 클릭 (버블링 방지: input 자체 클릭은 pass-through)
  zone.addEventListener('click', (e) => {
    // input[type=file] 클릭이면 재귀 방지
    if (e.target && e.target.tagName === 'INPUT') return;
    const inp = document.getElementById('proj-file-input');
    if (inp) inp.click();
  });
  zone.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', e => { e.stopPropagation(); zone.classList.remove('drag-over'); });
  zone.addEventListener('drop', e => {
    e.preventDefault(); e.stopPropagation();
    zone.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;
    files.forEach(f => uploadProjFile(f));
  });
}

/* ══════════════════════════════════════
   프로젝트 이력
   ══════════════════════════════════════ */
async function addProjHistory(projId, action, field, oldVal, newVal, description) {
  try {
    await api.post('project_history', {
      id: genId(), project_id: projId, action, field,
      old_value: String(oldVal||''), new_value: String(newVal||''),
      actor_id: State.owner.id, actor_name: State.owner.name,
      description,
    });
  } catch(e) { /* 이력 기록 실패는 무시 */ }
}

async function loadAndRenderProjHistory(projId) {
  try {
    const res = await api.get('project_history', `search=${projId}`);
    const hist = (res.data||[]).filter(h=>h.project_id===projId).sort((a,b)=>(b.created_at||0)-(a.created_at||0)).slice(0,50);
    renderProjHistoryList(hist);
  } catch(e) { document.getElementById('proj-history-list').innerHTML = '<div class="proj-history-empty"><i class="fas fa-exclamation-circle"></i><p>이력 로드 실패</p></div>'; }
}

function renderProjHistoryList(hist) {
  const el = document.getElementById('proj-history-list'); if(!el) return;
  const iconMap = {
    create:        { cls:'hist-create',  icon:'fa-plus-circle' },
    update:        { cls:'hist-update',  icon:'fa-edit' },
    member_add:    { cls:'hist-member',  icon:'fa-user-plus' },
    member_remove: { cls:'hist-member',  icon:'fa-user-minus' },
    status_change: { cls:'hist-status',  icon:'fa-exchange-alt' },
    file_upload:   { cls:'hist-file',    icon:'fa-paperclip' },
    note_add:      { cls:'hist-note',    icon:'fa-sticky-note' },
    delete:        { cls:'hist-delete',  icon:'fa-trash' },
  };
  el.innerHTML = hist.length
    ? hist.map(h=>{
        const ic = iconMap[h.action] || { cls:'hist-update', icon:'fa-circle' };
        return `<div class="proj-history-item">
          <div class="proj-history-icon ${ic.cls}"><i class="fas ${ic.icon}"></i></div>
          <div class="proj-history-content">
            <div class="proj-history-desc">${escHtml(h.description||'')}${h.old_value&&h.new_value?` <span style="color:var(--text-muted)">(${escHtml(h.old_value)} → ${escHtml(h.new_value)})</span>`:''}</div>
            <div class="proj-history-time"><i class="fas fa-user" style="margin-right:4px;opacity:.6"></i>${escHtml(h.actor_name||'')} · ${relTime(h.created_at||Date.now())}</div>
          </div>
        </div>`;
      }).join('')
    : '<div class="proj-history-empty"><i class="fas fa-history"></i><p>변경 이력이 없습니다.</p></div>';
}

/* ============================================================
   DOORAY — 담당 업무 (두레이 스타일 3-column)
   ============================================================ */

/* 상태 */
const DoorayState = {
  projectFilter: 'all',  // 'all' | 'my' | 'urgent' | project_id
  sortBy: 'created',     // 'created' | 'due' | 'priority'
  currentTaskId: null,
  pendingFiles: [],       // { file, dataUrl }
};

const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 };

/* ── 진입점 ── */
function renderDooray() {
  openDooraySubmenu();      // 메인 사이드바 서브메뉴 펼치기
  renderDooraySidebar();    // 카운트 + 프로젝트 목록 렌더
  renderDoorayTaskList();
  updateDoorayBadge();
  populateDoorayAssigneeFilter();
}

/* ── 메인 사이드바 서브메뉴 열기/닫기 ── */
function openDooraySubmenu() {
  const submenu  = document.getElementById('dooray-submenu');
  const toggle   = document.getElementById('nav-dooray-toggle');
  const chevron  = document.getElementById('dooray-chevron');
  if (submenu)  submenu.style.display  = '';
  if (toggle)   toggle.classList.add('open');
  if (chevron)  chevron.style.transform = 'rotate(180deg)';
}
function closeDooraySubmenu() {
  const submenu  = document.getElementById('dooray-submenu');
  const toggle   = document.getElementById('nav-dooray-toggle');
  const chevron  = document.getElementById('dooray-chevron');
  if (submenu)  submenu.style.display  = 'none';
  if (toggle)   toggle.classList.remove('open');
  if (chevron)  chevron.style.transform = '';
}

/* ── 메인 사이드바 서브메뉴 렌더 (카운트 + 프로젝트 목록) ── */
function renderDooraySidebar() {
  const q       = (document.getElementById('dooray-proj-search')?.value||'').toLowerCase();
  const allTasks = State.tasks;
  const myId    = State.owner.id;

  // 카운트 업데이트 (메인 사이드바 서브메뉴 IDs)
  const cntAll    = document.getElementById('dooray-cnt-all');
  const cntMy     = document.getElementById('dooray-cnt-my');
  const cntUrgent = document.getElementById('dooray-cnt-urgent');
  if (cntAll)    cntAll.textContent    = allTasks.filter(t=>t.status!=='done').length;
  if (cntMy)     cntMy.textContent     = allTasks.filter(t=>t.assignee_id===myId&&t.status!=='done').length;
  if (cntUrgent) cntUrgent.textContent = allTasks.filter(t=>t.priority==='urgent'&&t.status!=='done').length;

  // 프로젝트 목록 (메인 사이드바 서브메뉴 #dooray-proj-list-group)
  const group = document.getElementById('dooray-proj-list-group');
  if (!group) return;

  let projs = State.projects;
  if (q) projs = projs.filter(p => p.title.toLowerCase().includes(q));

  const items = projs.map(p => {
    const cnt    = allTasks.filter(t => t.project_id===p.id && t.status!=='done').length;
    const active = DoorayState.projectFilter===p.id ? 'active' : '';
    return `<div class="nav-sub-proj-item ${active}" data-filter="${p.id}" onclick="doorayNavSelect('${p.id}',this)">
      <span class="nav-sub-proj-dot" style="background:${p.color||'#1B3A6B'}"></span>
      <span class="nav-sub-proj-name">${escHtml(p.title)}</span>
      ${cnt>0 ? `<span class="nav-sub-proj-cnt">${cnt}</span>` : ''}
    </div>`;
  }).join('');

  group.innerHTML = items || `<div style="padding:6px 28px;font-size:11.5px;color:#8ea7cc">프로젝트 없음</div>`;

  // 현재 선택 항목 active 표시 동기화
  _syncDooraySubmenuActive();
}

/* ── 서브메뉴 active 항목 동기화 ── */
function _syncDooraySubmenuActive() {
  const f = DoorayState.projectFilter;
  // 고정 3개
  ['all','my','urgent'].forEach(key => {
    const el = document.getElementById(`dsub-${key}`);
    if (el) el.classList.toggle('active', f===key);
  });
  // 프로젝트 목록
  document.querySelectorAll('#dooray-proj-list-group .nav-sub-proj-item').forEach(el => {
    el.classList.toggle('active', el.dataset.filter===f);
  });
}

/* ── 서브메뉴에서 필터 선택 (메인 사이드바 onclick) ── */
function doorayNavSelect(filter, el) {
  DoorayState.projectFilter = filter;
  _syncDooraySubmenuActive();

  // 업무 목록 제목 업데이트
  const titleMap = { all:'전체 업무', my:'내 담당 업무', urgent:'긴급 업무' };
  let title = titleMap[filter];
  if (!title) {
    const p = State.projects.find(x => x.id===filter);
    title = p ? p.title : '업무';
  }
  const titleEl = document.getElementById('dooray-list-title');
  if (titleEl) titleEl.textContent = title;

  renderDoorayTaskList();
}

/* ── 프로젝트 필터 변경 (기존 호환용 — doorayNavSelect 로 위임) ── */
function dooraySetProject(filter, el) {
  doorayNavSelect(filter, el);
}

/* ── 정렬 변경 ── */
function dooraySetSort(sort, el) {
  DoorayState.sortBy = sort;
  document.querySelectorAll('.dooray-sort-tab').forEach(b=>b.classList.remove('active'));
  if(el) el.classList.add('active');
  renderDoorayTaskList();
}

/* ── 필터 초기화 ── */
function doorayResetFilters() {
  const s=document.getElementById('dooray-filter-status');
  const pr=document.getElementById('dooray-filter-priority');
  const as=document.getElementById('dooray-filter-assignee');
  const sq=document.getElementById('dooray-task-search');
  if(s) s.value='all'; if(pr) pr.value='all'; if(as) as.value='all'; if(sq) sq.value='';
  renderDoorayTaskList();
}

/* ── 담당자 필터 채우기 ── */
function populateDoorayAssigneeFilter() {
  const sel = document.getElementById('dooray-filter-assignee');
  if(!sel) return;
  sel.innerHTML = '<option value="all">담당자: 전체</option>';
  State.members.forEach(m=>{
    sel.insertAdjacentHTML('beforeend',`<option value="${m.id}">${escHtml(m.name)}</option>`);
  });
}

/* ── 업무 목록 렌더 ── */
function renderDoorayTaskList() {
  const listEl = document.getElementById('dooray-task-list');
  if(!listEl) return;

  const q      = (document.getElementById('dooray-task-search')?.value||'').toLowerCase();
  const fStat  = document.getElementById('dooray-filter-status')?.value||'all';
  const fPrio  = document.getElementById('dooray-filter-priority')?.value||'all';
  const fAsgn  = document.getElementById('dooray-filter-assignee')?.value||'all';
  const filter = DoorayState.projectFilter;
  const myId   = State.owner.id;

  let tasks = State.tasks;
  // 사이드바 필터
  if(filter==='my')     tasks = tasks.filter(t=>t.assignee_id===myId);
  else if(filter==='urgent') tasks = tasks.filter(t=>t.priority==='urgent');
  else if(filter!=='all') tasks = tasks.filter(t=>t.project_id===filter);

  // 검색
  if(q) tasks = tasks.filter(t=>(t.title||'').toLowerCase().includes(q)||(t.description||'').toLowerCase().includes(q));
  // 상태 필터
  if(fStat!=='all') tasks = tasks.filter(t=>t.status===fStat);
  // 우선순위 필터
  if(fPrio!=='all') tasks = tasks.filter(t=>t.priority===fPrio);
  // 담당자 필터
  if(fAsgn!=='all') tasks = tasks.filter(t=>t.assignee_id===fAsgn);

  // 정렬
  tasks = [...tasks].sort((a,b)=>{
    if(DoorayState.sortBy==='due') {
      if(!a.due_date&&!b.due_date) return 0;
      if(!a.due_date) return 1; if(!b.due_date) return -1;
      return new Date(a.due_date)-new Date(b.due_date);
    }
    if(DoorayState.sortBy==='priority') {
      return (PRIORITY_ORDER[a.priority]||99)-(PRIORITY_ORDER[b.priority]||99);
    }
    return (b.created_at||0)-(a.created_at||0);
  });

  // 총 건수
  const totalEl = document.getElementById('dooray-list-total');
  if(totalEl) totalEl.textContent = `${tasks.length}건`;

  if(!tasks.length) {
    listEl.innerHTML = `<div class="dooray-empty"><i class="fas fa-inbox"></i><p>조건에 맞는 업무가 없습니다.</p></div>`;
    return;
  }

  const PRIORITY_COLOR = { urgent:'#E74C3C', high:'#E67E22', medium:'#F39C12', low:'#27AE60' };

  listEl.innerHTML = tasks.map(t=>{
    const p  = getProject(t.project_id);
    const a  = getMember(t.assignee_id);
    const isSelected = DoorayState.currentTaskId===t.id;
    const isDone     = t.status==='done';
    const isOverdue  = overdue(t.due_date)&&!isDone;
    return `<div class="dooray-task-row ${isSelected?'selected':''} status-${t.status}" onclick="doorayOpenTask('${t.id}')">
      <div class="dooray-task-check ${isDone?'done':''}"></div>
      <div class="dooray-task-main">
        <div class="dooray-task-title">${escHtml(t.title)}</div>
        <div class="dooray-task-meta">
          ${p?`<span class="dooray-task-proj">${escHtml(p.title)}</span>`:''}
          ${t.due_date?`<span class="dooray-task-due ${isOverdue?'overdue':''}"><i class="fas fa-clock"></i>${fmt(t.due_date)}</span>`:''}
        </div>
      </div>
      <div class="dooray-task-side">
        <div class="dooray-task-priority-dot" style="background:${PRIORITY_COLOR[t.priority]||'#ccc'}" title="${PRIORITY_LABEL[t.priority]||t.priority}"></div>
        ${a?`<span class="dooray-task-avatar">${avatarEl(a,'avatar-xs')}</span>`:''}
      </div>
    </div>`;
  }).join('');
}

/* ── 업무 상세 열기 ── */
async function doorayOpenTask(taskId) {
  DoorayState.currentTaskId = taskId;
  // 목록에서 선택 표시
  document.querySelectorAll('.dooray-task-row').forEach(r=>{
    r.classList.toggle('selected', r.onclick?.toString().includes(taskId));
  });
  // 실시간 재렌더하여 selected 표시 적용
  renderDoorayTaskList();

  const t = State.tasks.find(x=>x.id===taskId);
  if(!t) return;
  const p = getProject(t.project_id);
  const a = getMember(t.assignee_id);

  // 상세 영역 표시
  document.getElementById('dooray-detail-empty').style.display = 'none';
  document.getElementById('dooray-detail-content').style.display = 'flex';

  // 빵부스러기
  const bcEl = document.getElementById('dooray-detail-breadcrumb');
  if(bcEl) bcEl.innerHTML = `<i class="fas fa-folder-open"></i> <a onclick="dooraySetProject('${p?.id||'all'}',null)">${escHtml(p?.title||'전체')}</a> <i class="fas fa-chevron-right" style="font-size:9px"></i> 업무`;

  // 제목
  document.getElementById('dooray-detail-title').textContent = t.title;

  // 메타 정보
  const metaEl = document.getElementById('dooray-detail-meta');
  const tags = (t.tags||[]).map(x=>`<span class="tag-chip" style="font-size:11px">${escHtml(x)}</span>`).join('');
  metaEl.innerHTML = `
    <div class="dooray-meta-row"><span class="dooray-meta-label">상태</span><div class="dooray-meta-val">${statusBadge(t.status)}</div></div>
    <div class="dooray-meta-row"><span class="dooray-meta-label">우선순위</span><div class="dooray-meta-val">${priorityBadge(t.priority)}</div></div>
    <div class="dooray-meta-row"><span class="dooray-meta-label">담당자</span><div class="dooray-meta-val">${a?`${avatarEl(a,'avatar-xs')} ${escHtml(a.name)}`:'<span style="color:var(--text-muted)">미지정</span>'}</div></div>
    <div class="dooray-meta-row"><span class="dooray-meta-label">마감일</span><div class="dooray-meta-val ${overdue(t.due_date)&&t.status!=='done'?'overdue':''}">${fmt(t.due_date)}</div></div>
    <div class="dooray-meta-row" style="grid-column:1/-1"><span class="dooray-meta-label">태그</span><div class="dooray-meta-val" style="flex-wrap:wrap;gap:4px">${tags||'<span style="color:var(--text-muted)">없음</span>'}</div></div>
  `;

  // 본문 — 리치텍스트(HTML) 그대로 렌더링
  const descEl = document.getElementById('dooray-detail-desc');
  if(t.description) {
    descEl.innerHTML = t.description;
    descEl.style.color = '';
  } else {
    descEl.textContent = '업무 내용이 없습니다.';
    descEl.style.color = 'var(--text-muted)';
  }

  // 체크리스트
  const clWrap = document.getElementById('dooray-detail-checklist-wrap');
  const clItems = document.getElementById('dooray-checklist-items');
  const checklist = t.checklist || [];
  if(checklist.length) {
    clWrap.style.display = 'block';
    clItems.innerHTML = checklist.map((item,i)=>{
      const text = typeof item==='string' ? item : (item.text||'');
      const done = typeof item==='object' && item.done;
      return `<div class="dooray-checklist-item">
        <input type="checkbox" ${done?'checked':''} onchange="doorayToggleChecklist('${t.id}',${i},this.checked)">
        <span class="${done?'checked':''}">${escHtml(text)}</span>
      </div>`;
    }).join('');
  } else {
    clWrap.style.display = 'none';
  }

  // 버튼 연결
  document.getElementById('dooray-btn-edit').onclick   = ()=>{ closeModal?.('modal-task-detail')||true; openTaskEdit(t.id); };
  document.getElementById('dooray-btn-delete').onclick = ()=>doorayDeleteTask(t.id);

  // 첨부 파일 초기화
  DoorayState.pendingFiles = [];
  const attachPrev = document.getElementById('dooray-msg-attach-preview');
  if(attachPrev) attachPrev.innerHTML = '';
  const msgInput = document.getElementById('dooray-msg-input');
  if(msgInput) msgInput.innerHTML = '';

  // 탭 기본값 히스토리로 설정
  dooraySetInnerTab('history', document.querySelector('.dooray-inner-tab[data-itab="history"]'));

  // 히스토리 로드
  await doorayLoadHistory(t.id, p?.id);
  // 댓글 로드
  doorayLoadComments(t.id);
  // 파일 로드
  await doorayLoadFiles(t.id);
}

/* ── 내부 탭 전환 ── */
function dooraySetInnerTab(tab, el) {
  document.querySelectorAll('.dooray-inner-tab').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.dooray-itab-panel').forEach(p=>p.classList.remove('active'));
  if(el) el.classList.add('active');
  else {
    const btn = document.querySelector(`.dooray-inner-tab[data-itab="${tab}"]`);
    if(btn) btn.classList.add('active');
  }
  const panel = document.getElementById(`dooray-itab-${tab}`);
  if(panel) panel.classList.add('active');
}

/* ── 히스토리 로드 ── */
async function doorayLoadHistory(taskId, projId) {
  const el = document.getElementById('dooray-history-list');
  if(!el) return;
  const t = State.tasks.find(x=>x.id===taskId);
  const a = t ? getMember(t.assignee_id) : null;
  const p = projId ? getProject(projId) : null;
  const items = [];
  items.push({ icon:'dooray-hist-create', fa:'fa-plus-circle', text:`<b>${escHtml(t?.title||'업무')}</b> 이(가) 등록되었습니다.`, time: t?.created_at||Date.now() });
  if(a) items.push({ icon:'dooray-hist-update', fa:'fa-user-check', text:`담당자가 <b>${escHtml(a.name)}</b> 으로 지정되었습니다.`, time: (t?.created_at||Date.now())+1000 });
  // 댓글 수
  const cmtCount = State.comments.filter(c=>c.task_id===taskId).length;
  if(cmtCount>0) items.push({ icon:'dooray-hist-comment', fa:'fa-comment', text:`댓글 ${cmtCount}개가 달렸습니다.`, time: Date.now() });
  el.innerHTML = items.map(i=>`
    <div class="dooray-hist-item">
      <div class="dooray-hist-icon ${i.icon}"><i class="fas ${i.fa}"></i></div>
      <div>
        <div>${i.text}</div>
        <div class="dooray-hist-time">${relTime(i.time)}</div>
      </div>
    </div>`).join('') || `<p style="color:var(--text-muted);font-size:12px">이력이 없습니다.</p>`;
}

/* ── 댓글 로드 ── */
function doorayLoadComments(taskId) {
  const el = document.getElementById('dooray-comment-list');
  if(!el) return;
  const cmnts = State.comments.filter(c=>c.task_id===taskId);
  if(!cmnts.length) {
    el.innerHTML = `<p style="color:var(--text-muted);font-size:12px;text-align:center;padding:20px 0">아직 댓글이 없습니다.<br>첫 댓글을 남겨보세요!</p>`;
    return;
  }
  el.innerHTML = cmnts.map(c=>{
    const au = getMember(c.author_id);
    let attachHtml = '';
    if(c.msg_type && c.msg_type!=='text' && c.data_url) {
      if(c.msg_type==='image') attachHtml = `<img src="${c.data_url}" style="max-width:180px;max-height:140px;border-radius:6px;margin-top:6px;cursor:pointer;display:block" onclick="openLightbox?.('${c.data_url}')">`;
      else if(c.msg_type==='video') attachHtml = `<video src="${c.data_url}" controls style="max-width:200px;border-radius:6px;margin-top:6px;display:block"></video>`;
      else attachHtml = `<div style="display:flex;align-items:center;gap:6px;margin-top:6px;font-size:11px;color:var(--primary)"><i class="fas fa-file"></i>${escHtml(c.file_name||'파일')}</div>`;
    }
    // @멘션 파싱
    let text = escHtml(c.content||'');
    text = text.replace(/@([^\s<]+)/g, '<span class="mention">@$1</span>');
    return `<div class="dooray-comment-item">
      ${avatarEl(au,'avatar-sm')}
      <div class="dooray-comment-body">
        <div class="dooray-comment-header">
          <span class="dooray-comment-author">${escHtml(au?.name||'알 수 없음')}</span>
          <span class="dooray-comment-time">${relTime(c.created_at||Date.now())}</span>
        </div>
        <div class="dooray-comment-text">${text}${attachHtml}</div>
      </div>
    </div>`;
  }).join('');
}

/* ── 첨부파일 로드 ── */
async function doorayLoadFiles(taskId) {
  const el = document.getElementById('dooray-file-list');
  if(!el) return;
  try {
    const res = await api.get('task_attachments', `search=${taskId}`);
    const files = (res.data||[]).filter(f=>f.task_id===taskId);
    if(!files.length) {
      el.innerHTML = `<p style="color:var(--text-muted);font-size:12px;text-align:center;padding:20px 0"><i class="fas fa-paperclip" style="font-size:24px;display:block;margin-bottom:8px;opacity:.3"></i>첨부파일이 없습니다.</p>`;
      return;
    }
    el.innerHTML = files.map(f=>{
      const ft = f.file_type||'';
      const isImg = ft.startsWith('image/') || ft === 'image';
      const isVid = ft.startsWith('video/') || ft === 'video';
      const icon  = isImg ? 'fa-file-image' : isVid ? 'fa-file-video' : getFileIcon(ft || f.file_name||'');
      const iconColor = isImg ? '#4A90E2' : isVid ? '#E67E22' : 'var(--primary)';
      const typeLabel = isImg ? '사진' : isVid ? '동영상' : '문서';

      let previewHtml = '';
      if (isImg && f.data_url) {
        previewHtml = `<img src="${f.data_url}" class="dooray-file-thumb" alt="${escHtml(f.file_name||'')}" onclick="openLightbox('${f.data_url}')" title="클릭하면 크게 봅니다" style="cursor:pointer">`;
      } else if (isVid && f.data_url) {
        previewHtml = `<video src="${f.data_url}" class="dooray-file-thumb" style="object-fit:cover;cursor:pointer" onclick="this.paused?this.play():this.pause()" title="클릭하면 재생"></video>`;
      } else {
        previewHtml = `<div class="dooray-file-icon-wrap"><i class="fas ${icon}" style="color:${iconColor}"></i></div>`;
      }

      const dlBtnHtml = f.data_url
        ? `<button class="dooray-file-dl-btn" onclick="downloadFromDataUrl('${f.data_url}','${escHtml(f.file_name||'파일')}')" title="내려받기"><i class="fas fa-download"></i> 받기</button>`
        : '';
      let cmtCount = 0;
      try { cmtCount = JSON.parse(f.file_comments||'[]').length; } catch(e){}
      const cmtBadge = cmtCount > 0 ? `<span class="file-cmt-badge">${cmtCount}</span>` : '';

      return `<div class="dooray-file-item">
        ${previewHtml}
        <div class="dooray-file-info">
          <div class="dooray-file-name" title="${escHtml(f.file_name||'')}">${escHtml(f.file_name||'파일')}</div>
          <div class="dooray-file-meta">
            <span class="dooray-file-type-badge">${typeLabel}</span>
            ${fmtSize(f.file_size||0)} · ${escHtml(f.uploader_name||'')}
          </div>
          ${f.file_desc ? `<div class="dooray-file-desc">${escHtml(f.file_desc)}</div>` : ''}
        </div>
        <div class="dooray-file-actions">
          ${dlBtnHtml}
          <button class="dooray-file-detail-btn" onclick="openFileDetailModal('task_attachments','${f.id}','${taskId}')" title="상세/수정/댓글">
            <i class="fas fa-comment-alt"></i>${cmtBadge}
          </button>
          <button class="dooray-file-del-btn" onclick="doorayDeleteFile('${f.id}','${taskId}')" title="삭제"><i class="fas fa-trash"></i></button>
        </div>
      </div>`;
    }).join('');
  } catch(e) {
    el.innerHTML = `<p style="color:var(--text-muted);font-size:12px">파일 로드 실패</p>`;
  }
}

/* ── 두레이 첨부파일 삭제 ── */
async function doorayDeleteFile(fileId, taskId) {
  if(!confirm('이 첨부파일을 삭제하시겠습니까?')) return;
  try {
    await api.del('task_attachments', fileId);
    toast('삭제되었습니다.', 'success');
    await doorayLoadFiles(taskId);
  } catch(e) { toast('삭제 오류', 'error'); }
}

/* ── 상세 닫기 ── */
function doorayCloseDetail() {
  DoorayState.currentTaskId = null;
  document.getElementById('dooray-detail-empty').style.display = '';
  document.getElementById('dooray-detail-content').style.display = 'none';
  renderDoorayTaskList();
}

/* ── 업무 삭제 ── */
async function doorayDeleteTask(taskId) {
  if(!confirm('이 업무를 삭제하시겠습니까?')) return;
  try {
    await api.del('tasks', taskId);
    State.tasks = State.tasks.filter(t=>t.id!==taskId);
    doorayCloseDetail();
    renderDooray();
    toast('업무가 삭제되었습니다.','success');
  } catch(e) { toast('삭제 오류','error'); }
}

/* ── 체크리스트 토글 ── */
async function doorayToggleChecklist(taskId, idx, checked) {
  const t = State.tasks.find(x=>x.id===taskId);
  if(!t) return;
  const cl = [...(t.checklist||[])];
  if(typeof cl[idx]==='string') cl[idx] = { text:cl[idx], done: checked };
  else cl[idx] = { ...cl[idx], done: checked };
  t.checklist = cl;
  try {
    await api.put('tasks', taskId, { ...t, checklist: cl });
    const span = document.querySelectorAll('#dooray-checklist-items .dooray-checklist-item span')[idx];
    if(span) span.classList.toggle('checked', checked);
  } catch(e) { toast('저장 오류','error'); }
}

/* ── 새 업무 ── */
function openNewTaskDooray() {
  resetTaskForm?.();
  populateTaskModal?.();
  // 현재 선택 프로젝트 자동 선택
  if(DoorayState.projectFilter!=='all'&&DoorayState.projectFilter!=='my'&&DoorayState.projectFilter!=='urgent') {
    const sel = document.getElementById('task-project');
    if(sel) sel.value = DoorayState.projectFilter;
  }
  openModal('modal-task');
  setTimeout(initTaskAttachDrop, 80);
}

/* ── 메신저: 파일 첨부 ── */
function doorayHandleFileAttach(event) {
  const files = Array.from(event.target.files);
  files.forEach(async file=>{
    if(file.size>100*1024*1024){ toast(`${file.name}: 100MB 초과`,'error'); return; }
    if(file.size>2*1024*1024) toast(`⏳ "${file.name}" 압축 중...`,'info');
    try {
      const dataUrl = await compressFileForUpload(file);
      DoorayState.pendingFiles.push({ file, dataUrl });
      doorayRenderAttachPreview();
    } catch(e) { toast(`❌ "${file.name}" 읽기 실패`,'error'); }
  });
  event.target.value = '';
}

function doorayRenderAttachPreview() {
  const el = document.getElementById('dooray-msg-attach-preview');
  if(!el) return;
  el.innerHTML = DoorayState.pendingFiles.map((pf,i)=>`
    <div class="dooray-msg-attach-chip">
      <i class="fas fa-paperclip"></i>
      <span>${escHtml(pf.file.name)}</span>
      <button class="dooray-msg-attach-del" onclick="doorayRemoveAttach(${i})" title="제거"><i class="fas fa-times"></i></button>
    </div>`).join('');
}

function doorayRemoveAttach(idx) {
  DoorayState.pendingFiles.splice(idx,1);
  doorayRenderAttachPreview();
}

/* ════════════════════════════════════════════════════════════
   리치텍스트 서식 공통 함수
   ════════════════════════════════════════════════════════════ */

/** 컬러 피커 토글 (다른 피커는 닫음) */
function toggleColorPicker(pickerId) {
  const all = document.querySelectorAll('.rte-color-picker');
  all.forEach(p => { if(p.id !== pickerId) p.classList.remove('open'); });
  const picker = document.getElementById(pickerId);
  if(picker) picker.classList.toggle('open');
}

/** 전역 클릭 시 모든 컬러 피커 닫기 (bindEvents에서 등록) */
function _closeAllColorPickers(e) {
  if(!e.target.closest('.rte-color-wrap')) {
    document.querySelectorAll('.rte-color-picker').forEach(p => p.classList.remove('open'));
  }
}

/** 선택 영역에 텍스트 색상 적용 */
function applyTextColor(color, indicatorId, editorId) {
  const editor = document.getElementById(editorId);
  if(editor) editor.focus();
  document.execCommand('foreColor', false, color);
  const ind = document.getElementById(indicatorId);
  if(ind) ind.style.background = color;
  const picker = document.querySelector(`#${indicatorId}`);
  // 피커 닫기
  document.querySelectorAll('.rte-color-picker').forEach(p => p.classList.remove('open'));
}

/** 선택 영역에 형광 하이라이트 적용 (color='': 제거) */
function applyHighlight(color, editorId) {
  const editor = document.getElementById(editorId);
  if(editor) editor.focus();
  if(color) {
    document.execCommand('hiliteColor', false, color);
  } else {
    // 하이라이트 제거: 배경색을 transparent로
    document.execCommand('hiliteColor', false, 'transparent');
    document.execCommand('removeFormat', false, null); // 일부 브라우저 호환
  }
  document.querySelectorAll('.rte-color-picker').forEach(p => p.classList.remove('open'));
}

/* ── 두레이 댓글창: 텍스트 서식 ── */
function doorayFmt(cmd) {
  const input = document.getElementById('dooray-msg-input');
  if(!input) return;
  input.focus();
  document.execCommand(cmd, false, null);
}

/* ── 메신저 채팅창: 텍스트 서식 ── */
function chatFmt(cmd) {
  const input = document.getElementById('chat-input-rich');
  if(!input) return;
  input.focus();
  document.execCommand(cmd, false, null);
}

/* ── 작업지시 설명: 텍스트 서식 ── */
function taskFmt(cmd) {
  const input = document.getElementById('task-desc-rich');
  if(!input) return;
  input.focus();
  document.execCommand(cmd, false, null);
}

/* ── 메신저: 댓글 전송 ── */
async function dooraySendComment() {
  const taskId = DoorayState.currentTaskId;
  if(!taskId) return;
  const inputEl = document.getElementById('dooray-msg-input');
  const text = inputEl ? inputEl.innerText.trim() : '';
  if(!text && !DoorayState.pendingFiles.length) return;

  const authorId   = State.owner.id;
  const authorName = State.owner.name;

  try {
    // 텍스트 댓글
    if(text) {
      const rec = {
        id: genId(), task_id: taskId, author_id: authorId,
        content: text, msg_type: 'text', mentions: []
      };
      const saved = await api.post('comments', rec);
      State.comments.push({ ...rec, created_at: Date.now() });
    }

    // 파일 첨부
    for(const pf of DoorayState.pendingFiles) {
      const isImg = pf.file.type.startsWith('image/');
      const isVid = pf.file.type.startsWith('video/');
      const rec = {
        id: genId(), task_id: taskId, author_id: authorId,
        content: pf.file.name,
        msg_type: isImg?'image':isVid?'video':'file',
        file_name: pf.file.name,
        file_size: pf.file.size,
        file_type: pf.file.type,
        data_url: pf.dataUrl,
        mentions: []
      };
      await api.post('comments', rec);
      State.comments.push({ ...rec, created_at: Date.now() });
    }

    // 초기화
    if(inputEl) inputEl.innerHTML = '';
    DoorayState.pendingFiles = [];
    doorayRenderAttachPreview();

    // 댓글 탭으로 이동 후 렌더
    dooraySetInnerTab('comments', document.querySelector('.dooray-inner-tab[data-itab="comments"]'));
    doorayLoadComments(taskId);
    toast('댓글이 등록되었습니다.','success');

    // 히스토리 업데이트
    await doorayLoadHistory(taskId, getProject(State.tasks.find(x=>x.id===taskId)?.project_id)?.id);
  } catch(e) {
    console.error('댓글 전송 오류:', e);
    toast('댓글 전송에 실패했습니다.','error');
  }
}

/* ── 배지 업데이트 ── */
function updateDoorayBadge() {
  const badge = document.getElementById('dooray-task-badge');
  if(!badge) return;
  const myId = State.owner.id;
  const cnt = State.tasks.filter(t=>t.assignee_id===myId&&t.status!=='done').length;
  badge.textContent = cnt > 0 ? cnt : '';
  badge.style.display = cnt > 0 ? '' : 'none';
}

/* ============================================================  KANBAN  ============================================================ */
function renderKanban() {
  populateProjectFilter();
  const filter = State.taskProjectFilter;
  let tasks = filter==='all' ? State.tasks : State.tasks.filter(t=>t.project_id===filter);
  ['todo','in_progress','review','done'].forEach(s=>{
    const list = tasks.filter(t=>t.status===s);
    const el   = document.getElementById(`cards-${s}`);
    const cnt  = document.getElementById(`count-${s}`);
    if(cnt) cnt.textContent = list.length;
    if(!el) return;
    el.innerHTML = list.length
      ? list.map(t=>{ const a=getMember(t.assignee_id); const tags=(t.tags||[]).slice(0,2).map(g=>`<span class="tag-chip">${g}</span>`).join('');
          return `<div class="task-card priority-${t.priority}" onclick="openTaskDetail('${t.id}')">
            <div class="task-card-title">${t.title}</div>
            ${tags?`<div class="task-card-tags">${tags}</div>`:''}
            <div class="task-card-meta">
              ${t.due_date?`<span class="task-due ${overdue(t.due_date)&&t.status!=='done'?'overdue':''}"><i class="fas fa-clock"></i>${fmt(t.due_date)}</span>`:''}
              <div style="display:flex;align-items:center;gap:6px">${priorityBadge(t.priority)}${a?avatarEl(a,'avatar-sm'):''}</div>
            </div></div>`; }).join('')
      : '<div style="padding:14px;text-align:center;color:var(--text-muted);font-size:12.5px">작업 없음</div>';
  });
}

function populateProjectFilter() {
  const sel = document.getElementById('kanban-project-filter'); if(!sel) return;
  const cur = sel.value||'all';
  sel.innerHTML = '<option value="all">전체 프로젝트</option>' +
    State.projects.map(p=>`<option value="${p.id}" ${p.id===cur?'selected':''}>${p.title}</option>`).join('');
}

async function openTaskDetail(id) {
  const t = State.tasks.find(x=>x.id===id); if(!t) return;
  State.currentTaskId = id;
  const a=getMember(t.assignee_id), p=getProject(t.project_id);
  const tags = (t.tags||[]).map(x=>`<span class="tag-chip">${escHtml(x)}</span>`).join('');
  document.getElementById('modal-task-detail-title').textContent = t.title;

  // 탭 구조 렌더
  document.getElementById('task-detail-body').innerHTML = `
    <div class="task-detail-tabs" id="task-detail-tabs">
      <button class="task-tab-btn active" data-tab="overview"><i class="fas fa-info-circle"></i> 개요</button>
      <button class="task-tab-btn" data-tab="files"><i class="fas fa-paperclip"></i> 첨부파일</button>
      <button class="task-tab-btn" data-tab="comments"><i class="fas fa-comments"></i> 댓글</button>
    </div>

    <!-- 개요 탭 -->
    <div class="task-tab-panel active" id="task-tab-overview">
      ${t.description?`<p style="font-size:14px;color:var(--text-secondary);line-height:1.7;margin-bottom:15px">${escHtml(t.description)}</p>`:''}
      <div class="task-detail-meta">
        <div class="detail-meta-item"><span class="detail-meta-label">상태</span>${statusBadge(t.status)}</div>
        <div class="detail-meta-item"><span class="detail-meta-label">우선순위</span>${priorityBadge(t.priority)}</div>
        <div class="detail-meta-item"><span class="detail-meta-label">담당자</span><span style="display:flex;align-items:center;gap:7px">${a?`${avatarEl(a,'avatar-sm')} ${a.name}`:'—'}</span></div>
        <div class="detail-meta-item"><span class="detail-meta-label">마감일</span><span class="${overdue(t.due_date)&&t.status!=='done'?'overdue':''}">${fmt(t.due_date)}</span></div>
        <div class="detail-meta-item"><span class="detail-meta-label">프로젝트</span><span>${p?escHtml(p.title):'—'}</span></div>
        <div class="detail-meta-item"><span class="detail-meta-label">태그</span><span style="display:flex;gap:4px;flex-wrap:wrap">${tags||'—'}</span></div>
      </div>
    </div>

    <!-- 첨부파일 탭 -->
    <div class="task-tab-panel" id="task-tab-files">
      <!-- 업로드 드롭존 (global hidden input 사용으로 이벤트 충돌 방지) -->
      <div class="task-detail-upload-zone" id="task-detail-drop-zone"
           onclick="_taskDetailDropZoneClick(event,'${id}')">
        <i class="fas fa-paper-plane"></i>
        <p>파일을 드래그하거나 <span class="task-detail-upload-btn">여기를 클릭</span>하여 업로드</p>
        <small>이미지, 영상, PDF, 문서 등 (최대 100MB)</small>
      </div>
      <!-- 기존 첨부파일 목록 -->
      <div id="task-detail-file-list" style="margin-top:12px"><p style="color:var(--text-muted);font-size:13px">불러오는 중...</p></div>
    </div>

    <!-- 댓글 탭 -->
    <div class="task-tab-panel" id="task-tab-comments">
      <div class="comment-list" id="comment-list-${id}"><p style="color:var(--text-muted);font-size:13px">불러오는 중...</p></div>
    </div>`;

  // 탭 버튼 이벤트
  document.querySelectorAll('#task-detail-tabs .task-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#task-detail-tabs .task-tab-btn').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('.task-tab-panel').forEach(p=>p.classList.remove('active'));
      btn.classList.add('active');
      const panel = document.getElementById(`task-tab-${btn.dataset.tab}`);
      if(panel) panel.classList.add('active');
      if(btn.dataset.tab === 'files') { loadAndRenderTaskFiles(id); initTaskDetailDrop(id); }
      if(btn.dataset.tab === 'comments') renderTaskComments(id);
    });
  });

  // 댓글 초기 렌더
  renderTaskComments(id);

  document.getElementById('btn-edit-task').onclick   = ()=>{ closeModal('modal-task-detail'); openTaskEdit(id); };
  document.getElementById('btn-delete-task').onclick = ()=>deleteTask(id);
  // 댓글 첨부 파일 입력 연결
  const capBtn = document.getElementById('btn-task-comment-attach');
  if(capBtn) capBtn.onclick = (e) => {
    e.stopPropagation();
    document.getElementById('task-comment-file')?.click();
  };
  // 댓글 첨부 초기화
  _commentPendingFiles = [];
  const cap = document.getElementById('comment-attach-preview');
  if(cap) cap.innerHTML = '';
  openModal('modal-task-detail');
  // 드롭존 초기화 — 모달 열린 직후 바로 처리 (첨부파일 탭 클릭 전에도 drag-drop 대비)
  setTimeout(() => initTaskDetailDrop(id), 100);
}

function renderTaskComments(taskId) {
  const cmnts = State.comments.filter(c=>c.task_id===taskId);
  const box = document.getElementById(`comment-list-${taskId}`);
  if(!box) return;
  if(!cmnts.length) { box.innerHTML = '<p style="color:var(--text-muted);font-size:13px;padding:6px 0">댓글이 없습니다.</p>'; return; }
  box.innerHTML = cmnts.map(c=>{
    const au=getMember(c.author_id);
    let attachHtml = '';
    if(c.msg_type && c.msg_type !== 'text' && c.data_url) {
      if(c.msg_type === 'image') attachHtml = `<img src="${c.data_url}" style="max-width:200px;max-height:160px;border-radius:6px;cursor:pointer;margin-top:6px;display:block" onclick="openLightbox('${c.data_url}')">`;
      else if(c.msg_type === 'video') attachHtml = `<video src="${c.data_url}" controls style="max-width:220px;border-radius:6px;margin-top:6px;display:block"></video>`;
      else attachHtml = `<div class="task-file-item" style="margin-top:6px;max-width:240px"><div class="task-file-icon-sm"><i class="fas fa-file"></i></div><div class="task-file-info"><div class="file-name">${escHtml(c.file_name||'파일')}</div><div class="file-meta">${fmtSize(c.file_size||0)}</div></div></div>`;
    }
    return `<div class="comment-item">${avatarEl(au,'avatar-sm')}
      <div class="comment-content">
        <div class="comment-author">${au?.name||'알 수 없음'}</div>
        <div class="comment-text">${escHtml(c.content||'')}</div>
        ${attachHtml}
        <div class="comment-time">${relTime(c.created_at||Date.now())}</div>
      </div></div>`;
  }).join('');
}

function openTaskEdit(id) {
  const t = State.tasks.find(x=>x.id===id); if(!t) return;
  populateTaskModal();
  document.getElementById('modal-task-title').textContent = '작업 편집';
  document.getElementById('task-id').value       = t.id;
  document.getElementById('task-title').value    = t.title;
  // task-desc-rich에 HTML 복원
  const richDescEl = document.getElementById('task-desc-rich');
  if(richDescEl) richDescEl.innerHTML = t.description||'';
  document.getElementById('task-desc').value     = t.description||'';
  document.getElementById('task-project').value  = t.project_id||'';
  document.getElementById('task-assignee').value = t.assignee_id||'';
  document.getElementById('task-status').value   = t.status;
  document.getElementById('task-priority').value = t.priority;
  document.getElementById('task-due').value      = t.due_date||'';
  document.getElementById('task-tags').value     = (t.tags||[]).join(', ');
  openModal('modal-task');
  setTimeout(initTaskAttachDrop, 80);
}

async function saveTask() {
  const title = document.getElementById('task-title').value.trim();
  if(!title){ toast('작업 이름을 입력하세요.','error'); return; }
  const btn = document.getElementById('btn-save-task');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 저장 중...';
  const editId = document.getElementById('task-id').value;
  // task-desc-rich(contenteditable)의 HTML을 description으로 저장
  const richEl = document.getElementById('task-desc-rich');
  const descHtml = richEl ? richEl.innerHTML.trim() : document.getElementById('task-desc').value.trim();
  const data = { title, description: descHtml,
    project_id:document.getElementById('task-project').value, assignee_id:document.getElementById('task-assignee').value,
    status:document.getElementById('task-status').value, priority:document.getElementById('task-priority').value,
    due_date:document.getElementById('task-due').value,
    tags:document.getElementById('task-tags').value.split(',').map(t=>t.trim()).filter(Boolean), checklist:[] };
  try {
    let savedId;
    if(editId){
      const ex = State.tasks.find(t=>t.id===editId);
      const r  = await api.put('tasks', ex.id, {...ex,...data});
      const i  = State.tasks.findIndex(t=>t.id===editId);
      if(i!==-1) State.tasks[i]=r;
      savedId = editId;
      toast('작업이 수정되었습니다.','success');
    } else {
      const r = await api.post('tasks', {id:genId(),...data});
      State.tasks.push(r);
      savedId = r.id;
      toast('작업이 추가되었습니다! ✅','success');
    }
    // 첨부파일 업로드 (파일이 있을 때만)
    if(_taskPendingFiles.length > 0) {
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 파일 업로드 중...';
      await uploadTaskAttachments(savedId);
      toast(`📎 첨부파일 업로드 완료`, 'success');
    }
    closeModal('modal-task'); renderCurrentPage(); resetTaskForm();
  } catch(e){
    console.error('saveTask 오류:', e);
    toast('저장 중 오류가 발생했습니다.','error');
  }
  finally{
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> 저장';
  }
}

async function deleteTask(id) {
  if(!confirm('이 작업을 삭제하시겠습니까?')) return;
  const t=State.tasks.find(x=>x.id===id); if(!t) return;
  await api.del('tasks',t.id);
  State.tasks = State.tasks.filter(x=>x.id!==id);
  closeModal('modal-task-detail'); toast('작업이 삭제되었습니다.','success'); renderCurrentPage();
}

function resetTaskForm() {
  ['task-id','task-title','task-desc','task-due','task-tags'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  // 리치 에디터 초기화
  const richDescEl = document.getElementById('task-desc-rich');
  if(richDescEl) richDescEl.innerHTML = '';
  document.getElementById('modal-task-title').textContent='새 작업';
  // 첨부 파일 초기화
  _taskPendingFiles = [];
  const prev = document.getElementById('task-attach-preview');
  if(prev) prev.innerHTML = '';
  // 드롭존 재초기화
  setTimeout(initTaskAttachDrop, 80);
}

function populateTaskModal() {
  const ps = document.getElementById('task-project'); const as = document.getElementById('task-assignee');
  if(ps) ps.innerHTML='<option value="">프로젝트 선택</option>'+State.projects.map(p=>`<option value="${p.id}">${p.title}</option>`).join('');
  if(as) as.innerHTML='<option value="">담당자 선택</option>'+State.members.map(m=>`<option value="${m.id}">${m.name} (${ROLE_LABEL[m.role]||m.role})</option>`).join('');
}

async function sendComment() {
  const inp=document.getElementById('comment-input'); const content=inp.value.trim();
  if(!content && _commentPendingFiles.length===0) return;
  if(!State.currentTaskId) return;

  try {
    if(_commentPendingFiles.length > 0) {
      // 파일 첨부가 있는 경우: 파일별로 댓글 생성
      for(const f of _commentPendingFiles) {
        const mt = f.file.type.startsWith('image/') ? 'image' : f.file.type.startsWith('video/') ? 'video' : 'file';
        const d = {id:genId(),task_id:State.currentTaskId,author_id:State.owner.id,
          content: content || f.file.name,
          msg_type: mt, file_name: f.file.name, file_size: f.file.size, file_type: f.file.type,
          data_url: f.dataUrl, mentions:[]};
        const r = await api.post('comments',d); State.comments.push(r);
      }
      // 텍스트만 있으면 별도 댓글
      if(content && _commentPendingFiles.length > 0) {
        // 이미 위에서 첫 댓글에 content 포함 → 별도 전송 생략
      }
    } else {
      const d={id:genId(),task_id:State.currentTaskId,author_id:State.owner.id,content,msg_type:'text',mentions:[]};
      const r=await api.post('comments',d); State.comments.push(r);
    }
    inp.value='';
    _commentPendingFiles=[];
    const cap=document.getElementById('comment-attach-preview'); if(cap) cap.innerHTML='';
    renderTaskComments(State.currentTaskId);
    toast('댓글이 등록되었습니다.','success');
  } catch(e){ toast('오류가 발생했습니다.','error'); }
}

/* ============================================================  DEPARTMENTS  ============================================================ */
function renderDepartments() {
  const grid = document.getElementById('dept-grid');
  if(!State.departments.length){ grid.innerHTML=emptyState('sitemap','등록된 부서가 없습니다.'); return; }
  grid.innerHTML = State.departments.map(d=>{
    const mgr = getMember(d.manager_id);
    const mems = State.members.filter(m=>(m.department||'')===(d.name||'')).length;
    return `
    <div class="dept-card" onclick="openDeptDetail('${d.id}')">
      <div class="dept-card-top" style="border-left-color:${d.color||'#1B3A6B'}">
        <div class="dept-card-header">
          <div class="dept-icon" style="background:${d.color||'#1B3A6B'}"><i class="fas fa-building"></i></div>
          <div><div class="dept-name">${d.name}</div><div class="dept-code">${d.code||''}</div></div>
        </div>
        <div class="dept-desc">${d.description||'설명 없음'}</div>
      </div>
      <div class="dept-card-bottom">
        <div class="dept-stat"><i class="fas fa-users"></i> 직원 ${mems}명</div>
        <div class="dept-stat"><i class="fas fa-user-tie"></i> ${mgr?.name||'미지정'}</div>
        <div class="dept-actions" onclick="event.stopPropagation()">
          <button class="btn btn-ghost btn-sm" onclick="editDept('${d.id}')"><i class="fas fa-edit"></i></button>
          <button class="btn btn-danger btn-sm" onclick="deleteDept('${d.id}')"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function openDeptDetail(id) {
  const d = getDept(id); if(!d) return;
  State.currentDeptId = id;
  const mems = State.members.filter(m=>(m.department||'')===(d.name||''));
  document.getElementById('modal-dept-detail-title').textContent = d.name;
  document.getElementById('dept-detail-body').innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px">
      <div style="width:54px;height:54px;border-radius:12px;background:${d.color||'#1B3A6B'};display:flex;align-items:center;justify-content:center;color:#fff;font-size:22px"><i class="fas fa-building"></i></div>
      <div><div style="font-size:17px;font-weight:800">${d.name}</div><div style="font-size:12px;color:var(--text-muted)">${d.code||''} · ${d.description||''}</div></div>
    </div>
    <div class="task-detail-section"><h4>소속 직원 (${mems.length}명)</h4>
      ${mems.length ? `<div style="display:flex;flex-direction:column;gap:10px">${mems.map(m=>`
        <div style="display:flex;align-items:center;gap:12px;padding:10px;background:var(--surface-2);border-radius:var(--radius-sm)">
          ${avatarEl(m)} <div><div style="font-size:13.5px;font-weight:600">${m.name}</div><div style="font-size:11.5px;color:var(--text-muted)">${m.email} · ${ROLE_LABEL[m.role]||m.role}</div></div>
          <div style="margin-left:auto">${m.status==='online'?'<span style="color:var(--accent-green);font-size:11px">● 온라인</span>':m.status==='away'?'<span style="color:var(--accent-yellow);font-size:11px">● 자리비움</span>':'<span style="color:var(--text-muted);font-size:11px">● 오프라인</span>'}</div>
        </div>`).join('')}</div>` : emptyState('users','소속 직원이 없습니다')}
    </div>
    <button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="closeModal('modal-dept-detail');openMemberInviteForDept('${d.name}')">
      <i class="fas fa-user-plus"></i> 이 부서에 직원 추가
    </button>`;
  document.getElementById('btn-edit-dept').onclick   = ()=>{ closeModal('modal-dept-detail'); editDept(id); };
  document.getElementById('btn-delete-dept').onclick = ()=>deleteDept(id);
  openModal('modal-dept-detail');
}

function openMemberInviteForDept(deptName) {
  const sel = document.getElementById('member-dept-select');
  openModal('modal-member');
  setTimeout(()=>{ if(sel){ const opt=[...sel.options].find(o=>o.text===deptName); if(opt) opt.selected=true; } },100);
}

function editDept(id) {
  const d = getDept(id); if(!d) return;
  document.getElementById('modal-dept-title').textContent = '부서 편집';
  document.getElementById('dept-id').value   = id;
  document.getElementById('dept-name').value = d.name;
  document.getElementById('dept-code').value = d.code||'';
  document.getElementById('dept-desc').value = d.description||'';
  document.getElementById('dept-color').value= d.color||'#1B3A6B';
  renderDeptColorRow(d.color||'#1B3A6B');
  openModal('modal-dept');
}

async function saveDept() {
  const name = document.getElementById('dept-name').value.trim();
  if(!name){ toast('부서명을 입력하세요.','error'); return; }
  const btn=document.getElementById('btn-save-dept'); btn.disabled=true; btn.textContent='저장 중...';
  const editId = document.getElementById('dept-id').value;
  const data = { name, code:document.getElementById('dept-code').value.trim(),
    description:document.getElementById('dept-desc').value.trim(),
    color:document.getElementById('dept-color').value, manager_id:'', member_count:0 };
  try {
    if(editId){ const ex=getDept(editId); const r=await api.put('departments',ex.id,{...ex,...data}); const i=State.departments.findIndex(d=>d.id===editId); if(i!==-1) State.departments[i]=r; toast('부서가 수정되었습니다.','success'); }
    else { const r=await api.post('departments',{id:genId(),...data}); State.departments.push(r); toast('부서가 등록되었습니다! 🏢','success'); }
    closeModal('modal-dept'); renderCurrentPage();
    ['dept-id','dept-name','dept-code','dept-desc'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  } catch(e){ toast('저장 중 오류가 발생했습니다.','error'); }
  finally{ btn.disabled=false; btn.textContent='저장'; }
}

async function deleteDept(id) {
  if(!confirm('이 부서를 삭제하시겠습니까?')) return;
  const d=getDept(id); if(!d) return;
  await api.del('departments',d.id);
  State.departments=State.departments.filter(x=>x.id!==id);
  closeModal('modal-dept-detail'); toast('부서가 삭제되었습니다.','success'); renderDepartments();
}

function renderDeptColorRow(selected='#1B3A6B') {
  const row = document.getElementById('dept-color-row'); if(!row) return;
  row.innerHTML = DEPT_COLORS.map(c=>`<div class="dept-color-swatch ${c===selected?'selected':''}" style="background:${c}" onclick="selectDeptColor('${c}')"></div>`).join('');
}

function selectDeptColor(c) {
  document.getElementById('dept-color').value = c;
  renderDeptColorRow(c);
  const prev = document.getElementById('owner-preview-avatar');
  if(prev && document.getElementById('modal-dept').style.display!=='none') return;
}

/* ============================================================  MEMBERS  ============================================================ */
function renderMembers() {
  const grid = document.getElementById('members-grid');
  const search = (document.getElementById('member-search')?.value||'').toLowerCase();
  const deptFilter = document.getElementById('member-dept-filter')?.value||'all';

  // 필터 셀렉트 채우기
  const dsel = document.getElementById('member-dept-filter');
  if(dsel && dsel.options.length<=1) {
    dsel.innerHTML = '<option value="all">전체 부서</option>' +
      State.departments.map(d=>`<option value="${d.name}">${d.name}</option>`).join('');
  }

  let list = State.members;
  if(search) list=list.filter(m=>m.name.toLowerCase().includes(search)||m.email.toLowerCase().includes(search));
  if(deptFilter!=='all') list=list.filter(m=>(m.department||''===deptFilter)||m.department===deptFilter);

  if(!list.length){ grid.innerHTML=`<div style="grid-column:1/-1">${emptyState('users','팀원이 없습니다.')}</div>`; return; }
  const isAdmin = State.loginRole==='admin1' || State.loginRole==='admin2';
  grid.innerHTML = list.map(m=>{
    const myT=State.tasks.filter(t=>t.assignee_id===m.id);
    const done=myT.filter(t=>t.status==='done').length;
    const sc={online:'#27AE60',away:'#F39C12',offline:'#9AAAC0'};
    const sl={online:'온라인',away:'자리비움',offline:'오프라인'};
    const isDeactivated = m.is_active === false;
    return `
    <article class="member-card ${isDeactivated?'member-card-inactive':''}">
      <div class="member-avatar-wrap">
        <span class="avatar avatar-lg" style="background:${isDeactivated?'#aaa':(m.avatar_color||'#1B3A6B')};${isDeactivated?'filter:grayscale(1)':''}">${m.name.charAt(0)}</span>
        <span class="member-status status-${m.status||'offline'}"></span>
      </div>
      <div class="member-name">${escHtml(m.name)} ${isDeactivated?'<span class="badge-deactivated">탈퇴</span>':''}</div>
      <div class="member-email">${escHtml(m.email)}</div>
      <div class="member-dept">${escHtml(m.department||'—')}</div>
      <div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap;justify-content:center">
        <span class="badge" style="background:rgba(27,58,107,.1);color:var(--primary)">${ROLE_LABEL[m.role]||m.role}</span>
        ${m.position?`<span class="badge" style="background:#f0f4ff;color:#555">${escHtml(m.position)}</span>`:''}
      </div>
      <div style="font-size:12px;color:var(--text-secondary);text-align:center">작업 ${myT.length}개 · 완료 ${done}개</div>
      <!-- 비밀번호 등록 여부 표시 (관리자만) -->
      ${isAdmin ? `<div class="member-pw-status ${m.login_pw?'pw-set':'pw-unset'}">
        <i class="fas ${m.login_pw?'fa-lock':'fa-unlock-alt'}"></i>
        ${m.login_pw?'비밀번호 등록됨':'비밀번호 미등록'}
      </div>` : ''}
      <div class="member-actions" style="flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" onclick="showPage('tasks')" title="작업 보기"><i class="fas fa-tasks"></i></button>
        <button class="btn btn-ghost btn-sm" onclick="openDMWith('${m.id}')" title="메시지 보내기"><i class="fas fa-comment"></i></button>
        ${isAdmin ? `
          <button class="btn btn-primary btn-sm" onclick="openMemberEdit('${m.id}')" title="정보 수정"><i class="fas fa-pencil-alt"></i> 수정</button>
          <button class="btn btn-sm" style="background:#805ad5;color:#fff" onclick="openMemberPwAdmin('${m.id}')" title="비밀번호 관리"><i class="fas fa-key"></i></button>
          ${isDeactivated
            ? `<button class="btn btn-sm" style="background:#38a169;color:#fff" onclick="reactivateMember('${m.id}')" title="복직 처리"><i class="fas fa-user-check"></i> 복직</button>`
            : `<button class="btn btn-danger btn-sm" onclick="deactivateMember('${m.id}')" title="탈퇴 처리"><i class="fas fa-user-slash"></i> 탈퇴</button>`
          }
        ` : ''}
      </div>
    </article>`;
  }).join('');
}

async function saveMember() {
  const name   = document.getElementById('member-name').value.trim();
  const email  = document.getElementById('member-email').value.trim();
  const pw     = document.getElementById('member-login-pw').value.trim();
  const editId = document.getElementById('member-edit-id').value;

  if(!name||!email){ toast('이름과 이메일을 입력하세요.','error'); return; }
  if(!editId && !pw){ toast('개인 로그인 비밀번호를 입력하세요.','error'); return; }
  if(pw && pw.length < 4){ toast('비밀번호는 4자 이상이어야 합니다.','error'); return; }

  const btn=document.getElementById('btn-save-member');
  btn.disabled=true; btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> 저장 중...';

  const deptSel  = document.getElementById('member-dept-select');
  const deptName = deptSel?.options[deptSel.selectedIndex]?.text||'';

  try {
    if(editId) {
      // 수정 모드
      const ex = State.members.find(m=>m.id===editId);
      const updateData = { ...ex,
        name, email,
        role: document.getElementById('member-role').value,
        department: deptName!=='부서 선택'?deptName:'',
        position: document.getElementById('member-position').value.trim(),
      };
      if(pw) updateData.login_pw = pw; // 비밀번호 입력 시에만 변경
      const r = await api.put('members', editId, updateData);
      const idx = State.members.findIndex(m=>m.id===editId);
      if(idx!==-1) State.members[idx] = r;
      closeModal('modal-member');
      toast(`${name}님 정보가 수정되었습니다.`, 'success');
    } else {
      // 신규 등록
      const color = AVATAR_COLORS[Math.floor(Math.random()*AVATAR_COLORS.length)];
      const data = { id:genId(), name, email,
        role: document.getElementById('member-role').value,
        department: deptName!=='부서 선택'?deptName:'',
        avatar_color: color, status:'offline',
        position: document.getElementById('member-position').value.trim(),
        login_pw: pw, is_active: true };
      const r = await api.post('members', data);
      State.members.push(r);
      closeModal('modal-member');
      toast(`${name}님이 등록되었습니다! 👋`, 'success');
    }
    renderMembers();
    ['member-name','member-email','member-position','member-login-pw','member-edit-id']
      .forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  } catch(e) {
    toast('오류가 발생했습니다.','error');
  } finally {
    btn.disabled=false;
    btn.innerHTML='<i class="fas fa-paper-plane"></i> 저장';
  }
}

/* 팀원 수정 모달 열기 */
function openMemberEdit(id) {
  const m = getMember(id); if(!m) return;
  document.getElementById('modal-member-title').textContent = '팀원 정보 수정';
  document.getElementById('member-edit-id').value  = m.id;
  document.getElementById('member-name').value     = m.name;
  document.getElementById('member-email').value    = m.email;
  document.getElementById('member-login-pw').value = ''; // 보안상 비워둠
  document.getElementById('member-position').value = m.position||'';
  // 역할 select
  const roleEl = document.getElementById('member-role');
  if(roleEl) roleEl.value = m.role||'general';
  // 부서 select
  const deptSel = document.getElementById('member-dept-select');
  if(deptSel) {
    Array.from(deptSel.options).forEach(opt=>{ opt.selected = opt.text === m.department; });
  }
  // 비밀번호 힌트 표시
  const pwEl = document.getElementById('member-login-pw');
  if(pwEl) pwEl.placeholder = '변경 시에만 입력 (비우면 유지)';
  openModal('modal-member');
}

/* 관리자: 직원 비밀번호 확인 및 변경 모달 */
function openMemberPwAdmin(memberId) {
  const m = getMember(memberId); if(!m) return;
  const body = document.getElementById('member-pw-admin-body');
  body.innerHTML = `
    <div style="text-align:center;margin-bottom:16px">
      <span class="avatar avatar-lg" style="background:${m.avatar_color||'#1B3A6B'};display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:50%;color:#fff;font-size:22px;font-weight:700">${m.name.charAt(0)}</span>
      <div style="font-size:15px;font-weight:700;margin-top:8px">${escHtml(m.name)}</div>
      <div style="font-size:12px;color:var(--text-muted)">${escHtml(m.email)}</div>
    </div>
    <div class="form-group">
      <label>현재 비밀번호</label>
      <div class="member-pw-show-wrap">
        <input type="password" id="mpw-current-display" class="form-control" value="${escHtml(m.login_pw||'(미설정)')}" readonly />
        <button type="button" class="btn btn-ghost btn-sm mpw-toggle-btn" onclick="toggleMpwVisibility()"><i class="fas fa-eye" id="mpw-eye-icon"></i></button>
      </div>
    </div>
    <div class="form-group">
      <label>새 비밀번호로 변경 (선택)</label>
      <input type="password" id="mpw-new-input" class="form-control" placeholder="새 비밀번호 입력 (4자 이상)" />
    </div>
    <input type="hidden" id="mpw-member-id" value="${m.id}" />
    <div style="margin-top:4px;padding:10px 12px;background:${m.is_active===false?'rgba(229,62,62,.08)':'rgba(56,161,105,.08)'};border-radius:8px;font-size:12px;color:${m.is_active===false?'#c53030':'#276749'}">
      <i class="fas ${m.is_active===false?'fa-user-slash':'fa-user-check'}"></i>
      계정 상태: <strong>${m.is_active===false?'탈퇴(비활성)':'재직 중(활성)'}</strong>
    </div>`;
  document.getElementById('btn-save-member-pw').style.display = '';
  openModal('modal-member-pw-admin');
}

/* 비밀번호 표시/숨김 토글 */
function toggleMpwVisibility() {
  const inp = document.getElementById('mpw-current-display');
  const ico = document.getElementById('mpw-eye-icon');
  if(!inp) return;
  if(inp.type === 'password') {
    inp.type = 'text'; ico.className = 'fas fa-eye-slash';
  } else {
    inp.type = 'password'; ico.className = 'fas fa-eye';
  }
}

/* 관리자: 직원 비밀번호 저장 */
async function saveMemberPwByAdmin() {
  const memberId = document.getElementById('mpw-member-id').value;
  const newPw    = document.getElementById('mpw-new-input').value.trim();
  if(!newPw) { toast('새 비밀번호를 입력하세요.','error'); return; }
  if(newPw.length < 4) { toast('비밀번호는 4자 이상이어야 합니다.','error'); return; }
  const m = getMember(memberId); if(!m) return;
  try {
    const r = await api.patch('members', memberId, { login_pw: newPw });
    const idx = State.members.findIndex(x=>x.id===memberId);
    if(idx!==-1) State.members[idx] = {...State.members[idx], login_pw: newPw};
    closeModal('modal-member-pw-admin');
    toast(`${m.name}님 비밀번호가 변경되었습니다.`, 'success');
    renderMembers();
  } catch(e) { toast('저장 중 오류가 발생했습니다.','error'); }
}

/* 관리자: 직원 탈퇴 처리 (비활성화) */
async function deactivateMember(id) {
  const m = getMember(id); if(!m) return;
  if(!confirm(`${m.name}님을 탈퇴 처리하시겠습니까?\n탈퇴 후 해당 직원은 로그인할 수 없습니다.`)) return;
  try {
    await api.patch('members', id, { is_active: false });
    const idx = State.members.findIndex(x=>x.id===id);
    if(idx!==-1) State.members[idx].is_active = false;
    toast(`${m.name}님이 탈퇴 처리되었습니다.`, 'success');
    renderMembers();
  } catch(e) { toast('처리 중 오류가 발생했습니다.','error'); }
}

/* 관리자: 직원 복직 처리 (재활성화) */
async function reactivateMember(id) {
  const m = getMember(id); if(!m) return;
  if(!confirm(`${m.name}님을 복직 처리하시겠습니까?`)) return;
  try {
    await api.patch('members', id, { is_active: true });
    const idx = State.members.findIndex(x=>x.id===id);
    if(idx!==-1) State.members[idx].is_active = true;
    toast(`${m.name}님이 복직 처리되었습니다.`, 'success');
    renderMembers();
  } catch(e) { toast('처리 중 오류가 발생했습니다.','error'); }
}

async function deleteMember(id) {
  if(!confirm('이 팀원을 완전히 삭제하시겠습니까?\n(탈퇴 처리는 수정 버튼을 이용하세요)')) return;
  const m=getMember(id); if(!m) return;
  await api.del('members',m.id); State.members=State.members.filter(x=>x.id!==id);
  toast('팀원이 삭제되었습니다.','success'); renderMembers();
}

function populateMemberDeptSelect() {
  const sel=document.getElementById('member-dept-select'); if(!sel) return;
  sel.innerHTML='<option value="">부서 선택</option>'+State.departments.map(d=>`<option value="${d.id}">${d.name}</option>`).join('');
}

/* ============================================================  CALENDAR  ============================================================ */

/* 일정 색상 맵 */
const CAL_COLORS = {
  blue:   { bg:'rgba(49,130,206,.15)',  text:'#2b6cb0',  dot:'#3182ce'  },
  green:  { bg:'rgba(56,161,105,.15)',  text:'#276749',  dot:'#38a169'  },
  red:    { bg:'rgba(229,62,62,.13)',   text:'#c53030',  dot:'#e53e3e'  },
  orange: { bg:'rgba(221,107,32,.13)',  text:'#c05621',  dot:'#dd6b20'  },
  purple: { bg:'rgba(128,90,213,.13)',  text:'#6b46c1',  dot:'#805ad5'  },
  pink:   { bg:'rgba(213,63,140,.12)',  text:'#b83280',  dot:'#d53f8c'  },
};

function _calColor(key) { return CAL_COLORS[key] || CAL_COLORS.blue; }

function renderCalendar() {
  const y=State.calendarYear, m=State.calendarMonth;
  document.getElementById('calendar-title').textContent=`${y}년 ${MONTHS_KR[m]}`;
  const first=new Date(y,m,1).getDay(), last=new Date(y,m+1,0).getDate();
  const today=new Date(), prevLast=new Date(y,m,0).getDate();

  let html='';
  // 이전 달 빈 칸
  for(let i=first-1;i>=0;i--)
    html+=`<div class="cal-day other-month"><div class="cal-day-num">${prevLast-i}</div></div>`;

  // 이번 달 날짜
  for(let d=1;d<=last;d++){
    const dow=new Date(y,m,d).getDay();
    const isT=y===today.getFullYear()&&m===today.getMonth()&&d===today.getDate();
    const ds=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;

    // 프로젝트 마감
    const projEvts = State.projects.filter(p=>p.end_date===ds)
      .map(p=>`<div class="cal-event event-proj-end" title="${escHtml(p.title)}"
        onclick="event.stopPropagation()">📁 ${escHtml(p.title)}</div>`).join('');

    // 작업 마감
    const taskEvts = State.tasks.filter(t=>t.due_date===ds)
      .map(t=>`<div class="cal-event ${t.priority==='urgent'?'event-urgent':'event-task'}" title="${escHtml(t.title)}"
        onclick="event.stopPropagation()">✅ ${escHtml(t.title)}</div>`).join('');

    // 사용자 일정 (기간 이벤트: start_date ≤ ds ≤ end_date)
    const userEvts = State.calendarEvents
      .filter(e => e.start_date <= ds && (e.end_date||e.start_date) >= ds)
      .map(e => {
        const c = _calColor(e.color);
        return `<div class="cal-event cal-user-event" title="${escHtml(e.title)}"
          style="background:${c.bg};color:${c.text};border-left:3px solid ${c.dot}"
          onclick="event.stopPropagation();openEditCalEvent('${e.id}')">
          ${escHtml(e.title)}${!e.all_day&&e.start_time?` <span style="opacity:.7;font-size:9px">${e.start_time}</span>`:''}
        </div>`;
      }).join('');

    html+=`<div class="cal-day${isT?' today':''}${dow===0?' sunday':''}${dow===6?' saturday':''}"
      onclick="openNewCalEventOnDate('${ds}')" title="${ds} 클릭하여 일정 추가">
      <div class="cal-day-num">${d}</div>
      ${userEvts}${projEvts}${taskEvts}
      <div class="cal-day-add-hint"><i class="fas fa-plus"></i></div>
    </div>`;
  }

  // 다음 달 빈 칸
  const rem=(first+last)%7===0?0:7-(first+last)%7;
  for(let i=1;i<=rem;i++)
    html+=`<div class="cal-day other-month"><div class="cal-day-num">${i}</div></div>`;

  document.getElementById('calendar-grid').innerHTML=html;

  // 하단 이달 일정 목록
  _renderCalEventsList();
}

/* 하단 이달 일정 목록 렌더 */
function _renderCalEventsList() {
  const y=State.calendarYear, m=State.calendarMonth;
  const ms=`${y}-${String(m+1).padStart(2,'0')}`;

  const userList = State.calendarEvents
    .filter(e=>e.start_date?.startsWith(ms))
    .sort((a,b)=>a.start_date.localeCompare(b.start_date))
    .map(e=>{
      const c=_calColor(e.color);
      const dd=new Date(e.start_date+'T12:00:00');
      const timeStr = e.all_day ? '종일' : `${e.start_time||''}${e.end_time?'~'+e.end_time:''}`;
      return `<div class="event-item cal-user-event-item" onclick="openEditCalEvent('${e.id}')" style="cursor:pointer">
        <div class="event-date">
          <div class="event-month">${MONTHS_KR[dd.getMonth()]}</div>
          <div class="event-day" style="color:${c.dot}">${dd.getDate()}</div>
        </div>
        <div class="event-info">
          <div class="event-title"><span class="cal-dot" style="background:${c.dot}"></span>${escHtml(e.title)}</div>
          <div class="event-proj">${timeStr}${e.memo?` · ${escHtml(e.memo).substring(0,30)}`:''}</div>
        </div>
        <button class="cal-evt-edit-btn" onclick="event.stopPropagation();openEditCalEvent('${e.id}')"><i class="fas fa-pencil-alt"></i></button>
      </div>`;
    });

  const projList = [
    ...State.projects.filter(p=>p.end_date?.startsWith(ms)).map(p=>({date:p.end_date,title:p.title,sub:'프로젝트 마감',priority:p.priority,type:'proj'})),
    ...State.tasks.filter(t=>t.due_date?.startsWith(ms)).map(t=>({date:t.due_date,title:t.title,sub:getProject(t.project_id)?.title||'—',priority:t.priority,type:'task'})),
  ].sort((a,b)=>a.date.localeCompare(b.date))
   .map(e=>{
     const dd=new Date(e.date+'T12:00:00');
     return `<div class="event-item">
       <div class="event-date"><div class="event-month">${MONTHS_KR[dd.getMonth()]}</div><div class="event-day">${dd.getDate()}</div></div>
       <div class="event-info">
         <div class="event-title">${e.type==='proj'?'📁':'✅'} ${escHtml(e.title)}</div>
         <div class="event-proj">${escHtml(e.sub)}</div>
       </div>${priorityBadge(e.priority)}
     </div>`;
   });

  const all = [...userList, ...projList];
  const evEl=document.getElementById('events-list');
  evEl.innerHTML = all.length
    ? all.join('')
    : '<p style="color:var(--text-muted);font-size:13px;padding:10px 0">이달 일정이 없습니다.</p>';
}

/* ── 일정 추가 모달 열기 (날짜 클릭) ── */
function openNewCalEventOnDate(dateStr) {
  _resetCalEventForm();
  document.getElementById('cal-event-start-date').value = dateStr;
  document.getElementById('cal-event-end-date').value   = dateStr;
  document.getElementById('cal-event-modal-title').innerHTML =
    `<i class="fas fa-calendar-plus" style="color:var(--primary);margin-right:8px"></i>일정 추가`;
  document.getElementById('btn-delete-cal-event').style.display = 'none';
  openModal('modal-cal-event');
  setTimeout(()=>document.getElementById('cal-event-title').focus(),100);
}

/* ── 일정 추가 버튼 클릭 ── */
function openNewCalEvent() {
  _resetCalEventForm();
  // 오늘 날짜 기본값
  const today = new Date();
  const ds = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  document.getElementById('cal-event-start-date').value = ds;
  document.getElementById('cal-event-end-date').value   = ds;
  document.getElementById('cal-event-modal-title').innerHTML =
    `<i class="fas fa-calendar-plus" style="color:var(--primary);margin-right:8px"></i>일정 추가`;
  document.getElementById('btn-delete-cal-event').style.display = 'none';
  openModal('modal-cal-event');
  setTimeout(()=>document.getElementById('cal-event-title').focus(),100);
}

/* ── 일정 수정 모달 열기 ── */
function openEditCalEvent(evtId) {
  const evt = State.calendarEvents.find(e=>e.id===evtId);
  if(!evt) return;
  _resetCalEventForm();
  document.getElementById('cal-event-id').value         = evt.id;
  document.getElementById('cal-event-title').value      = evt.title||'';
  document.getElementById('cal-event-start-date').value = evt.start_date||'';
  document.getElementById('cal-event-end-date').value   = evt.end_date||evt.start_date||'';
  document.getElementById('cal-event-start-time').value = evt.start_time||'09:00';
  document.getElementById('cal-event-end-time').value   = evt.end_time||'10:00';
  document.getElementById('cal-event-memo').value       = evt.memo||'';
  document.getElementById('cal-event-allday').checked   = evt.all_day !== false;
  // 색상 라디오
  const colorVal = evt.color||'blue';
  const radio = document.querySelector(`input[name="cal-color"][value="${colorVal}"]`);
  if(radio) radio.checked = true;
  toggleCalAllDay(evt.all_day !== false);
  document.getElementById('cal-event-modal-title').innerHTML =
    `<i class="fas fa-calendar-edit" style="color:var(--primary);margin-right:8px"></i>일정 수정`;
  document.getElementById('btn-delete-cal-event').style.display = '';
  openModal('modal-cal-event');
}

/* ── 종일/시간 토글 ── */
function toggleCalAllDay(isAllDay) {
  document.getElementById('cal-time-row').style.display = isAllDay ? 'none' : '';
}

/* ── 폼 초기화 ── */
function _resetCalEventForm() {
  document.getElementById('cal-event-id').value         = '';
  document.getElementById('cal-event-title').value      = '';
  document.getElementById('cal-event-start-date').value = '';
  document.getElementById('cal-event-end-date').value   = '';
  document.getElementById('cal-event-start-time').value = '09:00';
  document.getElementById('cal-event-end-time').value   = '10:00';
  document.getElementById('cal-event-memo').value       = '';
  document.getElementById('cal-event-allday').checked   = true;
  document.getElementById('cal-time-row').style.display = 'none';
  const blueRadio = document.querySelector('input[name="cal-color"][value="blue"]');
  if(blueRadio) blueRadio.checked = true;
}

/* ── 일정 저장 (추가/수정) ── */
async function saveCalEvent() {
  const title = document.getElementById('cal-event-title').value.trim();
  if(!title){ toast('일정 제목을 입력하세요.','error'); return; }
  const startDate = document.getElementById('cal-event-start-date').value;
  if(!startDate){ toast('시작일을 선택하세요.','error'); return; }

  const editId    = document.getElementById('cal-event-id').value;
  const endDate   = document.getElementById('cal-event-end-date').value || startDate;
  const allDay    = document.getElementById('cal-event-allday').checked;
  const color     = document.querySelector('input[name="cal-color"]:checked')?.value || 'blue';
  const startTime = allDay ? '' : document.getElementById('cal-event-start-time').value;
  const endTime   = allDay ? '' : document.getElementById('cal-event-end-time').value;
  const memo      = document.getElementById('cal-event-memo').value.trim();

  const btn = document.getElementById('btn-save-cal-event');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 저장 중...';

  try {
    const data = { title, start_date:startDate, end_date:endDate,
      start_time:startTime, end_time:endTime, color, memo, all_day:allDay,
      author_id: State.owner.id };

    if(editId) {
      const ex = State.calendarEvents.find(e=>e.id===editId);
      const r  = await api.put('calendar_events', editId, {...ex, ...data});
      const idx = State.calendarEvents.findIndex(e=>e.id===editId);
      if(idx!==-1) State.calendarEvents[idx] = r;
      toast('일정이 수정되었습니다.','success');
    } else {
      const r = await api.post('calendar_events', {id:genId(), ...data});
      State.calendarEvents.push(r);
      toast('일정이 추가되었습니다! 🗓️','success');
    }
    closeModal('modal-cal-event');
    renderCalendar();
  } catch(e) {
    toast('저장 중 오류가 발생했습니다.','error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-check"></i> 저장';
  }
}

/* ── 일정 삭제 ── */
async function deleteCalEvent() {
  const editId = document.getElementById('cal-event-id').value;
  if(!editId) return;
  if(!confirm('이 일정을 삭제하시겠습니까?')) return;
  try {
    await api.del('calendar_events', editId);
    State.calendarEvents = State.calendarEvents.filter(e=>e.id!==editId);
    closeModal('modal-cal-event');
    renderCalendar();
    toast('일정이 삭제되었습니다.','success');
  } catch(e) {
    toast('삭제 중 오류가 발생했습니다.','error');
  }
}

/* ============================================================  MESSENGER  ============================================================ */
function renderMessenger() {
  // 모바일 레이아웃 초기화 — 채팅방 목록 표시
  if (window.innerWidth <= 768) {
    const msnSidebar = document.querySelector('.messenger-sidebar');
    const chatMain   = document.getElementById('messenger-main');
    if (msnSidebar) msnSidebar.style.display = '';
    if (chatMain && !State.currentRoomId) chatMain.style.display = 'none';
  }

  const search=(document.getElementById('room-search')?.value||'').toLowerCase();
  // 나간 방은 목록에서 숨김
  let rooms=State.chatRooms.filter(r=>!(r.left_members||[]).includes(State.owner.id));
  if(search) rooms=rooms.filter(r=>r.name.toLowerCase().includes(search));

  // 전체 조직원 채널을 항상 최상단 고정
  const allHandsRoom = rooms.find(r=>r.id==='room_allhands');
  const otherRooms   = rooms.filter(r=>r.id!=='room_allhands');
  const sortedRooms  = allHandsRoom ? [allHandsRoom, ...otherRooms] : otherRooms;

  document.getElementById('room-list').innerHTML=sortedRooms.length?sortedRooms.map(r=>{
    const isAllHands = r.id==='room_allhands';
    const isDM = r.type==='dm';
    const isGroup = r.type==='group';
    const isChannel = r.type==='channel';
    const otherMid = isDM?(r.members||[]).find(mid=>mid!==State.owner.id):null;
    const otherM = otherMid?getMember(otherMid):null;
    // 멤버 수 표시
    const memberCount = isAllHands ? State.members.length + 1 : (r.members||[]).length;
    const countBadge  = isAllHands ? `<span class="room-allhands-badge"><i class="fas fa-users"></i> 전체 ${memberCount}명</span>` : '';
    // 아이콘
    let iconEl;
    if(isDM) {
      iconEl = otherM
        ? `<span class="room-icon avatar-room" style="background:${otherM.avatar_color||'#1B3A6B'}">${otherM.name.charAt(0)}</span>`
        : `<span class="room-icon avatar-room">?</span>`;
    } else if(isGroup) {
      // 그룹방: 이모지 아이콘 + 멤버 수 뱃지
      iconEl = `<span class="room-icon room-icon-group" style="position:relative">${r.icon||'👥'}<span class="room-member-count-badge">${memberCount}</span></span>`;
    } else {
      iconEl = `<span class="room-icon ${isAllHands?'room-icon-allhands':''}">${r.icon||'💬'}</span>`;
    }
    const displayName = isDM?(otherM?.name||r.name):r.name;
    // 유형 뱃지
    const typeBadge = isGroup ? `<span class="room-type-badge room-type-group">그룹</span>` :
                      isChannel&&!isAllHands ? `<span class="room-type-badge room-type-channel">채널</span>` : '';
    return `<div class="room-item ${r.id===State.currentRoomId?'active':''} ${isAllHands?'room-item-allhands':''} ${isGroup?'room-item-group':''}" onclick="openRoom('${r.id}')">
      ${iconEl}<div class="room-info">
        <div class="room-name">${displayName}${typeBadge}${countBadge}</div>
        <div class="room-preview">${r.last_message||'메시지 없음'}</div>
      </div><div class="room-meta"><span class="room-time">방금</span></div></div>`;
  }).join(''):emptyState('comment-dots','대화가 없습니다');
}

function openRoom(roomId) {
  State.currentRoomId=roomId;
  const room=State.chatRooms.find(r=>r.id===roomId); if(!room) return;
  const isDM=room.type==='dm'; const otherMid=isDM?(room.members||[]).find(mid=>mid!==State.owner.id):null;
  const otherM=otherMid?getMember(otherMid):null;
  const dispName=isDM?(otherM?.name||room.name):room.name;
  // 전체 조직원 채널은 항상 전체 멤버 수 표시
  const isAllHands = roomId === 'room_allhands';
  const mems = isAllHands ? (State.members.length + 1) : (isDM ? 2 : (room.members||[]).length);
  const subLabel = isDM ? '1:1 대화' : (isAllHands ? `전체 조직원 채널 · ${mems}명 참여` : `${mems}명 참여`);

  // 사이드바 active 업데이트
  document.querySelectorAll('.room-item').forEach(el=>el.classList.remove('active'));
  const items=document.querySelectorAll('.room-item');
  items.forEach(el=>{ if(el.onclick?.toString().includes(roomId)) el.classList.add('active'); });
  renderMessenger();

  document.getElementById('messenger-empty').style.display='none';
  const ca=document.getElementById('chat-area'); ca.style.display='flex'; ca.style.flexDirection='column'; ca.style.height='100%';

  // 모바일: 채팅방 선택 시 사이드바 숨기고 채팅 영역 포커스
  if (window.innerWidth <= 768) {
    const msnSidebar = document.querySelector('.messenger-sidebar');
    const chatMain   = document.getElementById('messenger-main');
    if (msnSidebar) msnSidebar.style.display = 'none';
    if (chatMain)   chatMain.style.display   = 'flex';
  }

  // 그룹/채널 방에서 멤버 목록 미리보기 (최대 5명)
  const isGroup = room.type==='group';
  const isChannel = room.type==='channel';
  let memberAvatarsHtml = '';
  if((isGroup||isChannel)&&!isAllHands) {
    const mList = (room.members||[]).slice(0,5).map(mid=>{
      const m=getMember(mid); if(!m) return '';
      return `<span class="avatar avatar-sm ch-member-av" style="background:${m.avatar_color||'#1B3A6B'}" title="${m.name}">${m.name.charAt(0)}</span>`;
    }).join('');
    memberAvatarsHtml = `<div class="ch-member-avatars">${mList}${(room.members||[]).length>5?`<span class="ch-member-more">+${(room.members||[]).length-5}</span>`:''}</div>`;
  }
  // 나가기 버튼 (DM + 전체 채널 제외)
  const canLeave = !isDM && !isAllHands;
  const leaveBtn = canLeave
    ? `<button class="btn btn-ghost btn-sm chat-leave-btn" onclick="confirmLeaveRoom('${roomId}')" title="소통방 나가기"><i class="fas fa-sign-out-alt"></i></button>`
    : '';
  // 그룹/채널 초대 버튼
  const inviteBtn = (isGroup||isChannel)&&!isAllHands
    ? `<button class="btn btn-ghost btn-sm" onclick="openInviteToRoom('${roomId}')" title="멤버 초대"><i class="fas fa-user-plus"></i></button>`
    : '';

  document.getElementById('chat-header').innerHTML=`
    ${isDM&&otherM?`<span class="avatar" style="background:${otherM.avatar_color||'#1B3A6B'}">${otherM.name.charAt(0)}</span>`:(isAllHands?`<span style="font-size:26px">🏢</span>`:`<span style="font-size:22px">${room.icon||'💬'}</span>`)}
    <div class="chat-header-info">
      <div class="chat-header-name">${dispName}</div>
      <div class="chat-header-sub">${subLabel} ${memberAvatarsHtml}</div>
    </div>
    <div class="chat-header-actions">
      ${window.innerWidth <= 768 ? `<button class="btn btn-ghost btn-sm" onclick="closeMobileChat()" title="채팅방 목록"><i class="fas fa-arrow-left"></i></button>` : ''}
      ${inviteBtn}
      <button class="btn btn-ghost btn-sm" title="통화"><i class="fas fa-phone"></i></button>
      <button class="btn btn-ghost btn-sm" title="영상통화"><i class="fas fa-video"></i></button>
      ${leaveBtn}
    </div>`;

  renderChatMessages(roomId);
}

/* ── 시스템 메시지 판별 ── */
function _isSysMsg(msg) { return msg.sender_id === 'system'; }

/* ── 메시지 렌더 (전체) ── */
function renderChatMessages(roomId) {
  const msgs = State.messages.filter(m => m.room_id === roomId);
  const box  = document.getElementById('chat-messages');
  if (!box) return;

  if (!msgs.length) {
    box.innerHTML = '<div class="msg-empty">대화를 시작해보세요! 👋</div>';
    box.scrollTop = box.scrollHeight;
    return;
  }

  box.innerHTML = msgs.map(msg => _renderMsgRow(msg)).join('');
  box.scrollTop = box.scrollHeight;
}

function _renderMsgRow(msg) {
  /* 시스템 메시지 (입장/퇴장 알림) */
  if (_isSysMsg(msg)) {
    return `<div class="msg-system"><i class="fas fa-info-circle"></i> ${escHtml(msg.content||'')}</div>`;
  }

  /* 삭제된 메시지 */
  if (msg.msg_deleted) {
    const mine   = msg.sender_id === State.owner.id;
    const sender = getMember(msg.sender_id);
    return `<div class="msg-row ${mine?'mine':''}" id="msgrow-${msg.id}">
      ${!mine ? avatarEl(sender,'avatar-sm') : ''}
      <div class="msg-col">
        ${!mine ? `<div class="msg-sender">${escHtml(sender?.name||'알 수 없음')}</div>` : ''}
        <div class="msg-bubble msg-deleted ${mine?'msg-sent':'msg-received'}">
          <i class="fas fa-ban"></i> 삭제된 메시지입니다.
        </div>
        <div class="msg-meta">${relTime(msg.created_at||Date.now())}</div>
      </div>
    </div>`;
  }

  const mine   = msg.sender_id === State.owner.id;
  const sender = getMember(msg.sender_id);

  /* 리액션 */
  let reactionsHtml = '';
  try {
    const rxs = JSON.parse(msg.msg_reactions || '[]');
    if (rxs.length) {
      const grouped = {};
      rxs.forEach(r => { grouped[r.emoji] = grouped[r.emoji] || []; grouped[r.emoji].push(r.userId); });
      reactionsHtml = `<div class="msg-reactions">` +
        Object.entries(grouped).map(([emoji, uids]) => {
          const reacted = uids.includes(State.owner.id);
          return `<button class="msg-reaction-chip ${reacted?'reacted':''}" onclick="toggleReaction('${msg.id}','${emoji}')" title="${uids.map(id=>getMember(id)?.name||id).join(', ')}">${emoji} <span>${uids.length}</span></button>`;
        }).join('') + `</div>`;
    }
  } catch(e) {}

  /* 답글 스레드 미리보기 */
  let threadHtml = '';
  try {
    const thread = JSON.parse(msg.msg_thread || '[]');
    if (thread.length) {
      const preview = thread.slice(-2);
      threadHtml = `<div class="msg-thread-preview" onclick="openMsgThread('${msg.id}')">
        <div class="mtp-bar"></div>
        <div class="mtp-content">
          <div class="mtp-replies">${preview.map(r => {
            const rm = getMember(r.authorId);
            return `${avatarEl(rm||{name:r.author||'?',avatar_color:'#999'},'avatar-xs')}`;
          }).join('')}
          <span class="mtp-count"><b>${thread.length}</b>개의 답글</span>
          <span class="mtp-last">${relTime(preview[preview.length-1]?.ts||Date.now())}</span>
          </div>
        </div>
      </div>`;
    }
  } catch(e) {}

  /* 호버 액션 버튼 바 */
  const isMine = mine;
  const emojiPickerBtns = ['👍','❤️','😂','😮','😢','🔥'].map(e =>
    `<button class="msg-act-emoji" onclick="toggleReaction('${msg.id}','${e}')" title="${e}">${e}</button>`
  ).join('');
  const actionBar = `<div class="msg-action-bar ${isMine?'bar-mine':'bar-other'}">
    <div class="msg-act-emojis">${emojiPickerBtns}</div>
    <button class="msg-act-btn" onclick="openMsgThread('${msg.id}')" title="답글"><i class="fas fa-reply"></i></button>
    ${isMine ? `<button class="msg-act-btn" onclick="startEditMsg('${msg.id}')" title="수정"><i class="fas fa-pencil-alt"></i></button>` : ''}
    ${isMine ? `<button class="msg-act-btn msg-act-del" onclick="deleteMsg('${msg.id}')" title="삭제"><i class="fas fa-trash"></i></button>` : ''}
  </div>`;

  /* 수정됨 표시 */
  const editedMark = msg.msg_edited ? `<span class="msg-edited-mark">(수정됨)</span>` : '';

  return `<div class="msg-row ${mine?'mine':''}" id="msgrow-${msg.id}">
    ${!mine ? avatarEl(sender,'avatar-sm') : ''}
    <div class="msg-col">
      ${!mine ? `<div class="msg-sender">${escHtml(sender?.name||'알 수 없음')}</div>` : ''}
      <div class="msg-bubble-wrap">
        <div class="msg-bubble ${mine?'msg-sent':'msg-received'}" id="msgbubble-${msg.id}">${renderMsgContent(msg)}</div>
        ${actionBar}
      </div>
      ${reactionsHtml}
      <div class="msg-meta">${relTime(msg.created_at||Date.now())}${editedMark}</div>
      ${threadHtml}
    </div>
  </div>`;
}

function renderMsgContent(msg) {
  const mt = msg.msg_type || 'text';
  if (mt === 'text') return escHtml(msg.content||'');
  // 리치텍스트 (서식 포함 HTML)
  if (mt === 'rich_text') return `<span class="msg-rich-content">${msg.content||''}</span>`;
  if (mt === 'image') return `
    <div style="position:relative;display:inline-block">
      <img src="${msg.data_url}" class="msg-bubble-image" alt="${escHtml(msg.file_name||'이미지')}" onclick="openLightbox('${msg.data_url}')" loading="lazy">
      <a href="${msg.data_url}" download="${escHtml(msg.file_name||'image')}" class="msg-file-dl-btn" title="이미지 다운로드" style="position:absolute;bottom:6px;right:6px">
        <i class="fas fa-download"></i>
      </a>
    </div>`;
  if (mt === 'video') return `
    <div style="position:relative;display:inline-block">
      <video src="${msg.data_url}" class="msg-bubble-video" controls></video>
      <a href="${msg.data_url}" download="${escHtml(msg.file_name||'video')}" class="msg-file-dl-btn" title="영상 다운로드" style="position:absolute;top:6px;right:6px">
        <i class="fas fa-download"></i>
      </a>
    </div>`;
  // file
  const icon = getFileIcon(msg.file_type||'');
  return `<a href="${msg.data_url||'#'}" download="${escHtml(msg.file_name||'파일')}" class="msg-file-card">
    <i class="fas ${icon}"></i>
    <div class="mfc-info">
      <div class="mfc-name">${escHtml(msg.file_name||'파일')}</div>
      <div class="mfc-size">${fmtSize(msg.file_size||0)}</div>
    </div>
    <i class="fas fa-download" style="font-size:14px;opacity:.7"></i>
  </a>`;
}

/* ── 메시지 수정 (인라인) ── */
let _editingMsgId = null;

function startEditMsg(msgId) {
  if (_editingMsgId && _editingMsgId !== msgId) cancelEditMsg(_editingMsgId);
  _editingMsgId = msgId;
  const msg = State.messages.find(m => m.id === msgId);
  if (!msg || msg.msg_type !== 'text') { toast('텍스트 메시지만 수정할 수 있습니다.', 'info'); return; }
  const bubble = document.getElementById(`msgbubble-${msgId}`);
  if (!bubble) return;
  const original = escHtml(msg.content || '');
  bubble.innerHTML = `
    <div class="msg-edit-wrap">
      <textarea class="msg-edit-input" id="msgedit-${msgId}">${msg.content||''}</textarea>
      <div class="msg-edit-actions">
        <button class="btn btn-primary btn-xs" onclick="saveEditMsg('${msgId}')"><i class="fas fa-check"></i> 저장</button>
        <button class="btn btn-ghost btn-xs" onclick="cancelEditMsg('${msgId}')"><i class="fas fa-times"></i> 취소</button>
      </div>
    </div>`;
  const ta = document.getElementById(`msgedit-${msgId}`);
  if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  // Enter → 저장, Shift+Enter → 줄바꿈, Esc → 취소
  ta?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEditMsg(msgId); }
    if (e.key === 'Escape') cancelEditMsg(msgId);
  });
}

async function saveEditMsg(msgId) {
  const ta = document.getElementById(`msgedit-${msgId}`);
  const newText = ta?.value.trim();
  if (!newText) { toast('내용을 입력하세요.', 'error'); return; }
  const msg = State.messages.find(m => m.id === msgId);
  if (!msg) return;
  try {
    const updated = await api.patch('messages', msgId, { content: newText, msg_edited: true });
    msg.content = updated.content ?? newText;
    msg.msg_edited = true;
    _editingMsgId = null;
    // 해당 row만 re-render
    const row = document.getElementById(`msgrow-${msgId}`);
    if (row) row.outerHTML = _renderMsgRow(msg);
    toast('메시지가 수정되었습니다.', 'success');
  } catch(e) { toast('수정 오류', 'error'); }
}

function cancelEditMsg(msgId) {
  _editingMsgId = null;
  const msg = State.messages.find(m => m.id === msgId);
  if (!msg) return;
  const bubble = document.getElementById(`msgbubble-${msgId}`);
  if (bubble) bubble.innerHTML = renderMsgContent(msg);
}

/* ── 메시지 삭제 (소프트) ── */
async function deleteMsg(msgId) {
  if (!confirm('이 메시지를 삭제하시겠습니까?')) return;
  const msg = State.messages.find(m => m.id === msgId);
  if (!msg) return;
  try {
    await api.patch('messages', msgId, { msg_deleted: true });
    msg.msg_deleted = true;
    const row = document.getElementById(`msgrow-${msgId}`);
    if (row) row.outerHTML = _renderMsgRow(msg);
    // 마지막 메시지면 채팅방 목록 갱신
    const room = State.chatRooms.find(r => r.id === msg.room_id);
    if (room && room.last_message === msg.content) {
      room.last_message = '메시지가 삭제되었습니다.';
      renderMessenger();
    }
  } catch(e) { toast('삭제 오류', 'error'); }
}

/* ── 이모지 리액션 토글 ── */
async function toggleReaction(msgId, emoji) {
  const msg = State.messages.find(m => m.id === msgId);
  if (!msg) return;
  let rxs = [];
  try { rxs = JSON.parse(msg.msg_reactions || '[]'); } catch(e) { rxs = []; }
  const myIdx = rxs.findIndex(r => r.emoji === emoji && r.userId === State.owner.id);
  if (myIdx >= 0) rxs.splice(myIdx, 1);   // 토글 off
  else rxs.push({ emoji, userId: State.owner.id });
  try {
    await api.patch('messages', msgId, { msg_reactions: JSON.stringify(rxs) });
    msg.msg_reactions = JSON.stringify(rxs);
    const row = document.getElementById(`msgrow-${msgId}`);
    if (row) row.outerHTML = _renderMsgRow(msg);
  } catch(e) { toast('리액션 오류', 'error'); }
}

/* ── 답글 스레드 모달 오픈 ── */
function openMsgThread(msgId) {
  const msg = State.messages.find(m => m.id === msgId);
  if (!msg) return;
  _threadMsgId = msgId;
  _renderMsgThreadModal(msg);
  openModal('modal-msg-thread');
}

let _threadMsgId = null;

function _renderMsgThreadModal(msg) {
  // 원본 메시지
  const origEl = document.getElementById('mth-original-msg');
  if (origEl) {
    const sender = getMember(msg.sender_id);
    origEl.innerHTML = `
      <div class="mth-orig-row">
        ${avatarEl(sender, 'avatar-sm')}
        <div class="mth-orig-body">
          <div class="mth-orig-name">${escHtml(sender?.name || '알 수 없음')} <span class="mth-orig-time">${relTime(msg.created_at||Date.now())}</span></div>
          <div class="mth-orig-content">${renderMsgContent(msg)}</div>
        </div>
      </div>`;
  }
  // 답글 목록
  _renderThreadReplies(msg);
}

function _renderThreadReplies(msg) {
  let thread = [];
  try { thread = JSON.parse(msg.msg_thread || '[]'); } catch(e) { thread = []; }
  const box = document.getElementById('mth-replies-list');
  if (!box) return;
  if (!thread.length) {
    box.innerHTML = '<div class="mth-no-reply">첫 번째 답글을 남겨보세요!</div>';
    return;
  }
  box.innerHTML = thread.map((r, i) => {
    const rm = getMember(r.authorId);
    const isMe = r.authorId === State.owner.id;
    return `<div class="mth-reply-item" id="mth-reply-${i}">
      ${avatarEl(rm || {name: r.author||'?', avatar_color:'#999'}, 'avatar-sm')}
      <div class="mth-reply-body">
        <div class="mth-reply-header">
          <span class="mth-reply-author">${escHtml(r.author||'알 수 없음')}</span>
          <span class="mth-reply-time">${relTime(r.ts||Date.now())}</span>
          ${isMe ? `<div class="mth-reply-actions">
            <button onclick="editThreadReply(${i})" title="수정"><i class="fas fa-pencil-alt"></i></button>
            <button onclick="deleteThreadReply(${i})" title="삭제"><i class="fas fa-trash"></i></button>
          </div>` : ''}
        </div>
        <div class="mth-reply-text" id="mth-reply-text-${i}">${escHtml(r.text||'')}</div>
        <div class="mth-reply-edit-row" id="mth-reply-edit-${i}" style="display:none">
          <textarea class="mth-reply-edit-input" id="mth-reply-edit-input-${i}">${escHtml(r.text||'')}</textarea>
          <div style="display:flex;gap:6px;margin-top:5px">
            <button class="btn btn-primary btn-xs" onclick="saveThreadReplyEdit(${i})"><i class="fas fa-check"></i> 저장</button>
            <button class="btn btn-ghost btn-xs" onclick="cancelThreadReplyEdit(${i})"><i class="fas fa-times"></i> 취소</button>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
  box.scrollTop = box.scrollHeight;
}

async function addThreadReply() {
  const inp = document.getElementById('mth-reply-input');
  const text = (inp?.value||'').trim();
  if (!text) { toast('내용을 입력하세요.', 'error'); return; }
  const msg = State.messages.find(m => m.id === _threadMsgId);
  if (!msg) return;
  let thread = [];
  try { thread = JSON.parse(msg.msg_thread || '[]'); } catch(e) { thread = []; }
  thread.push({ id: genId(), authorId: State.owner.id, author: State.owner.name||'나', text, ts: Date.now() });
  try {
    await api.patch('messages', msg.id, { msg_thread: JSON.stringify(thread) });
    msg.msg_thread = JSON.stringify(thread);
    inp.value = '';
    _renderThreadReplies(msg);
    // 원본 메시지 row도 갱신 (스레드 미리보기 업데이트)
    const row = document.getElementById(`msgrow-${msg.id}`);
    if (row) row.outerHTML = _renderMsgRow(msg);
    toast('답글이 등록되었습니다.', 'success');
  } catch(e) { toast('답글 오류', 'error'); }
}

function editThreadReply(idx) {
  document.getElementById(`mth-reply-text-${idx}`).style.display = 'none';
  document.getElementById(`mth-reply-edit-${idx}`).style.display = 'block';
  document.getElementById(`mth-reply-edit-input-${idx}`)?.focus();
}
function cancelThreadReplyEdit(idx) {
  document.getElementById(`mth-reply-text-${idx}`).style.display = '';
  document.getElementById(`mth-reply-edit-${idx}`).style.display = 'none';
}
async function saveThreadReplyEdit(idx) {
  const newText = document.getElementById(`mth-reply-edit-input-${idx}`)?.value.trim();
  if (!newText) { toast('내용을 입력하세요.', 'error'); return; }
  const msg = State.messages.find(m => m.id === _threadMsgId);
  if (!msg) return;
  let thread = [];
  try { thread = JSON.parse(msg.msg_thread || '[]'); } catch(e) { thread = []; }
  thread[idx] = { ...thread[idx], text: newText, edited: true };
  try {
    await api.patch('messages', msg.id, { msg_thread: JSON.stringify(thread) });
    msg.msg_thread = JSON.stringify(thread);
    _renderThreadReplies(msg);
    toast('답글이 수정되었습니다.', 'success');
  } catch(e) { toast('수정 오류', 'error'); }
}
async function deleteThreadReply(idx) {
  if (!confirm('답글을 삭제하시겠습니까?')) return;
  const msg = State.messages.find(m => m.id === _threadMsgId);
  if (!msg) return;
  let thread = [];
  try { thread = JSON.parse(msg.msg_thread || '[]'); } catch(e) { thread = []; }
  thread.splice(idx, 1);
  try {
    await api.patch('messages', msg.id, { msg_thread: JSON.stringify(thread) });
    msg.msg_thread = JSON.stringify(thread);
    _renderThreadReplies(msg);
    const row = document.getElementById(`msgrow-${msg.id}`);
    if (row) row.outerHTML = _renderMsgRow(msg);
    toast('답글이 삭제되었습니다.', 'success');
  } catch(e) { toast('삭제 오류', 'error'); }
}

async function sendMessage() {
  const inp = document.getElementById('chat-input-rich');
  // HTML 내용 (서식 포함) 과 순수 텍스트 둘 다 추출
  const htmlContent = inp ? inp.innerHTML.trim() : '';
  const plainText   = inp ? inp.innerText.trim()  : '';
  if(!plainText && _chatPendingFiles.length===0) return;
  if(!State.currentRoomId) return;
  // 서식이 있으면 html, 없으면 text
  const hasFormatting = htmlContent !== escHtml(plainText) && htmlContent !== plainText;
  const msgType = hasFormatting ? 'rich_text' : 'text';
  const content = hasFormatting ? htmlContent : plainText;
  try{
    if(_chatPendingFiles.length > 0) {
      for(const f of _chatPendingFiles) {
        const mt = f.file.type.startsWith('image/') ? 'image' : f.file.type.startsWith('video/') ? 'video' : 'file';
        const d = {id:genId(),room_id:State.currentRoomId,sender_id:State.owner.id,
          content: mt==='file'?(plainText||f.file.name):(plainText||''),
          msg_type:mt, file_name:f.file.name, file_size:f.file.size, file_type:f.file.type,
          data_url:f.dataUrl, read_by:[State.owner.id]};
        const r=await api.post('messages',d); State.messages.push(r);
      }
      _chatPendingFiles=[];
      const cap=document.getElementById('chat-attach-preview'); if(cap) cap.innerHTML='';
    }
    if(plainText && _chatPendingFiles.length===0) {
      const d={id:genId(),room_id:State.currentRoomId,sender_id:State.owner.id,
        content, msg_type: msgType, read_by:[State.owner.id]};
      const r=await api.post('messages',d); State.messages.push(r);
    }
    const room=State.chatRooms.find(x=>x.id===State.currentRoomId);
    if(room){ room.last_message=plainText||'[파일]'; room.last_sender_id=State.owner.id; }
    if(inp){ inp.innerHTML=''; }
    renderChatMessages(State.currentRoomId); renderMessenger();
  } catch(e){ toast('전송 오류','error'); }
}

function openDMWith(memberId) {
  const m=getMember(memberId); if(!m) return;
  const existing=State.chatRooms.find(r=>r.type==='dm'&&(r.members||[]).includes(memberId)&&(r.members||[]).includes(State.owner.id));
  if(existing){ showPage('messenger'); setTimeout(()=>openRoom(existing.id),200); return; }
  toast(`${m.name}님과의 1:1 대화를 시작하세요!`,'info');
  showPage('messenger');
}

/* ── 새 소통방 모달 탭 전환 ── */
function switchRoomTab(type) {
  document.getElementById('room-type').value = type;
  // 탭 active
  ['dm','group','channel'].forEach(t=>{
    const btn=document.getElementById(`nr-tab-${t}`);
    if(btn) btn.classList.toggle('active', t===type);
  });
  // 방 이름 / 아이콘 그룹 (그룹·채널만 표시)
  const nameGroup = document.getElementById('room-name-group');
  if(nameGroup) nameGroup.style.display = (type==='group'||type==='channel') ? 'block' : 'none';
  // 선택 칩 (그룹·채널만)
  const chips = document.getElementById('nr-selected-chips');
  if(chips) chips.style.display = (type==='group'||type==='channel') ? 'block' : 'none';
  // 라벨 변경
  const lbl = document.getElementById('room-member-label');
  if(lbl) lbl.textContent = type==='dm' ? '대화할 상대를 1명 선택하세요' : '참여자를 선택하세요 (다중 선택 가능)';
  // DM은 체크박스, 그룹/채널은 체크박스 복수
  renderNewRoomModal();
  // 아이콘 기본값
  const iconBtn = document.getElementById('nr-icon-btn');
  if(iconBtn) iconBtn.textContent = type==='channel' ? '📢' : '👥';
  document.getElementById('room-icon-value').value = type==='channel' ? '📢' : '👥';
}

function renderNewRoomModal() {
  const type = document.getElementById('room-type')?.value || 'dm';
  const search = (document.getElementById('room-member-search')?.value||'').toLowerCase();
  const list=document.getElementById('member-check-list'); if(!list) return;
  const filtered = State.members.filter(m=>m.id!==State.owner.id && (!search||m.name.toLowerCase().includes(search)||( m.department||'').toLowerCase().includes(search)));
  list.innerHTML = filtered.length ? filtered.map(m=>`
    <label class="member-check-item nr-member-item" data-id="${m.id}" onclick="toggleRoomMember('${m.id}','${type}',this)">
      <span class="nr-check-indicator" id="nr-chk-${m.id}"><i class="fas fa-check"></i></span>
      ${avatarEl(m,'avatar-sm')}
      <span class="nr-member-name">${m.name}</span>
      <small class="nr-member-role">${ROLE_LABEL[m.role]||m.role}</small>
      <small class="nr-member-dept">${m.department||''}</small>
    </label>`).join('') : `<div style="text-align:center;color:var(--text-muted);padding:12px;font-size:13px">검색 결과가 없습니다.</div>`;
}

// 선택된 멤버 Set
window._nrSelectedMembers = new Set();

function toggleRoomMember(memberId, type, el) {
  if(type==='dm') {
    // DM은 1명만
    window._nrSelectedMembers.clear();
    document.querySelectorAll('.nr-member-item').forEach(e=>e.classList.remove('selected'));
    document.querySelectorAll('.nr-check-indicator').forEach(e=>e.classList.remove('active'));
    window._nrSelectedMembers.add(memberId);
    el.classList.add('selected');
    const chk=document.getElementById(`nr-chk-${memberId}`);
    if(chk) chk.classList.add('active');
  } else {
    // 그룹/채널 복수 선택
    if(window._nrSelectedMembers.has(memberId)) {
      window._nrSelectedMembers.delete(memberId);
      el.classList.remove('selected');
      const chk=document.getElementById(`nr-chk-${memberId}`);
      if(chk) chk.classList.remove('active');
    } else {
      window._nrSelectedMembers.add(memberId);
      el.classList.add('selected');
      const chk=document.getElementById(`nr-chk-${memberId}`);
      if(chk) chk.classList.add('active');
    }
    renderSelectedChips();
  }
}

function renderSelectedChips() {
  const inner = document.getElementById('nr-chips-inner'); if(!inner) return;
  const ids = [...window._nrSelectedMembers];
  inner.innerHTML = ids.map(id=>{
    const m=getMember(id)||State.owner;
    return `<span class="nr-chip" style="background:${m.avatar_color||'#1B3A6B'}22;border-color:${m.avatar_color||'#1B3A6B'}44">
      <span class="avatar" style="width:18px;height:18px;font-size:9px;background:${m.avatar_color||'#1B3A6B'}">${m.name.charAt(0)}</span>
      ${m.name}
      <button onclick="removeRoomMemberChip('${id}')" style="background:none;border:none;cursor:pointer;padding:0;margin-left:3px;color:var(--text-muted);font-size:11px"><i class="fas fa-times"></i></button>
    </span>`;
  }).join('');
}

function removeRoomMemberChip(memberId) {
  window._nrSelectedMembers.delete(memberId);
  const el=document.querySelector(`.nr-member-item[data-id="${memberId}"]`);
  if(el) el.classList.remove('selected');
  const chk=document.getElementById(`nr-chk-${memberId}`);
  if(chk) chk.classList.remove('active');
  renderSelectedChips();
}

function filterRoomMemberList() { renderNewRoomModal(); }

function openIconPicker() {
  const picker=document.getElementById('nr-icon-picker');
  if(picker) picker.style.display=picker.style.display==='none'?'block':'none';
}

function selectRoomIcon(emoji) {
  document.getElementById('room-icon-value').value=emoji;
  document.getElementById('nr-icon-btn').textContent=emoji;
  const picker=document.getElementById('nr-icon-picker');
  if(picker) picker.style.display='none';
}

async function createRoom() {
  const type = document.getElementById('room-type').value;
  const name = (document.getElementById('new-room-name')?.value||'').trim();
  const selected = [...window._nrSelectedMembers];
  const icon = document.getElementById('room-icon-value')?.value || (type==='channel'?'📢':'👥');

  if(!selected.length){ toast('참여자를 선택하세요.','error'); return; }
  if(type!=='dm' && !name){ toast('소통방 이름을 입력하세요.','error'); return; }

  // DM: 이미 존재하는 방 있으면 이동
  if(type==='dm') {
    const existing=State.chatRooms.find(r=>r.type==='dm'&&(r.members||[]).includes(selected[0])&&(r.members||[]).includes(State.owner.id));
    if(existing){
      closeModal('modal-new-room');
      setTimeout(()=>openRoom(existing.id),200);
      return;
    }
  }

  const roomName = type==='dm' ? (getMember(selected[0])?.name||'DM') : name;
  const data = {
    id:genId(), name:roomName, type,
    members:[State.owner.id,...selected],
    left_members:[],
    last_message:'', last_sender_id:'', icon
  };
  try{
    const r=await api.post('chat_rooms',data); State.chatRooms.push(r);
    closeModal('modal-new-room');
    toast(type==='dm'?'1:1 대화가 시작되었습니다.':type==='group'?`'${roomName}' 단체 소통방이 생성되었습니다.`:`'${roomName}' 채널이 생성되었습니다.`,'success');
    renderMessenger(); setTimeout(()=>openRoom(r.id),300);
    // 입장 시스템 메시지 (그룹/채널)
    if(type!=='dm') {
      const sysMsg={id:genId(),room_id:r.id,sender_id:'system',content:`'${roomName}' 소통방이 개설되었습니다. ${roomName} 에 오신 것을 환영합니다! 🎉`,msg_type:'text',read_by:[]};
      const sm=await api.post('messages',sysMsg); State.messages.push(sm);
      r.last_message=sysMsg.content; r.last_sender_id='system';
      renderChatMessages(r.id);
    }
  } catch(e){ toast('오류가 발생했습니다.','error'); }
}

/* ── 멤버 초대 (기존 그룹/채널에 추대) ── */
async function openInviteToRoom(roomId) {
  const room=State.chatRooms.find(r=>r.id===roomId); if(!room) return;
  // 이미 참여 중인 멤버 제외한 목록으로 새 모달 열기
  window._inviteTargetRoomId = roomId;
  // 멤버 선택 초기화 후 초대 모달 활용
  window._nrSelectedMembers = new Set();
  renderNewRoomModal();
  // 이미 참여중인 멤버 선택 불가 표시
  setTimeout(()=>{
    (room.members||[]).forEach(mid=>{
      const el=document.querySelector(`.nr-member-item[data-id="${mid}"]`);
      if(el){ el.classList.add('already-joined'); el.onclick=null; el.title='이미 참여 중'; }
    });
  },50);
  // 제목 변경
  const titleEl=document.getElementById('new-room-modal-title');
  if(titleEl) titleEl.innerHTML=`<i class="fas fa-user-plus" style="color:var(--primary);margin-right:8px"></i>멤버 초대`;
  const btn=document.getElementById('btn-create-room');
  if(btn){ btn.innerHTML='<i class="fas fa-user-plus"></i> 초대'; btn.onclick=()=>confirmInviteToRoom(); }
  openModal('modal-new-room');
}

async function confirmInviteToRoom() {
  const roomId=window._inviteTargetRoomId; if(!roomId) return;
  const room=State.chatRooms.find(r=>r.id===roomId); if(!room) return;
  const newMembers=[...window._nrSelectedMembers];
  if(!newMembers.length){ toast('초대할 멤버를 선택하세요.','error'); return; }
  const updatedMembers=[...new Set([...(room.members||[]),...newMembers])];
  // left_members에서 재초대 멤버 제거
  const updatedLeft=(room.left_members||[]).filter(id=>!newMembers.includes(id));
  try{
    const updated=await api.put('chat_rooms',roomId,{...room,members:updatedMembers,left_members:updatedLeft});
    Object.assign(room,updated);
    closeModal('modal-new-room');
    const names=newMembers.map(id=>getMember(id)?.name||id).join(', ');
    toast(`${names}님을 초대했습니다.`,'success');
    // 시스템 메시지
    const sysMsg={id:genId(),room_id:roomId,sender_id:'system',content:`${names}님이 소통방에 초대되었습니다. 👋`,msg_type:'text',read_by:[]};
    const sm=await api.post('messages',sysMsg); State.messages.push(sm);
    room.last_message=sysMsg.content;
    renderChatMessages(roomId); renderMessenger();
    // 헤더 버튼 원복
    const btn=document.getElementById('btn-create-room');
    if(btn){ btn.innerHTML='<i class="fas fa-plus"></i> 대화 시작'; btn.onclick=createRoom; }
    window._inviteTargetRoomId=null;
  } catch(e){ toast('초대 중 오류가 발생했습니다.','error'); }
}

/* ── 소통방 나가기 ── */
function confirmLeaveRoom(roomId) {
  const room=State.chatRooms.find(r=>r.id===roomId); if(!room) return;
  const label=document.getElementById('leave-room-name-label');
  if(label) label.textContent=`'${room.name}' 소통방을 나가시겠습니까?`;
  const btn=document.getElementById('btn-confirm-leave-room');
  if(btn) { btn.onclick=()=>leaveRoom(roomId); }
  openModal('modal-leave-room');
}

async function leaveRoom(roomId) {
  const room=State.chatRooms.find(r=>r.id===roomId); if(!room) return;
  const leftMembers=[...new Set([...(room.left_members||[]),State.owner.id])];
  try{
    const updated=await api.put('chat_rooms',roomId,{...room,left_members:leftMembers});
    Object.assign(room,updated);
    // 나가기 시스템 메시지
    const sysMsg={id:genId(),room_id:roomId,sender_id:'system',content:`${State.owner.name||'사용자'}님이 소통방을 나갔습니다.`,msg_type:'text',read_by:[]};
    await api.post('messages',sysMsg); State.messages.push(sysMsg);
    closeModal('modal-leave-room');
    toast(`'${room.name}' 소통방에서 나갔습니다.`,'info');
    // 현재 방이면 채팅 영역 초기화
    if(State.currentRoomId===roomId){
      State.currentRoomId=null;
      document.getElementById('chat-area').style.display='none';
      document.getElementById('messenger-empty').style.display='flex';
    }
    renderMessenger();
  } catch(e){ toast('나가기 중 오류가 발생했습니다.','error'); }
}

/* ============================================================  EMAIL  ============================================================ */
function renderEmail() {
  renderEmailList();
  updateSidebarBadges();
}

function renderEmailList() {
  const folder=State.emailFolder; const search=(document.getElementById('email-search')?.value||'').toLowerCase();
  document.getElementById('email-folder-title').textContent=
    {inbox:'받은 편지함',sent:'보낸 편지함',draft:'임시 보관함',starred:'중요 메일',trash:'휴지통'}[folder]||folder;

  let list=State.emails;
  if(folder==='starred') list=list.filter(e=>e.is_starred);
  else if(folder!=='trash') list=list.filter(e=>e.folder===folder);
  if(search) list=list.filter(e=>e.subject.toLowerCase().includes(search)||(e.body||'').toLowerCase().includes(search));
  list=list.sort((a,b)=>(b.updated_at||0)-(a.updated_at||0));

  const el=document.getElementById('email-list');
  el.innerHTML=list.length?list.map(e=>{
    const from=getMember(e.from_id); const isMe=e.from_id===State.owner.id;
    const to=isMe?(e.to_ids||[]).map(id=>getMember(id)?.name||id).join(', '):null;
    return `<div class="email-item ${!e.is_read&&!isMe?'unread':''} ${e.id===State.currentEmailId?'active':''}" onclick="openEmail('${e.id}')">
      <div class="email-item-header">
        <span class="email-item-from">${isMe?`→ ${to}`:from?.name||'알 수 없음'}</span>
        <span class="email-item-date">${fmt(e.updated_at?new Date(e.updated_at):new Date())}</span>
      </div>
      <div class="email-item-subject">${e.subject}</div>
      <div class="email-item-preview">${(e.body||'').replace(/\n/g,' ').slice(0,60)}...</div>
      <i class="fas fa-star email-star ${e.is_starred?'starred':''}" onclick="toggleStar('${e.id}');event.stopPropagation()"></i>
    </div>`;
  }).join(''):emptyState('envelope-open','메일이 없습니다');
}

async function openEmail(id) {
  State.currentEmailId=id;
  const e=State.emails.find(x=>x.id===id); if(!e) return;
  if(!e.is_read && e.from_id!==State.owner.id){
    e.is_read=true;
    await api.put('emails',e.id,{...e,is_read:true});
    updateSidebarBadges();
  }
  renderEmailList();

  const from=getMember(e.from_id);
  const toNames=(e.to_ids||[]).map(id=>{ const m=getMember(id); return m?m.name:id; }).join(', ');
  const ccNames=(e.cc_ids||[]).map(id=>{ const m=getMember(id); return m?m.name:id; }).join(', ');
  const tags=(e.tags||[]).map(t=>`<span class="tag-chip">${t}</span>`).join('');

  document.getElementById('email-detail-empty').style.display='none';
  const dc=document.getElementById('email-detail-content'); dc.style.display='flex';
  dc.innerHTML=`
    <div class="email-detail-header">
      <div class="email-detail-subject">${e.subject}</div>
      <div class="email-detail-meta">
        <div class="email-detail-from">
          ${avatarEl(from,'avatar-sm')}
          <div class="email-detail-from-info">
            <div class="email-detail-from-name">${from?.name||'알 수 없음'}</div>
            <div class="email-detail-from-email">${from?.email||e.from_id}</div>
          </div>
        </div>
        <div style="font-size:12px;color:var(--text-muted)">수신: ${toNames}${ccNames?` · CC: ${ccNames}`:''}</div>
        <div class="email-detail-actions">
          <button class="btn btn-ghost btn-sm" onclick="replyEmail('${e.id}')"><i class="fas fa-reply"></i> 답장</button>
          <button class="btn btn-ghost btn-sm" onclick="forwardEmail('${e.id}')"><i class="fas fa-share"></i> 전달</button>
          <button class="btn btn-danger btn-sm" onclick="deleteEmail('${e.id}')"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    </div>
    <div class="email-detail-body">${e.body||''}</div>
    ${tags?`<div class="email-detail-tags">${tags}</div>`:''}
    ${_renderEmailAttachments(e)}`;
}

function _renderEmailAttachments(e) {
  let attachArr = [];
  try { attachArr = JSON.parse(e.attachments || '[]'); } catch(ex) {}
  if (!attachArr.length) return '';
  return `<div class="email-attach-list">
    <div class="email-attach-list-title"><i class="fas fa-paperclip"></i> 첨부파일 ${attachArr.length}개</div>
    <div class="email-attach-chips">
      ${attachArr.map(a => {
        const isImg = (a.type||'').startsWith('image/');
        const icon  = isImg ? 'fa-file-image' :
                      (a.type||'').includes('pdf') ? 'fa-file-pdf' :
                      (a.type||'').includes('word')||(a.type||'').includes('document') ? 'fa-file-word' :
                      (a.type||'').includes('sheet')||(a.type||'').includes('excel') ? 'fa-file-excel' :
                      (a.type||'').startsWith('video/') ? 'fa-file-video' : 'fa-file';
        const dlAttr = a.data_url ? `href="${a.data_url}" download="${escHtml(a.name||'file')}"` : 'href="#"';
        const chipThumb = isImg && a.data_url
          ? `<img src="${a.data_url}" class="chip-thumb" alt="${escHtml(a.name||'')}"/>`
          : `<span class="chip-icon"><i class="fas ${icon}"></i></span>`;
        return `<a class="email-attach-chip" ${dlAttr} title="다운로드: ${escHtml(a.name||'')}">
          ${chipThumb}
          <span class="eac-info">
            <span class="eac-name">${escHtml(a.name||'파일')}</span>
            <span class="eac-size">${a.size_str||''}</span>
          </span>
          <i class="fas fa-download eac-dl"></i>
        </a>`;
      }).join('')}
    </div>
  </div>`;
}

function replyEmail(id) {
  const e=State.emails.find(x=>x.id===id); if(!e) return;
  populateComposeModal();
  document.getElementById('email-subject').value=`RE: ${e.subject}`;
  document.getElementById('reply-email-id').value=id;
  const fromSel=document.getElementById('email-to');
  setTimeout(()=>{ const opt=[...fromSel.options].find(o=>o.value===e.from_id); if(opt) opt.selected=true; },100);
  openModal('modal-compose');
}

function forwardEmail(id) {
  const e=State.emails.find(x=>x.id===id); if(!e) return;
  populateComposeModal();
  document.getElementById('email-subject').value=`FW: ${e.subject}`;
  document.getElementById('email-body').value=`\n\n--- 원본 메일 ---\n${e.body||''}`;
  openModal('modal-compose');
}

async function toggleStar(id) {
  const e=State.emails.find(x=>x.id===id); if(!e) return;
  e.is_starred=!e.is_starred;
  await api.put('emails',e.id,{...e});
  renderEmailList(); if(State.currentEmailId===id) openEmail(id);
}

async function deleteEmail(id) {
  if(!confirm('이 메일을 삭제하시겠습니까?')) return;
  const e=State.emails.find(x=>x.id===id); if(!e) return;
  if(e.folder==='trash'){ await api.del('emails',e.id); State.emails=State.emails.filter(x=>x.id!==id); }
  else { e.folder='trash'; await api.put('emails',e.id,{...e,folder:'trash'}); }
  State.currentEmailId=null;
  document.getElementById('email-detail-empty').style.display='flex';
  document.getElementById('email-detail-content').style.display='none';
  toast('메일이 삭제되었습니다.','success'); renderEmailList();
}

function populateComposeModal() {
  const toSel = document.getElementById('email-to');
  const ccSel = document.getElementById('email-cc');
  const opts  = State.members.map(m=>`<option value="${m.id}">${m.name} &lt;${m.email}&gt;</option>`).join('');
  if (toSel) toSel.innerHTML = opts;
  if (ccSel) ccSel.innerHTML = opts;
  // 첨부파일 초기화
  _emailPendingFiles = [];
  const prev = document.getElementById('email-attach-preview');
  if (prev) prev.innerHTML = '';
  // 드롭존 초기화 (모달 열릴 때마다 리셋하여 재등록)
  const zone = document.getElementById('email-attach-zone');
  if (zone) zone._emailDropInited = false;
  setTimeout(initEmailAttachZone, 80);
}

async function sendEmail(isDraft=false) {
  const subject = document.getElementById('email-subject').value.trim();
  const body    = document.getElementById('email-body').value.trim();
  const toSel   = document.getElementById('email-to');
  const toIds   = [...toSel.options].filter(o=>o.selected).map(o=>o.value);
  if (!isDraft && (!subject || !toIds.length)) { toast('수신자와 제목을 입력하세요.','error'); return; }
  const ccSel = document.getElementById('email-cc');
  const ccIds = [...ccSel.options].filter(o=>o.selected).map(o=>o.value);

  // 첨부파일 직렬화 (data_url, name, size, type 저장)
  const attachments = _emailPendingFiles.map(f => ({
    name:     f.file.name,
    size:     f.file.size,
    size_str: fmtSize(f.file.size),
    type:     f.file.type,
    data_url: f.dataUrl,
  }));

  const data = {
    id:         genId(),
    from_id:    State.owner.id,
    to_ids:     toIds,
    cc_ids:     ccIds,
    subject:    subject || '(제목 없음)',
    body,
    is_read:    true,
    is_starred: false,
    folder:     isDraft ? 'draft' : 'sent',
    tags:       document.getElementById('email-tags-input').value.split(',').map(t=>t.trim()).filter(Boolean),
    attachments: JSON.stringify(attachments),
  };

  const btn = document.getElementById('btn-send-email');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 발송 중...'; }

  try {
    const r = await api.post('emails', data);
    State.emails.push(r);
    // 수신자에게 inbox 복사
    if (!isDraft) {
      for (const tid of toIds) {
        const inbox = { ...data, id:genId(), from_id:State.owner.id, folder:'inbox', is_read:false };
        const ri = await api.post('emails', inbox);
        State.emails.push(ri);
      }
    }
    // 첨부파일 초기화
    _emailPendingFiles = [];
    const prev = document.getElementById('email-attach-preview');
    if (prev) prev.innerHTML = '';
    closeModal('modal-compose');
    toast(isDraft ? '임시저장되었습니다.' : `메일이 발송되었습니다! 📨${attachments.length>0?' (첨부 '+attachments.length+'개)':''}`, 'success');
    updateSidebarBadges();
    renderEmailList();
    ['email-subject','email-body','email-tags-input','reply-email-id'].forEach(id=>{
      const el=document.getElementById(id); if(el) el.value='';
    });
  } catch(e) {
    console.error('sendEmail 오류:', e);
    toast('오류가 발생했습니다.','error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> 발송'; }
  }
}

/* ── 이메일 파일 첨부 ── */
async function handleEmailFileSelect(event) {
  const files = Array.from(event.target.files || []);
  for (const file of files) {
    if (file.size > 100*1024*1024) { toast(`⚠️ ${file.name}: 100MB 초과`, 'error'); continue; }
    if (file.size > 2*1024*1024) toast(`⏳ "${file.name}" 압축 중...`, 'info');
    try {
      const dataUrl = await compressFileForUpload(file);
      _emailPendingFiles.push({ file, dataUrl });
      renderEmailAttachPreview();
    } catch(e) {
      toast(`❌ "${file.name}" 읽기 실패`, 'error');
    }
  }
  event.target.value = '';
}

function renderEmailAttachPreview() {
  const box = document.getElementById('email-attach-preview'); if (!box) return;
  if (!_emailPendingFiles.length) { box.innerHTML = ''; return; }
  box.innerHTML = _emailPendingFiles.map((f, i) => {
    const isImg = f.file.type.startsWith('image/');
    const icon  = getFileIcon(f.file.type);
    const thumb = isImg
      ? `<img src="${f.dataUrl}" class="email-attach-thumb-img" alt="${escHtml(f.file.name)}" onclick="openLightbox('${f.dataUrl}')" style="cursor:pointer">`
      : `<span class="email-attach-icon"><i class="fas ${icon}"></i></span>`;
    return `<div class="email-attach-item">
      ${thumb}
      <div class="email-attach-info">
        <span class="email-attach-name" title="${escHtml(f.file.name)}">${escHtml(f.file.name)}</span>
        <span class="email-attach-size">${fmtSize(f.file.size)}</span>
      </div>
      <button class="email-attach-del" onclick="removeEmailAttach(${i})" title="제거"><i class="fas fa-times"></i></button>
    </div>`;
  }).join('');
}

function removeEmailAttach(idx) {
  _emailPendingFiles.splice(idx, 1);
  renderEmailAttachPreview();
}

function initEmailAttachZone() {
  const zone = document.getElementById('email-attach-zone');
  if (!zone || zone._emailDropInited) return;
  zone._emailDropInited = true;
  zone.addEventListener('click', () => document.getElementById('email-file-input')?.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('drag-over');
    handleEmailFileSelect({ target: { files: e.dataTransfer.files } });
  });
}

/* ============================================================  MEMBER EDIT  ============================================================ */
function openMemberEdit(id) {
  const m = getMember(id); if(!m) return;
  document.getElementById('edit-member-id').value      = id;
  document.getElementById('edit-member-name').value    = m.name;
  document.getElementById('edit-member-email').value   = m.email;
  document.getElementById('edit-member-role').value    = m.role;
  document.getElementById('edit-member-dept').value    = m.department||'';
  document.getElementById('edit-member-status').value  = m.status||'offline';
  document.getElementById('edit-member-color').value   = m.avatar_color||'#1B3A6B';
  document.getElementById('edit-member-current-name').textContent = m.name;
  document.getElementById('edit-member-current-role').textContent = `${ROLE_LABEL[m.role]||m.role} · ${m.department||'부서 없음'}`;
  const av = document.getElementById('edit-member-avatar');
  if(av){ av.textContent=m.name.charAt(0); av.style.background=m.avatar_color||'#1B3A6B'; }
  renderEditMemberColorRow(m.avatar_color||'#1B3A6B');
  openModal('modal-member-edit');
}

function renderEditMemberColorRow(selected) {
  const row = document.getElementById('edit-member-color-row'); if(!row) return;
  row.innerHTML = AVATAR_COLORS.map(c=>`
    <div class="avatar-color-swatch ${c===selected?'selected':''}" style="background:${c}"
         onclick="selectEditMemberColor('${c}')"></div>`).join('');
}

function selectEditMemberColor(c) {
  document.getElementById('edit-member-color').value = c;
  const av = document.getElementById('edit-member-avatar');
  if(av) av.style.background = c;
  renderEditMemberColorRow(c);
}

async function saveMemberEdit() {
  const id   = document.getElementById('edit-member-id').value;
  const name = document.getElementById('edit-member-name').value.trim();
  if(!name){ toast('이름을 입력하세요.','error'); return; }
  const m = getMember(id); if(!m) return;
  const btn = document.getElementById('btn-save-member-edit');
  btn.disabled=true; btn.textContent='저장 중...';
  const updated = {
    ...m,
    name,
    email:        document.getElementById('edit-member-email').value.trim(),
    role:         document.getElementById('edit-member-role').value,
    department:   document.getElementById('edit-member-dept').value.trim(),
    status:       document.getElementById('edit-member-status').value,
    avatar_color: document.getElementById('edit-member-color').value,
  };
  try {
    const r = await api.put('members', m.id, updated);
    const idx = State.members.findIndex(x=>x.id===id);
    if(idx!==-1) State.members[idx] = r;
    closeModal('modal-member-edit');
    toast(`${name}님 정보가 수정되었습니다.`, 'success');
    renderMembers();
  } catch(e){ toast('저장 중 오류가 발생했습니다.','error'); }
  finally { btn.disabled=false; btn.textContent='저장'; }
}

/* ============================================================  ADMIN PAGES  ============================================================ */
function renderAdminPage(level) {
  const gridId = `admin${level}-grid`;
  const grid = document.getElementById(gridId); if(!grid) return;

  if(level===1) {
    // 관리자1: 전체 권한 카드
    const cards = [
      { icon:'fa-users-cog', color:'#1B3A6B', title:'팀원 권한 관리', desc:'팀원 등록·수정·탈퇴·복직 및 역할을 설정합니다.', perm:'full', action:`showPage('members')` },
      { icon:'fa-user-lock', color:'#805ad5', title:'직원 비밀번호 관리', desc:'직원 개인 로그인 비밀번호를 확인하고 변경합니다. 탈퇴 처리도 가능합니다.', perm:'full', action:`openMemberPwListModal()` },
      { icon:'fa-key', color:'#2A5298', title:'관리자 비밀번호 변경', desc:'관리자1/2 로그인 비밀번호를 변경합니다.', perm:'full', action:`openModal('modal-admin-settings')` },
      { icon:'fa-sitemap', color:'#27AE60', title:'부서 관리', desc:'부서 생성·수정·삭제 및 직원 배치를 관리합니다.', perm:'full', action:`showPage('departments')` },
      { icon:'fa-chart-bar', color:'#E67E22', title:'전체 통계', desc:'프로젝트·작업·팀원 전체 현황 통계를 확인합니다.', perm:'full', action:`showPage('dashboard')` },
      { icon:'fa-project-diagram', color:'#8E44AD', title:'프로젝트 전체 관리', desc:'모든 프로젝트의 생성·수정·삭제 권한을 갖습니다.', perm:'full', action:`showPage('projects')` },
      { icon:'fa-envelope-open-text', color:'#E74C3C', title:'전체 메일 관리', desc:'조직 내 이메일 전체를 관리하고 발송합니다.', perm:'full', action:`showPage('email')` },
      { icon:'fa-shield-alt', color:'#1ABC9C', title:'관리자2 권한 설정', desc:'관리자2가 접근 가능한 메뉴와 기능을 제한합니다.', perm:'full', action:'openAdmin2Settings()' },
      { icon:'fa-database', color:'#F39C12', title:'데이터 백업·복원', desc:'전체 데이터 내보내기 및 가져오기를 수행합니다.', perm:'full', action:'exportData()' },
      { icon:'fa-umbrella-beach', color:'#27AE60', title:'연차관리 비밀번호 변경', desc:'연차관리 시스템 전용 접근 비밀번호를 변경합니다.', perm:'full', action:'openLeavePwModal()' },
    ];
    grid.innerHTML = cards.map(c=>`
      <div class="admin-card" onclick="${c.action}">
        <div class="admin-card-icon" style="background:${c.color}22"><i class="fas ${c.icon}" style="color:${c.color};font-size:22px"></i></div>
        <div class="admin-card-title">${c.title}</div>
        <div class="admin-card-desc">${c.desc}</div>
        <div class="admin-card-footer">
          <span class="admin-perm-tag perm-${c.perm}">${c.perm==='full'?'전체 권한':c.perm==='view'?'조회만':'접근 불가'}</span>
          <button class="btn btn-ghost btn-sm"><i class="fas fa-arrow-right"></i></button>
        </div>
      </div>`).join('');
  } else {
    // 관리자2: 운영 권한 카드
    const cards = [
      { icon:'fa-folder-open', color:'#2A5298', title:'프로젝트 관리', desc:'진행 중인 프로젝트를 모니터링하고 작업을 배정합니다.', perm:'full', action:`showPage('projects')` },
      { icon:'fa-tasks', color:'#27AE60', title:'작업 보드', desc:'칸반 보드에서 작업 현황을 관리합니다.', perm:'full', action:`showPage('tasks')` },
      { icon:'fa-users', color:'#E67E22', title:'팀원 조회', desc:'팀원 목록 및 현황을 조회합니다. (수정 불가)', perm:'view', action:`showPage('members')` },
      { icon:'fa-calendar-alt', color:'#8E44AD', title:'일정 관리', desc:'캘린더에서 마감일 및 일정을 확인합니다.', perm:'full', action:`showPage('calendar')` },
      { icon:'fa-comment-dots', color:'#1ABC9C', title:'메신저', desc:'팀원과 실시간으로 메시지를 주고받습니다.', perm:'full', action:`showPage('messenger')` },
      { icon:'fa-envelope', color:'#E74C3C', title:'이메일', desc:'이메일을 작성·발송·관리합니다.', perm:'full', action:`showPage('email')` },
      { icon:'fa-sitemap', color:'#F39C12', title:'부서 조회', desc:'부서 구조 및 소속 직원을 조회합니다.', perm:'view', action:`showPage('departments')` },
      { icon:'fa-ban', color:'#95A5A6', title:'관리자1 전용', desc:'비밀번호 변경, 권한 관리 등은 관리자1만 접근 가능합니다.', perm:'none', action:'toast("관리자1 전용 기능입니다.","error")' },
    ];
    grid.innerHTML = cards.map(c=>`
      <div class="admin-card" onclick="${c.action}">
        <div class="admin-card-icon" style="background:${c.color}22"><i class="fas ${c.icon}" style="color:${c.color};font-size:22px"></i></div>
        <div class="admin-card-title">${c.title}</div>
        <div class="admin-card-desc">${c.desc}</div>
        <div class="admin-card-footer">
          <span class="admin-perm-tag perm-${c.perm}">${c.perm==='full'?'사용 가능':c.perm==='view'?'조회만':'접근 불가'}</span>
          <button class="btn btn-ghost btn-sm"><i class="fas fa-arrow-right"></i></button>
        </div>
      </div>`).join('');
  }
}

/* ── 직원 비밀번호 목록 모달 (관리자 전용) ── */
function openMemberPwListModal() {
  // 기존 모달 재활용
  const body = document.getElementById('member-pw-admin-body');
  if(!body) return;

  const members = State.members.filter(m => m.is_active !== false);
  const inactive = State.members.filter(m => m.is_active === false);

  body.innerHTML = `
    <h3 style="font-size:13px;font-weight:700;margin-bottom:12px;color:var(--text-secondary)">
      <i class="fas fa-users"></i> 재직 직원 (${members.length}명)
    </h3>
    <div class="mpw-list">
      ${members.length ? members.map(m=>`
        <div class="mpw-list-row">
          <span class="avatar avatar-sm" style="background:${m.avatar_color||'#1B3A6B'}">${m.name.charAt(0)}</span>
          <div class="mpw-list-info">
            <div class="mpw-list-name">${escHtml(m.name)}</div>
            <div class="mpw-list-email">${escHtml(m.email)}</div>
          </div>
          <div class="mpw-list-pw ${m.login_pw?'has-pw':'no-pw'}">
            ${m.login_pw ? `<span class="mpw-dots">••••••</span>` : '<span style="color:#e53e3e;font-size:11px">미설정</span>'}
          </div>
          <button class="btn btn-sm btn-primary" onclick="openMemberPwAdmin('${m.id}')">
            <i class="fas fa-key"></i>
          </button>
          <button class="btn btn-sm btn-danger" onclick="closeModal('modal-member-pw-admin');deactivateMember('${m.id}')">
            <i class="fas fa-user-slash"></i>
          </button>
        </div>`).join('') : '<p style="color:var(--text-muted);font-size:13px">등록된 직원이 없습니다.</p>'}
    </div>
    ${inactive.length ? `
    <h3 style="font-size:13px;font-weight:700;margin:18px 0 10px;color:#e53e3e">
      <i class="fas fa-user-slash"></i> 탈퇴 직원 (${inactive.length}명)
    </h3>
    <div class="mpw-list">
      ${inactive.map(m=>`
        <div class="mpw-list-row" style="opacity:.6">
          <span class="avatar avatar-sm" style="background:#aaa;filter:grayscale(1)">${m.name.charAt(0)}</span>
          <div class="mpw-list-info">
            <div class="mpw-list-name">${escHtml(m.name)} <span class="badge-deactivated">탈퇴</span></div>
            <div class="mpw-list-email">${escHtml(m.email)}</div>
          </div>
          <div></div>
          <button class="btn btn-sm" style="background:#38a169;color:#fff" onclick="closeModal('modal-member-pw-admin');reactivateMember('${m.id}')">
            <i class="fas fa-user-check"></i> 복직
          </button>
        </div>`).join('')}
    </div>` : ''}
  `;
  document.getElementById('btn-save-member-pw').style.display = 'none';
  // 모달 타이틀 변경
  const modalTitle = document.querySelector('#modal-member-pw-admin .modal-header h2');
  if(modalTitle) modalTitle.innerHTML = '<i class="fas fa-users-cog" style="color:var(--primary);margin-right:8px"></i>직원 비밀번호 전체 관리';
  openModal('modal-member-pw-admin');
}

function openAdmin2Settings() {
  toast('관리자2 권한 설정은 현재 버전에서 준비 중입니다.', 'warning');
}

/* ============================================================
   데이터 내보내기 (Export)
   ============================================================ */

// 내보내기 가능한 항목과 State 매핑
const EXPORT_SOURCES = {
  projects:        () => State.projects        || [],
  tasks:           () => State.tasks           || [],
  members:         () => State.members         || [],
  departments:     () => State.departments     || [],
  calendar_events: () => State.calendarEvents  || [],
  messages:        () => State.messages        || [],
  emails:          () => State.emails          || [],
  comments:        () => State.comments        || [],
};

// 관리자 카드에서 호출되는 진입점
function exportData() {
  openExportModal();
}

function openExportModal() {
  // 건수 업데이트
  Object.keys(EXPORT_SOURCES).forEach(key => {
    const el = document.getElementById(`exp-count-${key}`);
    if(el) el.textContent = (EXPORT_SOURCES[key]().length) + '건';
  });
  // 진행바 초기화
  const pw = document.getElementById('export-progress-wrap');
  if(pw) pw.style.display = 'none';
  const btn = document.getElementById('btn-do-export');
  if(btn){ btn.disabled = false; btn.innerHTML = '<i class="fas fa-download"></i> 내보내기'; }
  openModal('modal-export');
}

function onExportFmtChange() {
  const fmt  = document.querySelector('input[name="export-fmt"]:checked')?.value || 'json';
  const hint = document.getElementById('export-fmt-hint');
  if(!hint) return;
  hint.textContent = fmt === 'json'
    ? 'JSON: 모든 필드·관계 보존, 재가져오기 가능'
    : 'CSV: 엑셀/스프레드시트 호환, 항목별 파일 생성';
}

function exportSelectAll(checked) {
  document.querySelectorAll('#export-items-grid input[type=checkbox]')
    .forEach(cb => cb.checked = checked);
}

async function doExport() {
  const fmt = document.querySelector('input[name="export-fmt"]:checked')?.value || 'json';
  const selected = [...document.querySelectorAll('#export-items-grid input[type=checkbox]:checked')]
    .map(cb => cb.value);

  if(!selected.length){ toast('내보낼 항목을 하나 이상 선택하세요.', 'error'); return; }

  const btn = document.getElementById('btn-do-export');
  const pw  = document.getElementById('export-progress-wrap');
  const pbl = document.getElementById('export-progress-label');
  const pbr = document.getElementById('export-progress-bar');

  if(btn){ btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 내보내는 중...'; }
  if(pw)  pw.style.display = 'block';

  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;

  try {
    if(fmt === 'json') {
      // ── JSON 단일 파일 ──
      const exportObj = { exported_at: now.toISOString(), version: '1.0', data: {} };
      for(let i=0; i<selected.length; i++){
        const key = selected[i];
        if(pbl) pbl.textContent = `수집 중: ${key} (${i+1}/${selected.length})`;
        if(pbr) pbr.style.width = `${Math.round((i+1)/selected.length*80)}%`;
        // API에서 최신 데이터 가져오기 (최대 1000건)
        try {
          const res = await fetch(`tables/${key}?limit=1000`);
          const json = await res.json();
          exportObj.data[key] = json.data || EXPORT_SOURCES[key]();
        } catch(e) {
          exportObj.data[key] = EXPORT_SOURCES[key]();
        }
        await new Promise(r=>setTimeout(r,80));
      }
      if(pbl) pbl.textContent = '파일 생성 중...';
      if(pbr) pbr.style.width = '95%';
      const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type:'application/json' });
      _downloadBlob(blob, `eclado_backup_${dateStr}.json`);
      if(pbr) pbr.style.width = '100%';
      if(pbl) pbl.textContent = '✅ 완료!';

    } else {
      // ── CSV 항목별 파일 묶음 (zip 없이 순차 다운로드) ──
      for(let i=0; i<selected.length; i++){
        const key = selected[i];
        if(pbl) pbl.textContent = `CSV 생성 중: ${key} (${i+1}/${selected.length})`;
        if(pbr) pbr.style.width = `${Math.round((i+1)/selected.length*90)}%`;

        let rows = [];
        try {
          const res = await fetch(`tables/${key}?limit=1000`);
          const json = await res.json();
          rows = json.data || EXPORT_SOURCES[key]();
        } catch(e) {
          rows = EXPORT_SOURCES[key]();
        }

        const csv  = _arrayToCsv(rows);
        const blob = new Blob(['\uFEFF'+csv], { type:'text/csv;charset=utf-8;' }); // BOM for Excel
        _downloadBlob(blob, `eclado_${key}_${dateStr}.csv`);
        await new Promise(r=>setTimeout(r,300)); // 브라우저 다운로드 간격
      }
      if(pbr) pbr.style.width = '100%';
      if(pbl) pbl.textContent = `✅ 완료! (${selected.length}개 파일)`;
    }

    toast(`${selected.length}개 항목이 ${fmt.toUpperCase()}로 내보내기 되었습니다! 📦`, 'success');
  } catch(err) {
    toast('내보내기 중 오류가 발생했습니다.', 'error');
    console.error(err);
  } finally {
    if(btn){ btn.disabled = false; btn.innerHTML = '<i class="fas fa-download"></i> 내보내기'; }
  }
}

/* 배열 → CSV 문자열 변환 */
function _arrayToCsv(rows) {
  if(!rows || !rows.length) return '';
  // 시스템 필드 제외 컬럼 순서 정리
  const skipKeys = ['gs_project_id','gs_table_name'];
  const allKeys  = [...new Set(rows.flatMap(r=>Object.keys(r)))].filter(k=>!skipKeys.includes(k));

  const escape = v => {
    if(v === null || v === undefined) return '';
    const s = String(v);
    if(s.includes(',') || s.includes('"') || s.includes('\n'))
      return '"' + s.replace(/"/g,'""') + '"';
    return s;
  };

  const header = allKeys.map(escape).join(',');
  const body   = rows.map(row =>
    allKeys.map(k => escape(Array.isArray(row[k]) ? row[k].join('|') : row[k])).join(',')
  ).join('\n');

  return header + '\n' + body;
}

/* Blob 다운로드 헬퍼 */
function _downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
}

/* 관리자 비밀번호 변경 — 서버 DB 저장 (모든 기기 동기화) */
async function saveAdminPassword() {
  const target  = document.getElementById('admin-pw-target').value;
  const newPw   = document.getElementById('new-admin-pw').value;
  const conf    = document.getElementById('confirm-admin-pw').value;
  if(!newPw || newPw.length < 4){ toast('비밀번호는 4자 이상이어야 합니다.','error'); return; }
  if(newPw !== conf){ toast('비밀번호가 일치하지 않습니다.','error'); return; }
  const btn = document.getElementById('btn-save-admin-pw');
  if(btn){ btn.disabled = true; btn.textContent = '저장 중...'; }
  try {
    const patch = {};
    patch[target] = newPw;
    await saveCredentials(patch);
    closeModal('modal-admin-settings');
    toast(`${ROLE_LOGIN_LABEL[target]} 비밀번호가 변경되었습니다. (모든 기기 적용)`, 'success');
    ['new-admin-pw','confirm-admin-pw'].forEach(id=>{ document.getElementById(id).value=''; });
  } catch(e) {
    toast('서버 오류로 비밀번호 변경에 실패했습니다.', 'error');
  } finally {
    if(btn){ btn.disabled = false; btn.textContent = '변경 저장'; }
  }
}

/* ============================================================
   LEAVE MANAGEMENT — 엑셀 스타일 연차관리
   ============================================================ */

/* ── 연차관리 상태 ── */
const LeaveState = {
  records:     [],   // leave_records
  usages:      [],   // leave_usages
  unlocked:    false,
  currentYear: new Date().getFullYear(),
  currentRecordId: null,
};

/* ── 비밀번호 유틸 ── */
function getLeavePassword() {
  try { const s = localStorage.getItem('eclado_leave_pw'); if (s) return s; } catch(e) {}
  return 'leave1234';
}
function saveLeavePassword(pw) { localStorage.setItem('eclado_leave_pw', pw); }

/* ── 근속 연수 계산 ── */
function calcYearsOfService(joinDateStr) {
  if (!joinDateStr) return 0;
  const join = new Date(joinDateStr);
  const today = new Date();
  let y = today.getFullYear() - join.getFullYear();
  const m = today.getMonth() - join.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < join.getDate())) y--;
  return Math.max(y, 0);
}

/* ── 법정 연차 자동 계산 (근로기준법 제60조) ──
 *
 * [규칙 정리]
 *  ① 입사 후 1개월 개근 시 1일 발생, 최대 11개월 → 최대 11일
 *     (= 1년 미만 구간에서 월 1일씩 최대 11일까지)
 *  ② 입사 1년 만근 시 → 15일 발생  ← 핵심: 1년 차 부여
 *  ③ 3년 이상: 첫 3년 이후 2년마다 1일 추가, 최대 25일
 *     예) 3년: 16일  5년: 17일  ... 21년 이상: 25일
 *
 * [targetYear 기준 계산]
 *  - targetYear 연도 1월 1일 시점에서의 근속 상태를 기준으로 계산
 *  - 입사일이 targetYear 이후면 해당 연도 내 근속 개월 수로 계산
 */
function calcLegalLeave(joinDateStr, targetYear) {
  if (!joinDateStr) return { granted: 15, total: 15, info: '입사일 없음 → 기본 15일' };

  const join = new Date(joinDateStr);
  if (isNaN(join)) return { granted: 15, total: 15, info: '입사일 오류 → 기본 15일' };

  // targetYear 의 연차 기준일: 입사일 기준 해당 연도 구간의 시작일
  const seg = calcBaseDateForYear(joinDateStr, targetYear);

  // 기준 시점: 해당 연도 구간 시작일 (없으면 targetYear 1월 1일)
  const refDate = seg.base ? new Date(seg.base) : new Date(targetYear, 0, 1);

  // 기준 시점에서 경과한 정확한 개월 수 계산
  const refYear  = refDate.getFullYear();
  const refMonth = refDate.getMonth();      // 0-indexed
  const refDay   = refDate.getDate();

  const joinYear  = join.getFullYear();
  const joinMonth = join.getMonth();        // 0-indexed
  const joinDay   = join.getDate();

  // 전체 경과 개월 (정수)
  let totalMonths = (refYear - joinYear) * 12 + (refMonth - joinMonth);
  // 일(day) 기준 보정: 기준일의 일자가 입사일의 일자보다 작으면 1개월 미만
  if (refDay < joinDay) totalMonths -= 1;
  if (totalMonths < 0) totalMonths = 0;

  // ── ① 1년 미만 (12개월 미만): 월 1일, 최대 11일 ──
  if (totalMonths < 12) {
    const days = Math.min(totalMonths, 11); // 0~11개월 → 0~11일
    const info = totalMonths === 0
      ? '입사 1개월 미만 → 연차 0일 (첫 1개월 개근 후 1일 발생)'
      : `입사 ${totalMonths}개월 → 월 1일 × ${totalMonths}개월 = ${days}일 (근로기준법 제60조 제2항)`;
    return { granted: days, total: days, info };
  }

  // ── ② 1년 만근(12개월) ~ 2년 미만 → 15일 ──
  // ── ③ 2년 이상: 근속 연수 기준 추가 발생 ──
  // 근속 연수 = totalMonths / 12 (소수점 버림)
  const yearsWorked = Math.floor(totalMonths / 12);

  let base = 15; // 1년 만근 기본
  if (yearsWorked >= 3) {
    // 3년 이후 2년마다 1일 추가
    // 3년: +1 → 16일, 5년: +2 → 17일, 7년: +3 → 18일 ... 21년+: +10 → 25일
    const extra = Math.floor((yearsWorked - 1) / 2);
    base = Math.min(15 + extra, 25);
  }

  const info = yearsWorked < 3
    ? `근속 ${yearsWorked}년 → 기본 ${base}일 (근로기준법 제60조 제1항)`
    : `근속 ${yearsWorked}년 → ${base}일 (2년마다 1일 추가, 최대 25일)`;

  return { granted: base, total: base, info };
}

/* ── 특정 레코드 사용일수 ── */
function calcUsedDays(recordId) {
  return LeaveState.usages
    .filter(u => u.leave_record_id === recordId)
    .reduce((s, u) => s + (u.days || 0), 0);
}

/* ── 월별 사용일수 ── */
function calcUsedDaysByMonth(recordId, month) {
  return LeaveState.usages
    .filter(u => u.leave_record_id === recordId && u.month === month)
    .reduce((s, u) => s + (u.days || 0), 0);
}

/* ── 렌더링 진입점 ── */
async function renderLeave() {
  const lockLayer = document.getElementById('leave-lock-layer');
  const content   = document.getElementById('leave-content');
  if (!LeaveState.unlocked) {
    if (lockLayer) lockLayer.style.display = 'flex';
    if (content)   content.style.display   = 'none';
    return;
  }
  if (lockLayer) lockLayer.style.display = 'none';
  if (content)   content.style.display   = 'block';

  // 연도 셀렉트
  const yrSel = document.getElementById('leave-year-select');
  if (yrSel && yrSel.options.length === 0) {
    for (let y = 2040; y >= 2000; y--) {
      const o = document.createElement('option');
      o.value = y; o.textContent = `${y}년`;
      if (y === LeaveState.currentYear) o.selected = true;
      yrSel.appendChild(o);
    }
  }

  // 부서 필터
  const deptFilter = document.getElementById('leave-dept-filter');
  if (deptFilter) {
    const saved = deptFilter.value;
    deptFilter.innerHTML = '<option value="all">전체 부서</option>' +
      State.departments.map(d => `<option value="${d.name}">${d.name}</option>`).join('');
    deptFilter.value = saved || 'all';
  }

  await loadLeaveData();
  renderLeaveStats();
  renderLeaveExcelTable();
}

async function loadLeaveData() {
  try {
    const [recs, usg] = await Promise.all([
      api.get('leave_records', 'sort=name'),
      api.get('leave_usages'),
    ]);
    LeaveState.records = recs.data || [];
    LeaveState.usages  = usg.data  || [];
  } catch(e) { toast('연차 데이터 로드 오류', 'error'); }
}

/* ── 통계 렌더링 ── */
function renderLeaveStats() {
  const year = LeaveState.currentYear;
  const recs = LeaveState.records.filter(r => r.year === year && !r.resigned);
  const total = recs.length;

  // 등록 직원 수
  document.getElementById('lstat-total').textContent = `${total}명`;

  // ── 기준일 기간 내 미소진자 계산 ──
  // 오늘 날짜 기준: 기준일 기간이 이미 종료된 직원 중 연차를 1일도 안 쓴 사람
  const today = new Date();
  today.setHours(0,0,0,0);
  let unusedList = [];

  recs.forEach(r => {
    const granted = r.granted_days || 0;
    if (granted === 0) return; // 부여일 0이면 제외

    // 기준일 기간 계산
    let segEnd = null;
    if (r.join_date) {
      const seg = calcBaseDateForYear(r.join_date, year);
      if (seg.end) segEnd = new Date(seg.end);
    }
    if (r.base_date) {
      // base_date가 수동 지정된 경우 — base_date로부터 1년 후 -1일
      const bd = new Date(r.base_date);
      const end = new Date(bd);
      end.setFullYear(bd.getFullYear() + 1);
      end.setDate(end.getDate() - 1);
      segEnd = end;
    }

    // 기준일 종료일이 오늘 이전인 경우만 체크 (기간이 지난 직원)
    // 기준일이 없거나 아직 진행 중이면 포함 안 함
    // → 미소진자 정의: 기준일 종료 여부와 무관하게 "사용일 = 0"인 직원
    const used = calcUsedDays(r.id);
    if (used === 0) {
      unusedList.push({ rec: r, granted, used, segEnd });
    }
  });

  const unusedCount = unusedList.length;
  document.getElementById('lstat-unused').textContent = `${unusedCount}명`;

  // 서브 텍스트
  const sub2 = document.getElementById('lstat-unused-sub');
  if (sub2) {
    sub2.textContent = unusedCount > 0
      ? `${year}년 연차 미사용 직원`
      : `${year}년 전원 연차 사용 완료`;
    sub2.style.color = unusedCount > 0 ? '#E74C3C' : '#27AE60';
  }

  // 카드 강조 색상
  const card = document.getElementById('lstat-card-unused');
  if (card) {
    card.classList.toggle('lstat-card-unused-alert', unusedCount > 0);
  }

  const sub = document.getElementById('leave-year-subtitle');
  if (sub) sub.textContent = `${year}년 연차 현황`;
}

/* ── 미소진자 상세 모달 열기 ── */
function openUnusedLeaveModal() {
  const year = LeaveState.currentYear;
  const recs = LeaveState.records.filter(r => r.year === year && !r.resigned);

  // 미소진자 목록 계산 (사용일 = 0인 직원)
  const unusedList = [];
  recs.forEach(r => {
    const granted = r.granted_days || 0;
    if (granted === 0) return;
    const used = calcUsedDays(r.id);
    if (used === 0) {
      // 기준일 기간 계산
      let periodStr = '—';
      if (r.base_date) {
        const bd = new Date(r.base_date);
        const end = new Date(bd);
        end.setFullYear(bd.getFullYear() + 1);
        end.setDate(end.getDate() - 1);
        const fmt = d => d.toISOString().slice(0,10).replace(/-/g,'.');
        periodStr = `${fmt(bd)} ~ ${fmt(end)}`;
      } else if (r.join_date) {
        const seg = calcBaseDateForYear(r.join_date, year);
        periodStr = seg.period || '—';
      }
      unusedList.push({ rec: r, granted, used, period: periodStr });
    }
  });

  // 모달 헤더 텍스트
  const titleEl = document.getElementById('unused-modal-title');
  const subEl   = document.getElementById('unused-modal-sub');
  if (titleEl) titleEl.textContent = `${year}년 기준일 내 미소진자`;
  if (subEl)   subEl.textContent   = `연차를 한 번도 사용하지 않은 직원 ${unusedList.length}명`;

  // 요약 바
  const summaryBar = document.getElementById('unused-summary-bar');
  if (summaryBar) {
    const totalRecs = recs.filter(r => (r.granted_days||0) > 0).length;
    const usedRecs  = totalRecs - unusedList.length;
    const unusedGrantedTotal = unusedList.reduce((s,x) => s + x.granted, 0);
    summaryBar.innerHTML = `
      <div class="unused-sum-item">
        <span class="unused-sum-val" style="color:var(--primary)">${totalRecs}명</span>
        <span class="unused-sum-lbl">연차 부여 직원</span>
      </div>
      <div class="unused-sum-divider"></div>
      <div class="unused-sum-item">
        <span class="unused-sum-val" style="color:#27AE60">${usedRecs}명</span>
        <span class="unused-sum-lbl">연차 사용자</span>
      </div>
      <div class="unused-sum-item">
        <span class="unused-sum-val" style="color:#E74C3C">${unusedList.length}명</span>
        <span class="unused-sum-lbl">미소진자</span>
      </div>
      <div class="unused-sum-divider"></div>
      <div class="unused-sum-item">
        <span class="unused-sum-val" style="color:#E67E22">${unusedGrantedTotal}일</span>
        <span class="unused-sum-lbl">미소진자 부여일 합계</span>
      </div>
      <div class="unused-sum-item">
        <span class="unused-sum-val" style="color:var(--text-muted)">${totalRecs>0?Math.round(unusedList.length/totalRecs*100):0}%</span>
        <span class="unused-sum-lbl">미소진 비율</span>
      </div>`;
  }

  // 테이블 렌더
  const tbody = document.getElementById('unused-table-body');
  const empty = document.getElementById('unused-empty');
  const table = document.getElementById('unused-table');
  if (!tbody) { openModal('modal-unused-leave'); return; }

  if (!unusedList.length) {
    tbody.innerHTML = '';
    if (table) table.style.display = 'none';
    if (empty) empty.style.display = 'block';
  } else {
    if (table) table.style.display = '';
    if (empty) empty.style.display = 'none';

    tbody.innerHTML = unusedList.map((item, idx) => {
      const r = item.rec;
      const rateClass = 'rate-exhaust'; // 0% 사용 = 위험
      return `<tr>
        <td class="unused-td-no">${idx + 1}</td>
        <td class="unused-td-dept">${escHtml(r.department || '—')}</td>
        <td class="unused-td-name">
          <button class="lm-name-btn" onclick="openLeaveMemberFullView('${r.id}');closeModal('modal-unused-leave')" title="전체 연차 이력 보기">
            ${escHtml(r.name || '—')}
          </button>
        </td>
        <td class="unused-td-role">${ROLE_LABEL[r.role] || r.role || '—'}</td>
        <td class="unused-td-period">${item.period}</td>
        <td class="unused-td-num unused-td-grant">${item.granted}일</td>
        <td class="unused-td-num" style="color:var(--text-muted)">0일</td>
        <td class="unused-td-num unused-td-miss">${item.granted}일</td>
        <td class="unused-td-rate">
          <div class="lx-rate-bar-wrap">
            <div class="lx-rate-bar"><div class="lx-rate-fill rate-exhaust" style="width:0%"></div></div>
            <span class="lx-rate-text rate-exhaust">0%</span>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  openModal('modal-unused-leave');
}

/**
 * "등록 직원" 카드 클릭 →
 * 1) 검색어·부서·상태 필터 초기화
 * 2) 퇴사자 숨김 해제 (모든 직원 표시)
 * 3) 테이블 리렌더
 * 4) 카드 active 표시 + 안내 토스트
 */
function showAllLeaveMembers() {
  // 필터 초기화
  const search   = document.getElementById('leave-search');
  const deptF    = document.getElementById('leave-dept-filter');
  const statusF  = document.getElementById('leave-status-filter');
  const hideResigned = document.getElementById('leave-hide-resigned');

  if (search)  search.value  = '';
  if (deptF)   deptF.value   = 'all';
  if (statusF) statusF.value = 'all';

  // 퇴사자 숨김 해제 → 전체 직원 표시
  if (hideResigned) hideResigned.checked = false;

  // 테이블 리렌더
  renderLeaveExcelTable();

  // 카드 active 스타일 (2초 후 해제)
  const card = document.getElementById('lstat-card-total');
  if (card) {
    card.classList.add('active-filter');
    setTimeout(() => card.classList.remove('active-filter'), 2000);
  }

  // 현재 연도 전체 인원 수 계산 (퇴사자 포함)
  const year = LeaveState.currentYear;
  const total = LeaveState.records.filter(r => r.year === year).length;
  const resigned = LeaveState.records.filter(r => r.year === year && r.resigned).length;

  if (resigned > 0) {
    toast(`전체 ${total}명 표시 중 (재직 ${total - resigned}명 + 퇴사 ${resigned}명)`, 'info');
  } else {
    toast(`전체 ${total}명을 표시합니다.`, 'info');
  }

  // 테이블 맨 위로 스크롤
  const tableWrap = document.querySelector('.lx-table-scroll-wrap');
  if (tableWrap) tableWrap.scrollTop = 0;
}

/* ── 유형 → 칩 색상 ── */
function _leaveTypeChipClass(type) {
  if (!type) return 'chip-other';
  if (type === '연차') return 'chip-annual';
  if (type.startsWith('반차')) return 'chip-half';
  if (type === '병가' || type === '건강검진') return 'chip-sick';
  return 'chip-other';
}

/* ── 엑셀 스타일 테이블 렌더링 ── */
function renderLeaveExcelTable() {
  const year    = LeaveState.currentYear;
  const search  = (document.getElementById('leave-search')?.value || '').toLowerCase();
  const deptF   = document.getElementById('leave-dept-filter')?.value || 'all';
  const statusF = document.getElementById('leave-status-filter')?.value || 'all';

  // 퇴사자 숨김 체크
  const hideResigned = document.getElementById('leave-hide-resigned')?.checked !== false;

  let recs = LeaveState.records.filter(r => r.year === year);
  if (hideResigned) recs = recs.filter(r => !r.resigned);
  if (search) recs = recs.filter(r =>
    (r.name || '').toLowerCase().includes(search) ||
    (r.department || '').toLowerCase().includes(search));
  if (deptF !== 'all') recs = recs.filter(r => r.department === deptF);
  if (statusF !== 'all') {
    recs = recs.filter(r => {
      const u = calcUsedDays(r.id), g = r.granted_days || 0;
      const rate = g > 0 ? u / g : 0;
      if (statusF === 'normal')  return rate < 0.5;
      if (statusF === 'warning') return rate >= 0.5 && rate < 0.8;
      if (statusF === 'exhaust') return rate >= 0.8;
    });
  }

  const tbody = document.getElementById('lx-table-body');
  if (!tbody) return;

  if (!recs.length) {
    tbody.innerHTML = `<tr><td colspan="32" class="lx-empty-row">
      <i class="fas fa-inbox"></i>
      ${year}년 연차 데이터가 없습니다.<br>
      <button class="btn btn-primary btn-sm" style="margin-top:12px" onclick="openLeaveRecordAdd()">
        <i class="fas fa-user-plus"></i> 직원 추가
      </button>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = recs.map((r, idx) => {
    const usedDays  = calcUsedDays(r.id);
    const granted   = r.granted_days || 0;
    const remaining = Math.max(granted - usedDays, 0);
    const rate      = granted > 0 ? usedDays / granted : 0;
    const ratePct   = Math.round(rate * 100);
    const rateClass = rate >= 0.8 ? 'exhaust' : rate >= 0.5 ? 'warning' : 'normal';
    const resignedCls = r.resigned ? 'lx-row-resigned' : '';
    const rowCls    = (rate >= 0.8 ? 'lx-row-exhaust' : rate >= 0.5 ? 'lx-row-warning' : '') + (r.resigned ? ' lx-row-resigned' : '');
    const remainCls = rate >= 0.8 ? 'lx-remain-exhaust' : rate >= 0.5 ? 'lx-remain-warning' : 'lx-remain-ok';
    const years     = calcYearsOfService(r.join_date);
    const joinFmt   = r.join_date ? r.join_date.replace(/-/g, '.') : '—';

    // 기준일: base_date가 저장되어 있으면 사용, 없으면 입사일+연도 자동계산
    let basePeriod = '—';
    let baseDateVal = r.base_date || '';
    if (r.join_date) {
      const seg = calcBaseDateForYear(r.join_date, year);
      if (seg.base) {
        baseDateVal = baseDateVal || seg.base;
        basePeriod  = seg.period;
      }
    } else if (baseDateVal) {
      basePeriod = baseDateVal.replace(/-/g, '.');
    }
    const baseFmt = basePeriod;

    // 12개월 셀 생성
    let monthCols = '';
    for (let m = 1; m <= 12; m++) {
      const mUsages = LeaveState.usages.filter(u => u.leave_record_id === r.id && u.month === m);
      const mDays   = mUsages.reduce((s, u) => s + (u.days || 0), 0);

      // 날짜 칩 생성
      let dateContent = '';
      if (mUsages.length > 0) {
        const chips = mUsages.map(u => {
          const cls = _leaveTypeChipClass(u.leave_type);
          const dateStr = u.start_date && u.end_date && u.start_date !== u.end_date
            ? `${u.start_date.slice(5)} ~ ${u.end_date.slice(5)}`
            : (u.start_date ? u.start_date.slice(5) : '—');
          const shortType = u.leave_type === '연차' ? '연' :
                            u.leave_type === '반차(오전)' ? '반(오)' :
                            u.leave_type === '반차(오후)' ? '반(후)' :
                            u.leave_type === '병가' ? '병' :
                            u.leave_type === '건강검진' ? '검' :
                            u.leave_type === '경조사' ? '경' : '기';
          return `<span class="lx-date-chip ${cls}" title="${u.leave_type}: ${dateStr} (${u.days}일)${u.reason?' - '+u.reason:''}" onclick="openLxCellModal('${r.id}',${m},event)">${shortType}:${dateStr}</span>`;
        }).join('');
        dateContent = `<div class="lx-date-chips">${chips}</div>`;
      } else {
        dateContent = `<span class="lx-add-chip" onclick="openLxCellModal('${r.id}',${m},event)">+추가</span>`;
      }

      monthCols += `
        <td class="lx-td-date${mUsages.length>0?' has-data':''}" onclick="openLxCellModal('${r.id}',${m},event)">${dateContent}</td>
        <td class="lx-td-days${mDays===0?' days-zero':''}">${mDays > 0 ? mDays : '—'}</td>`;
    }

    const resignedBadge = r.resigned ? '<span class="resigned-badge">퇴사</span>' : '';
    return `<tr class="${rowCls}" id="lx-row-${r.id}">
      <td class="lx-td-fix lx-td-no">${idx + 1}</td>
      <td class="lx-td-fix lx-td-dept" title="${r.department||''}">${r.department || '—'}</td>
      <td class="lx-td-fix lx-td-name"><button class="lm-name-btn" onclick="openLeaveMemberFullView('${r.id}')" title="전체 연차 이력 보기">${r.name || '—'}</button>${resignedBadge}</td>
      <td class="lx-td-fix lx-td-role">${ROLE_LABEL[r.role] || r.role || '—'}</td>
      <td class="lx-td-fix lx-td-join lx-td-editable" id="lx-join-${r.id}" title="\uc785\uc0ac\uc77c \ud074\ub9ad\ud558\uc5ec \uc218\uc815" onclick="openLxInlineDateEdit('${r.id}','join_date','lx-join-${r.id}',this)">${joinFmt}</td>
      <td class="lx-td-fix lx-td-base lx-td-editable" id="lx-base-${r.id}" title="${basePeriod} (클릭하여 시작일 수정)" onclick="openLxInlineDateEdit('${r.id}','base_date','lx-base-${r.id}',this,${JSON.stringify(year)})">${baseFmt}</td>
      <td class="lx-td-fix lx-td-tenure">${years}년</td>
      <td class="lx-td-fix lx-td-grant">${granted}</td>
      ${monthCols}
      <td class="lx-td-total">${usedDays}</td>
      <td class="lx-td-remain ${remainCls}">${remaining}</td>
      <td class="lx-td-rate">
        <div class="lx-rate-bar-wrap">
          <div class="lx-rate-bar"><div class="lx-rate-fill rate-${rateClass}" style="width:${Math.min(ratePct,100)}%"></div></div>
          <span class="lx-rate-text rate-${rateClass}">${ratePct}%</span>
        </div>
      </td>
      <td class="lx-td-note lx-td-note-editable" id="lx-note-${r.id}" title="클릭하여 비고 수정" onclick="openLxNoteEdit('${r.id}',this)">${r.note ? escHtml(r.note) : '<span style="color:var(--text-muted)">—</span>'}</td>
      <td class="lx-td-actions">
        <div class="lx-act-btns">
          <button class="lx-btn lx-btn-edit" onclick="openLeaveRecordEdit('${r.id}')"><i class="fas fa-pencil-alt"></i> 수정</button>
          <button class="lx-btn ${r.resigned?'lx-btn-edit':'lx-btn-del'}" onclick="toggleResigned('${r.id}','${r.resigned?'false':'true'}')" title="${r.resigned?'확정 상태 복원':'퇴사 실적 안 현정 상태'}"><i class="fas fa-${r.resigned?'user-check':'user-times'}"></i> ${r.resigned?'복직':'퇴사'}</button>
          <button class="lx-btn lx-btn-del"  onclick="deleteLeaveRecord('${r.id}')"><i class="fas fa-trash"></i> 삭제</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

/* ══════════════════════════════════════════════
   인라인 날짜 편집 — 입사일 / 기준일 셀 클릭 수정
   ══════════════════════════════════════════════ */

/**
 * 셀 클릭 → date input 으로 교체
 * @param {string} recordId  - leave_record ID
 * @param {string} field     - 'join_date' | 'base_date'
 * @param {string} cellId    - 셀 element id (복원용)
 * @param {HTMLElement} tdEl - 클릭된 <td>
 * @param {number} [targetYear] - 기준일 구간 계산에 사용할 연도
 */
function openLxInlineDateEdit(recordId, field, cellId, tdEl, targetYear) {
  // 이미 input 이 있으면 중복 생성 방지
  if (tdEl.querySelector('input')) return;

  const r = LeaveState.records.find(x => x.id === recordId);
  if (!r) return;

  const year = targetYear || LeaveState.currentYear;
  // base_date는 저장된 값이 없으면 자동계산 값을 초기값으로 사용
  let currentVal;
  if (field === 'join_date') {
    currentVal = r.join_date || '';
  } else {
    currentVal = r.base_date || (r.join_date ? calcBaseDateForYear(r.join_date, year).base : '');
  }
  const originalText = tdEl.innerHTML;

  tdEl.textContent = '';
  const inp = document.createElement('input');
  inp.type  = 'date';
  inp.value = currentVal;
  inp.min   = '2000-01-01';
  inp.max   = '2040-12-31';
  inp.className = 'lx-inline-date-input';
  tdEl.appendChild(inp);
  inp.focus();

  // 저장 공통 처리
  const save = async () => {
    const newVal = inp.value;
    if (!newVal) { tdEl.innerHTML = originalText; return; }
    if (newVal === currentVal) { tdEl.innerHTML = originalText; return; }
    try {
      const updated = await api.put('leave_records', recordId, { ...r, [field]: newVal });
      const idx = LeaveState.records.findIndex(x => x.id === recordId);
      if (idx !== -1) LeaveState.records[idx] = { ...LeaveState.records[idx], [field]: newVal };
      if (field === 'join_date') {
        tdEl.textContent = newVal.replace(/-/g, '.');
      } else {
        // base_date 수정 → 구간 재계산
        const seg = calcBaseDateForYear(newVal, year);
        tdEl.textContent = seg.period || newVal.replace(/-/g, '.');
      }
      toast(field === 'join_date' ? '입사일이 수정되었습니다.' : '기준일이 수정되었습니다.', 'success');
      renderLeaveExcelTable();
    } catch(e) {
      tdEl.innerHTML = originalText;
      toast('저장 오류가 발생했습니다.', 'error');
    }
  };

  inp.addEventListener('blur',    () => save());
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { inp.blur(); }
    if (e.key === 'Escape') { tdEl.innerHTML = originalText; }
  });
}

/* ── 잠금 초기화 ── */
function initLeaveLock() {
  const form = document.getElementById('leave-lock-form');
  if (form) form.addEventListener('submit', e => { e.preventDefault(); tryUnlockLeave(); });
  const btn = document.getElementById('btn-leave-unlock');
  if (btn) btn.addEventListener('click', tryUnlockLeave);
}

function tryUnlockLeave() {
  const pw   = document.getElementById('leave-lock-pw')?.value || '';
  const hint = document.getElementById('leave-lock-hint');
  if (pw === getLeavePassword()) {
    LeaveState.unlocked = true;
    document.getElementById('leave-lock-pw').value = '';
    if (hint) hint.textContent = '';
    renderLeave();
  } else {
    if (hint) hint.textContent = '비밀번호가 올바르지 않습니다.';
    const card = document.querySelector('.leave-lock-card');
    if (card) { card.classList.add('shake'); setTimeout(() => card.classList.remove('shake'), 500); }
    document.getElementById('leave-lock-pw').value = '';
    document.getElementById('leave-lock-pw').focus();
  }
}

function lockLeave() {
  LeaveState.unlocked = false;
  document.getElementById('leave-lock-layer').style.display = 'flex';
  document.getElementById('leave-content').style.display   = 'none';
  document.getElementById('leave-lock-pw').value = '';
  document.getElementById('leave-lock-hint').textContent = '';
}

/* ── 부서 select ↔ text 동기화 ── */
function syncDeptInput(val) {
  const txt = document.getElementById('lr-dept-text');
  if (txt && val) txt.value = val;
}

/**
 * 입사일 + 목표연도 기준으로 해당 연차 구간의 기준일(시작일) 계산
 * 에끌라두 방식: 입사일로부터 만 N년이 되는 날부터 N+1년이 되기 하루 전까지
 *   - 1년차: join_date ~ join_date+1년-1일
 *   - 2년차: join_date+1년 ~ join_date+2년-1일
 * targetYear의 연차 구간을 찾아 base_date(구간 시작일)를 반환
 */
function calcBaseDateForYear(joinDateStr, targetYear) {
  if (!joinDateStr) return { base: '', end: '', period: '' };
  const join = new Date(joinDateStr);
  if (isNaN(join)) return { base: '', end: '', period: '' };

  // 몇 번째 연차 구간인지 = targetYear - 입사연도 (최소 0)
  // targetYear 기준으로 해당 구간을 찾아야 함
  // join이 2025-06-02이면:
  //   구간 1: 2025-06-02 ~ 2026-06-01
  //   구간 2: 2026-06-02 ~ 2027-06-01 ...
  // targetYear(예: 2025)에 해당하는 구간 탐색

  let n = Math.max(targetYear - join.getFullYear(), 0);
  // n번째 구간: join+n년 ~ join+(n+1)년-1일
  // 만약 join 월일이 targetYear의 1월1일 이후면 n, 이전이면 n-1 구간도 가능
  // 가장 직관적: targetYear의 1월1일이 속하는 구간 찾기
  // 구간 k: join+k년 <= date < join+(k+1)년
  const jan1 = new Date(targetYear, 0, 1);
  let k = 0;
  while (true) {
    const segStart = new Date(join);
    segStart.setFullYear(join.getFullYear() + k);
    const segEnd = new Date(join);
    segEnd.setFullYear(join.getFullYear() + k + 1);
    segEnd.setDate(segEnd.getDate() - 1); // 하루 전
    if (segStart <= jan1 && jan1 <= segEnd) break;
    if (segStart > jan1) { k = Math.max(k - 1, 0); break; }
    k++;
    if (k > 50) break;
  }

  const segStart = new Date(join);
  segStart.setFullYear(join.getFullYear() + k);
  const segEnd = new Date(join);
  segEnd.setFullYear(join.getFullYear() + k + 1);
  segEnd.setDate(segEnd.getDate() - 1);

  const fmt2 = d => d.toISOString().slice(0, 10);
  const fmtDot = d => d.toISOString().slice(0, 10).replace(/-/g, '.');
  return {
    base: fmt2(segStart),
    end:  fmt2(segEnd),
    period: `${fmtDot(segStart)} ~ ${fmtDot(segEnd)}`,
    year_num: k + 1,  // 몇 년차인지
  };
}

/* ── 입사일 변경 시 기준일 자동 계산 (연차 구간 기준) ── */
function autoFillBaseDate() {
  const joinVal = document.getElementById('lr-join-date')?.value;
  if (!joinVal) return;
  const targetYear = parseInt(document.getElementById('lr-year')?.value) || new Date().getFullYear();
  const result = calcBaseDateForYear(joinVal, targetYear);
  if (!result.base) return;

  const baseEl = document.getElementById('lr-base-date');
  if (baseEl) baseEl.value = result.base;
  const hint = document.getElementById('lr-base-date-hint');
  if (hint) hint.textContent = `${result.year_num}년차 구간: ${result.period}`;
}

/* ── 직원 레코드 모달 공통 초기화 ── */
function _initLeaveRecordModal(year) {
  const yrSel = document.getElementById('lr-year');
  yrSel.innerHTML = '';
  for (let y = 2040; y >= 2000; y--) {
    const o = document.createElement('option');
    o.value = y; o.textContent = `${y}년`;
    if (y === (year || LeaveState.currentYear)) o.selected = true;
    yrSel.appendChild(o);
  }
  const deptSel = document.getElementById('lr-dept');
  deptSel.innerHTML = '<option value="">부서 선택</option>' +
    State.departments.map(d => `<option value="${d.name}">${d.name}</option>`).join('');
  const calcInfo = document.getElementById('leave-calc-info');
  if (calcInfo) calcInfo.style.display = 'none';
  const adjBadge = document.getElementById('lr-adj-badge');
  if (adjBadge) adjBadge.style.display = 'none';
}

/* ── 직원 추가 ── */
function openLeaveRecordAdd() {
  document.getElementById('modal-leave-record-title').innerHTML =
    '<i class="fas fa-user-plus" style="color:var(--primary)"></i> 직원 연차 등록';
  ['lr-id','lr-member-id','lr-name','lr-join-date','lr-note','lr-dept-text','lr-used-override'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('lr-role').value    = 'general';
  document.getElementById('lr-granted').value = '15';
  document.getElementById('lr-total').value   = '15';
  const baseDateEl = document.getElementById('lr-base-date');
  if (baseDateEl) baseDateEl.value = '';
  const extraDaysEl = document.getElementById('lr-extra-days');
  if (extraDaysEl) extraDaysEl.value = '0';
  const baseDateHint = document.getElementById('lr-base-date-hint');
  if (baseDateHint) baseDateHint.textContent = '';
  // 추가일수 기간 초기화
  _resetExtraDates();
  document.getElementById('lr-current-summary').style.display = 'none';
  _initLeaveRecordModal();
  openModal('modal-leave-record');
}

/* ── 직원 수정 ── */
function openLeaveRecordEdit(id) {
  const r = LeaveState.records.find(x => x.id === id); if (!r) return;
  document.getElementById('modal-leave-record-title').innerHTML =
    '<i class="fas fa-edit" style="color:var(--accent-orange)"></i> 연차 정보 수정';
  document.getElementById('lr-id').value           = r.id;
  document.getElementById('lr-member-id').value    = r.member_id || '';
  document.getElementById('lr-name').value         = r.name || '';
  document.getElementById('lr-role').value         = r.role || 'general';
  document.getElementById('lr-join-date').value    = r.join_date || '';
  document.getElementById('lr-granted').value      = r.granted_days || 15;
  document.getElementById('lr-total').value        = r.total_days || 15;
  document.getElementById('lr-note').value         = r.note || '';
  document.getElementById('lr-dept-text').value    = r.department || '';
  document.getElementById('lr-used-override').value = '';
  const baseDateEl = document.getElementById('lr-base-date');
  if (baseDateEl) baseDateEl.value = r.base_date || '';
  const extraDaysEl = document.getElementById('lr-extra-days');
  if (extraDaysEl) extraDaysEl.value = r.extra_days !== undefined ? r.extra_days : 0;
  const baseDateHint = document.getElementById('lr-base-date-hint');
  if (baseDateHint) baseDateHint.textContent = r.base_date ? `현재 기준일: ${r.base_date.replace(/-/g,'.')}` : '';
  // 추가일수 기간 로드
  const extraStartEl = document.getElementById('lr-extra-start');
  const extraEndEl   = document.getElementById('lr-extra-end');
  if (extraStartEl) extraStartEl.value = r.extra_start_date || '';
  if (extraEndEl)   extraEndEl.value   = r.extra_end_date   || '';
  _updateExtraDatePreview();
  _initLeaveRecordModal(r.year);

  // 부서 select 동기화
  const deptSel = document.getElementById('lr-dept');
  const matchDept = State.departments.find(d => d.name === r.department);
  deptSel.value = matchDept ? r.department : '';

  // 현재 상태 요약
  const usedDays  = calcUsedDays(r.id);
  const remaining = Math.max((r.granted_days || 0) - usedDays, 0);
  const recUsages = LeaveState.usages.filter(u => u.leave_record_id === r.id);
  const summary   = document.getElementById('lr-current-summary');
  summary.style.display = 'flex';
  summary.innerHTML = `
    <div class="lrp-item"><div class="lrp-label">현재 발생</div><div class="lrp-val">${r.granted_days || 0}일</div></div>
    <div class="lrp-item"><div class="lrp-label">사용 기록</div><div class="lrp-val" style="color:var(--accent-orange)">${usedDays}일 (${recUsages.length}건)</div></div>
    <div class="lrp-item"><div class="lrp-label">잔여</div><div class="lrp-val" style="color:var(--primary)">${remaining}일</div></div>
    <div class="lrp-item"><div class="lrp-label">입사일</div><div class="lrp-val" style="font-size:13px;font-weight:600">${r.join_date || '—'}</div></div>`;
  openModal('modal-leave-record');
}

/* ── 추가 연차 기간 헬퍼 ── */

/** 추가일수 필드·기간 완전 초기화 */
function _resetExtraDates() {
  const startEl   = document.getElementById('lr-extra-start');
  const endEl     = document.getElementById('lr-extra-end');
  const previewEl = document.getElementById('extra-date-preview');
  if (startEl)   startEl.value   = '';
  if (endEl)     endEl.value     = '';
  if (previewEl) previewEl.style.display = 'none';
}

/**
 * 시작일~종료일 달력이 바뀌면 → 영업일(달력일) 기준 일수를 자동계산해
 * lr-extra-days 필드에 채워주고, 미리보기 텍스트를 갱신
 */
function syncExtraDaysFromDates() {
  const startVal = document.getElementById('lr-extra-start')?.value;
  const endVal   = document.getElementById('lr-extra-end')?.value;
  if (!startVal || !endVal) { _updateExtraDatePreview(); return; }

  const s = new Date(startVal);
  const e = new Date(endVal);
  if (e < s) {
    _updateExtraDatePreview('error');
    toast('종료일이 시작일보다 앞에 있습니다.', 'error');
    return;
  }

  // 달력 일수 계산 (종료일 포함)
  const diffDays = Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
  const daysEl = document.getElementById('lr-extra-days');
  if (daysEl) daysEl.value = diffDays;

  _updateExtraDatePreview();
}

/**
 * lr-extra-days 숫자를 직접 바꾸면 → 기간 표시만 갱신
 * (달력은 건드리지 않음 — 이미 날짜가 있으면 유지)
 */
function syncExtraDaysFromCount() {
  _updateExtraDatePreview();
}

/** 미리보기 텍스트 갱신 */
function _updateExtraDatePreview(state) {
  const startVal  = document.getElementById('lr-extra-start')?.value;
  const endVal    = document.getElementById('lr-extra-end')?.value;
  const daysVal   = parseFloat(document.getElementById('lr-extra-days')?.value) || 0;
  const previewEl = document.getElementById('extra-date-preview');
  const textEl    = document.getElementById('extra-date-preview-text');
  if (!previewEl || !textEl) return;

  if (state === 'error') {
    previewEl.style.display = 'flex';
    previewEl.className = 'extra-date-preview extra-preview-error';
    textEl.textContent = '⚠️ 종료일이 시작일보다 앞에 있습니다.';
    return;
  }

  if (!startVal && !endVal && daysVal === 0) {
    previewEl.style.display = 'none';
    return;
  }

  previewEl.style.display = 'flex';
  previewEl.className = 'extra-date-preview extra-preview-ok';

  let text = '';
  if (startVal && endVal) {
    const s = new Date(startVal);
    const e = new Date(endVal);
    // MM월DD일 형식
    const fmt = d => `${d.getMonth()+1}월 ${String(d.getDate()).padStart(2,'0')}일`;
    const diffDays = Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
    text = `${fmt(s)} ~ ${fmt(e)}  (${diffDays}일)`;
    if (daysVal !== diffDays) {
      text += `  · 입력값: ${daysVal}일`;
    }
  } else if (startVal) {
    const s = new Date(startVal);
    const fmt = d => `${d.getMonth()+1}월 ${String(d.getDate()).padStart(2,'0')}일`;
    text = `시작: ${fmt(s)}  · ${daysVal}일`;
  } else if (daysVal > 0) {
    text = `추가 ${daysVal}일 (기간 미지정)`;
  }
  textEl.textContent = text;
}

/* 자동계산 */
function autoCalcLeave() {
  const joinDate = document.getElementById('lr-join-date').value;
  const year     = parseInt(document.getElementById('lr-year').value) || LeaveState.currentYear;
  if (!joinDate) { toast('입사일을 먼저 입력하세요.', 'warning'); return; }

  const result = calcLegalLeave(joinDate, year);
  document.getElementById('lr-granted').value = result.granted;
  document.getElementById('lr-total').value   = result.total;

  // 계산 결과 힌트 표시
  const infoBox  = document.getElementById('leave-calc-info');
  const infoText = document.getElementById('leave-calc-text');
  if (infoText) infoText.textContent = result.info;
  if (infoBox)  infoBox.style.display = 'flex';

  // 자세한 안내 표시 (몇 년차 구간 정보도 함께)
  const seg = calcBaseDateForYear(joinDate, year);
  const hintEl = document.getElementById('lr-base-date-hint');
  if (hintEl && seg.period) {
    hintEl.textContent = `${seg.year_num}년차 구간: ${seg.period}`;
  }

  toast(`✅ ${year}년 법정 연차: ${result.granted}일 자동입력`, 'success');
}

/* 저장 */
async function saveLeaveRecord() {
  const id        = document.getElementById('lr-id').value;
  const name      = document.getElementById('lr-name').value.trim();
  const deptText  = document.getElementById('lr-dept-text').value.trim();
  const deptSel   = document.getElementById('lr-dept').value;
  const dept      = deptText || deptSel || '';
  const role      = document.getElementById('lr-role').value;
  const year      = parseInt(document.getElementById('lr-year').value) || LeaveState.currentYear;
  const joinDate  = document.getElementById('lr-join-date').value;
  const granted   = parseFloat(document.getElementById('lr-granted').value) || 0;
  const total     = parseFloat(document.getElementById('lr-total').value) || granted;
  const note      = document.getElementById('lr-note').value.trim();
  const baseDate  = document.getElementById('lr-base-date')?.value || '';
  const extraDays      = parseFloat(document.getElementById('lr-extra-days')?.value) || 0;
  const extraStartDate = document.getElementById('lr-extra-start')?.value || '';
  const extraEndDate   = document.getElementById('lr-extra-end')?.value   || '';
  const overrideRaw    = document.getElementById('lr-used-override').value;
  const usedOverride   = overrideRaw !== '' ? parseFloat(overrideRaw) : null;

  if (!name)        { toast('이름을 입력하세요.', 'error'); return; }
  if (!joinDate)    { toast('입사일을 입력하세요.', 'error'); return; }
  if (granted <= 0) { toast('발생 휴가일수를 입력하세요.', 'error'); return; }

  // 추가일수 기간 유효성 검사
  if (extraDays > 0 && extraStartDate && extraEndDate) {
    if (extraEndDate < extraStartDate) {
      toast('추가 연차 종료일이 시작일보다 앞에 있습니다.', 'error'); return;
    }
  }

  const btn = document.getElementById('btn-save-leave-record');
  btn.disabled = true; btn.textContent = '저장 중...';

  const usedDays  = usedOverride !== null ? usedOverride : (id ? calcUsedDays(id) : 0);
  const remaining = Math.max(granted - usedDays, 0);
  const data = {
    name, department: dept, role, year, join_date: joinDate,
    granted_days: granted, total_days: total,
    used_days: usedDays, remaining_days: remaining, note,
    base_date: baseDate, extra_days: extraDays,
    extra_start_date: extraStartDate,
    extra_end_date:   extraEndDate,
    member_id: document.getElementById('lr-member-id').value || '',
  };

  try {
    if (id) {
      const r = await api.put('leave_records', id, { ...data, id });
      const idx = LeaveState.records.findIndex(x => x.id === id);
      if (idx !== -1) LeaveState.records[idx] = r;
      toast(`${name}님 연차 정보가 수정되었습니다.`, 'success');
    } else {
      data.id = genId();
      const r = await api.post('leave_records', data);
      LeaveState.records.push(r);
      toast(`${name}님이 등록되었습니다.`, 'success');
    }
    closeModal('modal-leave-record');
    renderLeaveStats(); renderLeaveExcelTable();
  } catch(e) { toast('저장 오류가 발생했습니다.', 'error'); }
  finally { btn.disabled = false; btn.textContent = '저장'; }
}

/* 삭제 */
async function deleteLeaveRecord(id) {
  const r = LeaveState.records.find(x => x.id === id); if (!r) return;
  if (!confirm(`[${r.name}] 직원의 연차 데이터를 삭제하시겠습니까?\n관련 사용기록도 함께 삭제됩니다.`)) return;
  try {
    await api.del('leave_records', id);
    LeaveState.records = LeaveState.records.filter(x => x.id !== id);
    const relUsages = LeaveState.usages.filter(u => u.leave_record_id === id);
    for (const u of relUsages) { try { await api.del('leave_usages', u.id); } catch(e) {} }
    LeaveState.usages = LeaveState.usages.filter(u => u.leave_record_id !== id);
    toast(`${r.name}님 연차 데이터가 삭제되었습니다.`, 'success');
    renderLeaveStats(); renderLeaveExcelTable();
  } catch(e) { toast('삭제 오류', 'error'); }
}

/* ══════════════════════════════════════════════
   셀 클릭 모달 — 일수 자동계산
   ══════════════════════════════════════════════ */
/**
 * lx-start / lx-end 변경 시 lx-days 자동계산
 * - 연차/병가/경조사 등 : (종료일 - 시작일 + 1)일
 * - 반차 : 0.5일 고정 (날짜 범위 무시)
 * - 시작일 = 종료일 : 1일
 * - 시작일만 있고 종료일 없을 때: 1일
 */
function autoCalcLxDays() {
  const startVal = document.getElementById('lx-start')?.value;
  const endVal   = document.getElementById('lx-end')?.value;
  const typeVal  = document.getElementById('lx-type')?.value || '';
  const daysEl   = document.getElementById('lx-days');
  const hintEl   = document.getElementById('lx-days-hint');

  // 반차는 0.5일 고정
  if (typeVal.startsWith('반차')) {
    if (daysEl) daysEl.value = '0.5';
    if (hintEl) hintEl.textContent = '→ 0.5일 (반차)';
    _updateLxRemainPreview(document.getElementById('lx-record-id')?.value, null);
    return;
  }

  if (!startVal) return; // 시작일 없으면 자동계산 안함

  // 종료일 없으면 1일 처리
  if (!endVal) {
    if (daysEl) daysEl.value = '1';
    if (hintEl) hintEl.textContent = '';
    _updateLxRemainPreview(document.getElementById('lx-record-id')?.value, null);
    return;
  }

  // 종료일 < 시작일 → 오류 힌트
  if (endVal < startVal) {
    if (hintEl) hintEl.textContent = '⚠️ 종료일이 시작일보다 빠릅니다';
    hintEl.style.color = 'var(--accent-red, #e53e3e)';
    return;
  }

  // 일수 계산: (종료 - 시작) / 하루ms + 1
  const s = new Date(startVal);
  const e = new Date(endVal);
  const diffDays = Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;

  if (daysEl) daysEl.value = diffDays;
  if (hintEl) {
    hintEl.textContent = diffDays === 1 ? '→ 1일' : `→ ${diffDays}일 자동계산`;
    hintEl.style.color = 'var(--accent-blue, #4A90E2)';
  }

  _updateLxRemainPreview(document.getElementById('lx-record-id')?.value, null);
}

/* ══════════════════════════════════════════════
   셀 클릭 모달 — 월별 사용기록 추가/수정/삭제
   ══════════════════════════════════════════════ */
function openLxCellModal(recordId, month, event) {
  if (event) event.stopPropagation();
  const r = LeaveState.records.find(x => x.id === recordId); if (!r) return;
  LeaveState.currentRecordId = recordId;

  document.getElementById('lx-record-id').value = recordId;
  document.getElementById('lx-month').value     = month;

  // 모달 타이틀
  document.getElementById('modal-lx-cell-title').innerHTML =
    `<i class="fas fa-calendar-day" style="color:var(--accent-orange)"></i> ${r.name}님 — ${month}월 휴가 기록`;

  // 대상자 배너
  const usedDays  = calcUsedDays(recordId);
  const remaining = Math.max((r.granted_days || 0) - usedDays, 0);
  document.getElementById('lx-cell-target-banner').innerHTML = `
    <span class="avatar" style="width:36px;height:36px;font-size:14px;background:var(--primary)">${(r.name||'?').charAt(0)}</span>
    <div>
      <div style="font-weight:700;font-size:14px">${r.name}</div>
      <div style="font-size:12px;color:var(--text-secondary)">${r.department||''} · ${month}월 · 발생 <strong>${r.granted_days||0}일</strong> / 잔여 <strong style="color:var(--primary)">${remaining}일</strong></div>
    </div>`;

  // 기존 기록 목록
  const mUsages = LeaveState.usages.filter(u => u.leave_record_id === recordId && u.month === month);
  const existList = document.getElementById('lx-cell-existing-list');
  if (mUsages.length > 0) {
    existList.innerHTML = `
      <div style="font-size:12px;font-weight:700;color:var(--text-secondary);margin-bottom:8px">${month}월 사용 기록 (${mUsages.length}건)</div>` +
      mUsages.map(u => {
        const cls = _leaveTypeChipClass(u.leave_type);
        const dateStr = u.start_date && u.end_date && u.start_date !== u.end_date
          ? `${u.start_date} ~ ${u.end_date}`
          : (u.start_date || '—');
        return `
        <div class="lx-existing-usage-row" id="lx-exist-${u.id}">
          <span class="usage-type-badge" style="${_leaveBadgeStyle(u.leave_type)}">${u.leave_type}</span>
          <div class="usage-info">${dateStr}${u.reason ? ' · ' + u.reason : ''}</div>
          <div class="usage-days">${u.days}일</div>
          <button class="lx-existing-edit-btn" onclick="openLxUsageEditInline('${u.id}','${recordId}',${month})"><i class="fas fa-pencil-alt"></i></button>
          <button class="lx-existing-del-btn"  onclick="deleteLxUsage('${u.id}','${recordId}',${month})"><i class="fas fa-trash"></i></button>
        </div>`;
      }).join('');
  } else {
    existList.innerHTML = `<div style="font-size:12px;color:var(--text-muted);padding:6px 0">${month}월 사용 기록이 없습니다.</div>`;
  }

  // 새 기록 폼 초기화
  const monthStr = String(month).padStart(2,'0');
  document.getElementById('lx-type').value   = '연차';
  document.getElementById('lx-days').value   = '1';
  document.getElementById('lx-start').value  = `${LeaveState.currentYear}-${monthStr}-01`;
  document.getElementById('lx-end').value    = `${LeaveState.currentYear}-${monthStr}-01`;
  document.getElementById('lx-reason').value = '';
  const hintEl = document.getElementById('lx-days-hint');
  if (hintEl) { hintEl.textContent = ''; hintEl.style.color = ''; }

  _updateLxRemainPreview(recordId, null);
  openModal('modal-lx-cell');
}

function _leaveBadgeStyle(type) {
  if (!type) return 'background:#e8eef8;color:#1B3A6B';
  if (type === '연차') return 'background:#e8f5ec;color:#27AE60';
  if (type.startsWith('반차')) return 'background:#fef3e2;color:#E67E22';
  if (type === '병가' || type === '건강검진') return 'background:#fce8e8;color:#E74C3C';
  return 'background:#f3eafd;color:#8E44AD';
}

function _updateLxRemainPreview(recordId, excludeUsageId) {
  const r = LeaveState.records.find(x => x.id === recordId); if (!r) return;
  const otherUsed = LeaveState.usages
    .filter(u => u.leave_record_id === recordId && (excludeUsageId ? u.id !== excludeUsageId : true))
    .reduce((s, u) => s + (u.days || 0), 0);
  const addDays   = parseFloat(document.getElementById('lx-days')?.value || 0) || 0;
  const granted   = r.granted_days || 0;
  const afterUsed = otherUsed + addDays;
  const afterRem  = Math.max(granted - afterUsed, 0);
  const prev = document.getElementById('lx-remain-preview');
  if (!prev) return;
  prev.innerHTML = `
    <div class="lrp-item"><div class="lrp-label">발생일수</div><div class="lrp-val">${granted}일</div></div>
    <div class="lrp-item"><div class="lrp-label">현재 사용</div><div class="lrp-val" style="color:var(--accent-orange)">${otherUsed}일</div></div>
    <div class="lrp-item"><div class="lrp-label">이번 입력</div><div class="lrp-val" style="color:var(--accent-red)">${addDays}일</div></div>
    <div class="lrp-item"><div class="lrp-label">저장 후 잔여</div><div class="lrp-val" style="color:var(--primary)">${afterRem}일</div></div>`;
}

/* 셀 모달 — 새 기록 저장 */
async function saveLxCellUsage() {
  const recordId = document.getElementById('lx-record-id').value;
  const month    = parseInt(document.getElementById('lx-month').value);
  const type     = document.getElementById('lx-type').value;
  const days     = parseFloat(document.getElementById('lx-days').value) || 0;
  const start    = document.getElementById('lx-start').value;
  const end      = document.getElementById('lx-end').value;
  const reason   = document.getElementById('lx-reason').value.trim();

  if (!start || !end) { toast('시작일과 종료일을 입력하세요.', 'error'); return; }
  if (days <= 0)      { toast('사용일수를 입력하세요.', 'error'); return; }
  if (start > end)    { toast('종료일이 시작일보다 빠릅니다.', 'error'); return; }

  const btn = document.getElementById('btn-lx-cell-save');
  btn.disabled = true; btn.textContent = '저장 중...';

  const data = {
    id: genId(), leave_record_id: recordId, month,
    start_date: start, end_date: end, days, leave_type: type, reason,
    member_id: LeaveState.records.find(x => x.id === recordId)?.member_id || '',
  };

  try {
    const res = await api.post('leave_usages', data);
    LeaveState.usages.push(res);
    await _syncLeaveRecordUsed(recordId);
    closeModal('modal-lx-cell');
    toast(`${type} ${days}일이 저장되었습니다.`, 'success');
    renderLeaveStats(); renderLeaveExcelTable();
  } catch(e) { toast('저장 오류', 'error'); }
  finally { btn.disabled = false; btn.textContent = '+ 추가'; }
}

/* 인라인 수정 (기존 기록 편집 — 폼 재사용) */
function openLxUsageEditInline(usageId, recordId, month) {
  const u = LeaveState.usages.find(x => x.id === usageId); if (!u) return;

  // 폼에 기존 값 채우기
  document.getElementById('lx-type').value   = u.leave_type || '연차';
  document.getElementById('lx-days').value   = u.days || 1;
  document.getElementById('lx-start').value  = u.start_date || '';
  document.getElementById('lx-end').value    = u.end_date || '';
  document.getElementById('lx-reason').value = u.reason || '';
  // 힌트 초기화 (수정 모드에서도 날짜 힌트 표시)
  const _lxHintEdit = document.getElementById('lx-days-hint');
  if (_lxHintEdit) { _lxHintEdit.textContent = '기존값'; _lxHintEdit.style.color = 'var(--text-muted)'; }

  // 저장 버튼을 수정 모드로 변환
  const btn = document.getElementById('btn-lx-cell-save');
  btn.textContent = '✏️ 수정 저장';
  btn.dataset.mode = 'edit';
  btn.onclick = async () => {
    const type   = document.getElementById('lx-type').value;
    const days   = parseFloat(document.getElementById('lx-days').value) || 0;
    const start  = document.getElementById('lx-start').value;
    const end    = document.getElementById('lx-end').value;
    const reason = document.getElementById('lx-reason').value.trim();
    if (!start || !end) { toast('날짜를 입력하세요.', 'error'); return; }
    if (days <= 0) { toast('사용일수를 입력하세요.', 'error'); return; }
    btn.disabled = true; btn.textContent = '저장 중...';
    try {
      const updated = { ...u, leave_type: type, days, start_date: start, end_date: end, reason, month };
      const res = await api.put('leave_usages', usageId, updated);
      const idx = LeaveState.usages.findIndex(x => x.id === usageId);
      if (idx !== -1) LeaveState.usages[idx] = res;
      await _syncLeaveRecordUsed(recordId);
      closeModal('modal-lx-cell');
      toast('사용기록이 수정되었습니다.', 'success');
      renderLeaveStats(); renderLeaveExcelTable();
    } catch(e) { toast('수정 오류', 'error'); }
    finally { btn.disabled = false; }
  };

  _updateLxRemainPreview(recordId, usageId);
  // 기존 기록 강조
  document.querySelectorAll('.lx-existing-usage-row').forEach(el => el.style.opacity = '0.5');
  const targetRow = document.getElementById(`lx-exist-${usageId}`);
  if (targetRow) { targetRow.style.opacity = '1'; targetRow.style.outline = '2px solid var(--primary)'; targetRow.style.borderRadius = '6px'; }
}

/* 셀 모달 — 사용기록 삭제 */
async function deleteLxUsage(usageId, recordId, month) {
  if (!confirm('이 사용기록을 삭제하시겠습니까?')) return;
  try {
    await api.del('leave_usages', usageId);
    LeaveState.usages = LeaveState.usages.filter(x => x.id !== usageId);
    await _syncLeaveRecordUsed(recordId);
    // 모달 내 목록 갱신
    const row = document.getElementById(`lx-exist-${usageId}`);
    if (row) row.remove();
    toast('사용기록이 삭제되었습니다.', 'success');
    renderLeaveStats(); renderLeaveExcelTable();
    // 잔여 미리보기 갱신
    _updateLxRemainPreview(recordId, null);
  } catch(e) { toast('삭제 오류', 'error'); }
}

/* leave_records used_days/remaining_days 동기화 */
async function _syncLeaveRecordUsed(recordId) {
  const r = LeaveState.records.find(x => x.id === recordId); if (!r) return;
  const newUsed = calcUsedDays(recordId);
  const newRem  = Math.max((r.granted_days || 0) - newUsed, 0);
  r.used_days      = newUsed;
  r.remaining_days = newRem;
  try { await api.put('leave_records', r.id, { ...r }); } catch(e) {}
}

/* ── 연차관리 비밀번호 변경 ── */
function openLeavePwModal() {
  document.getElementById('new-leave-pw').value     = '';
  document.getElementById('confirm-leave-pw').value = '';
  openModal('modal-leave-pw');
}

function saveLeavePassword_fn() {
  const pw1 = document.getElementById('new-leave-pw').value;
  const pw2 = document.getElementById('confirm-leave-pw').value;
  if (!pw1 || pw1.length < 4) { toast('비밀번호는 4자 이상이어야 합니다.', 'error'); return; }
  if (pw1 !== pw2) { toast('비밀번호가 일치하지 않습니다.', 'error'); return; }
  saveLeavePassword(pw1);
  closeModal('modal-leave-pw');
  toast('연차관리 비밀번호가 변경되었습니다.', 'success');
}

/* 하위 호환 — 구 함수명 alias */
function renderLeaveTable() { renderLeaveExcelTable(); }

/* ============================================================  LOGIN SYSTEM  ============================================================ */

/* 로그인 모드 전환 (관리자 / 직원) */
function switchLoginMode(mode) {
  const adminSection = document.getElementById('admin-login-section');
  const staffSection = document.getElementById('staff-login-section');
  const adminTab     = document.getElementById('tab-admin-login');
  const staffTab     = document.getElementById('tab-staff-login');
  if(mode === 'admin') {
    adminSection.style.display = '';
    staffSection.style.display = 'none';
    adminTab.classList.add('active');
    staffTab.classList.remove('active');
    document.getElementById('login-hint').textContent = '';
  } else {
    adminSection.style.display = 'none';
    staffSection.style.display = '';
    adminTab.classList.remove('active');
    staffTab.classList.add('active');
    document.getElementById('staff-login-hint').textContent = '';
    setTimeout(()=>document.getElementById('staff-login-name')?.focus(), 80);
  }
}

/* 직원 로그인 처리 */
async function handleStaffLogin() {
  const nameVal = (document.getElementById('staff-login-name')?.value || '').trim();
  const pwVal   = document.getElementById('staff-login-pw')?.value || '';
  const hint    = document.getElementById('staff-login-hint');
  if(!nameVal || !pwVal) { if(hint) hint.textContent = '이름과 비밀번호를 입력하세요.'; return; }

  // 직원 목록이 아직 로드 안 됐으면 먼저 fetch
  let memberList = State.members;
  if(!memberList.length) {
    try {
      const res = await api.get('members');
      memberList = res.data || [];
    } catch(e) { if(hint) hint.textContent = '서버 오류가 발생했습니다.'; return; }
  }

  // 이름으로 매칭
  const matched = memberList.find(m => m.name === nameVal && m.is_active !== false);
  if(!matched) {
    if(hint) hint.textContent = '등록된 직원이 아니거나 탈퇴 처리된 계정입니다.';
    const card = document.querySelector('.login-card');
    if(card){ card.classList.add('shake'); setTimeout(()=>card.classList.remove('shake'),500); }
    return;
  }
  if(!matched.login_pw) {
    if(hint) hint.textContent = '비밀번호가 설정되지 않은 계정입니다. 관리자에게 문의하세요.';
    return;
  }
  if(matched.login_pw !== pwVal) {
    if(hint) hint.textContent = '비밀번호가 올바르지 않습니다.';
    document.getElementById('staff-login-pw').value = '';
    document.getElementById('staff-login-pw').focus();
    const card = document.querySelector('.login-card');
    if(card){ card.classList.add('shake'); setTimeout(()=>card.classList.remove('shake'),500); }
    return;
  }

  // 로그인 성공
  State.loginRole    = 'member';
  State.loginMember  = matched; // 현재 로그인한 직원 정보
  State.owner        = { id: matched.id, name: matched.name, email: matched.email,
    dept: matched.department||'', avatarColor: matched.avatar_color||'#1B3A6B',
    role: matched.role||'member' };

  const overlay = document.getElementById('login-overlay');
  if(overlay) overlay.classList.add('hidden');
  document.body.classList.remove('login-open'); // body 고정 해제

  // main-content 강제 표시 + reflow
  const mainContent = document.getElementById('main-content');
  if(mainContent) {
    mainContent.style.display = '';
    mainContent.style.visibility = 'visible';
    mainContent.style.opacity = '1';
    void mainContent.offsetHeight;
  }

  // 스크롤 위치 초기화
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;

  applySidebarPermissions();
  showLogoutButton();
  toast(`${matched.name}님, 환영합니다! 👋`, 'success');
  document.getElementById('staff-login-pw').value = '';

  // dashboard 페이지 먼저 표시 (로딩 중 빈 화면 방지)
  State.currentPage = 'dashboard';
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const dashPage = document.getElementById('page-dashboard');
  if(dashPage) {
    dashPage.classList.add('active');
    void dashPage.offsetHeight; // Safari reflow
  }
  const titleEl = document.getElementById('mobile-top-title');
  if(titleEl) titleEl.textContent = '대시보드';
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const dashNav = document.querySelector('.nav-item[data-page="dashboard"]');
  if(dashNav) dashNav.classList.add('active');

  loadAll();
}

function initLogin() {
  const overlay = document.getElementById('login-overlay');
  if (!overlay) return;

  // 역할 탭 클릭 (관리자)
  overlay.querySelectorAll('.role-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      overlay.querySelectorAll('.role-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      State.selectedLoginRole = tab.dataset.role;
      const idMap = { admin1: 'admin1', admin2: 'admin2' };
      const usernameEl = document.getElementById('login-username');
      if (usernameEl) usernameEl.value = idMap[tab.dataset.role] || '';
      const hint = document.getElementById('login-hint');
      if (hint) hint.textContent = '';
    });
  });

  // 관리자 로그인 form submit
  const loginForm = document.getElementById('login-form');
  if (loginForm) loginForm.addEventListener('submit', e => { e.preventDefault(); handleLogin(); });
  const btnLogin = document.getElementById('btn-login');
  if (btnLogin) btnLogin.addEventListener('click', handleLogin);

  // 직원 로그인 form submit
  const staffForm = document.getElementById('staff-login-form');
  if (staffForm) staffForm.addEventListener('submit', e => { e.preventDefault(); handleStaffLogin(); });

  // 초기 아이디 자동 입력
  const usernameEl = document.getElementById('login-username');
  if (usernameEl) usernameEl.value = 'admin1';
}

/* ── 비밀번호 초기화 ── */
function confirmResetPassword() {
  const confirmed = confirm(
    '⚠️  비밀번호를 기본값으로 초기화합니다.\n\n' +
    '초기화 후 비밀번호:\n' +
    '  관리자1 (admin1) → eclado1\n' +
    '  관리자2 (admin2) → eclado2\n' +
    '  일반멤버 (member) → eclado\n\n' +
    '모든 기기에 동일하게 적용됩니다. 계속하시겠습니까?'
  );
  if (!confirmed) return;
  resetPasswordToDefault();
}

async function resetPasswordToDefault() {
  const hint = document.getElementById('login-hint');
  try {
    // 서버 DB에 기본값으로 덮어쓰기 → 모든 기기 즉시 반영
    await saveCredentials({ ...CRED_DEFAULTS });

    const pwEl = document.getElementById('login-password');
    if (pwEl) { pwEl.value = ''; pwEl.focus(); }

    if (hint) {
      hint.style.color = '#27AE60';
      hint.textContent = '✅ 비밀번호가 기본값으로 초기화되었습니다. (모든 기기 적용)';
      setTimeout(() => { if (hint) { hint.style.color = ''; hint.textContent = ''; } }, 5000);
    }
  } catch(e) {
    if (hint) { hint.style.color = ''; hint.textContent = '서버 오류로 초기화에 실패했습니다.'; }
  }
}

function handleLogin() {
  const creds = getCredentials();
  const selectedRole = State.selectedLoginRole;
  const idMap = { admin1: 'admin1', admin2: 'admin2', member: 'member' };
  const username = (document.getElementById('login-username')?.value || '').trim();
  const password = document.getElementById('login-password')?.value || '';
  const hint = document.getElementById('login-hint');

  if (!username || !password) {
    if (hint) hint.textContent = '아이디와 비밀번호를 모두 입력하세요.';
    return;
  }

  if (username === idMap[selectedRole] && password === creds[selectedRole]) {
    State.loginRole = selectedRole;

    // 로그인 오버레이 숨기기 + body 고정 해제
    const overlay = document.getElementById('login-overlay');
    if (overlay) overlay.classList.add('hidden');
    document.body.classList.remove('login-open');

    // main-content 강제 표시 + reflow
    const mainContent = document.getElementById('main-content');
    if (mainContent) {
      mainContent.style.display = '';
      mainContent.style.visibility = 'visible';
      mainContent.style.opacity = '1';
      void mainContent.offsetHeight;
    }

    // 스크롤 위치 초기화
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;

    // 사이드바 권한 적용
    applySidebarPermissions();

    // 사이드바 하단 로그아웃 버튼 표시
    showLogoutButton();

    // 로그인 역할 표시
    const roleLabels = { admin1: '관리자 1', admin2: '관리자 2', member: '일반 멤버' };
    toast(`${roleLabels[selectedRole]}로 로그인되었습니다. 환영합니다! 👋`, 'success');

    // Android Chrome: 로그인 후 PWA 설치 배너 트리거
    window.dispatchEvent(new Event('eclado-logged-in'));

    // 비밀번호 초기화
    const pwEl = document.getElementById('login-password');
    if (pwEl) pwEl.value = '';

    // dashboard 페이지 먼저 표시 (로딩 중 빈 화면 방지)
    State.currentPage = 'dashboard';
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const dashPage = document.getElementById('page-dashboard');
    if (dashPage) {
      dashPage.classList.add('active');
      void dashPage.offsetHeight; // Safari reflow 강제 트리거
    }
    // 모바일 상단 타이틀 업데이트
    const titleEl = document.getElementById('mobile-top-title');
    if (titleEl) titleEl.textContent = '대시보드';
    // 네비 active 처리
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const dashNav = document.querySelector('.nav-item[data-page="dashboard"]');
    if (dashNav) dashNav.classList.add('active');

    // 데이터 로드
    loadAll();
  } else {
    if (hint) hint.textContent = '아이디 또는 비밀번호가 올바르지 않습니다.';
    // 비밀번호 필드 포커스
    const pwEl = document.getElementById('login-password');
    if (pwEl) { pwEl.value = ''; pwEl.focus(); }
    // 카드 흔들기 효과
    const card = document.querySelector('.login-card');
    if (card) { card.classList.add('shake'); setTimeout(() => card.classList.remove('shake'), 500); }
  }
}

function logout() {
  if (!confirm('로그아웃 하시겠습니까?')) return;
  State.loginRole = null;
  State.selectedLoginRole = 'admin1';

  // 로그인 오버레이 표시 + body 고정
  const overlay = document.getElementById('login-overlay');
  if (overlay) {
    overlay.classList.remove('hidden');
    overlay.scrollTop = 0; // 스크롤 초기화
    // 탭 초기화 (관리자1 선택)
    overlay.querySelectorAll('.role-tab').forEach(t => t.classList.remove('active'));
    const admin1Tab = overlay.querySelector('.role-tab[data-role="admin1"]');
    if (admin1Tab) admin1Tab.classList.add('active');
    // 아이디 초기화
    const usernameEl = document.getElementById('login-username');
    if (usernameEl) usernameEl.value = 'admin1';
    const pwEl = document.getElementById('login-password');
    if (pwEl) pwEl.value = '';
    const hint = document.getElementById('login-hint');
    if (hint) hint.textContent = '';
  }
  document.body.classList.add('login-open');

  // 로그아웃 버튼 숨기기
  const logoutBtn = document.getElementById('sidebar-logout-btn');
  if (logoutBtn) logoutBtn.style.display = 'none';

  // 권한 초기화
  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    el.style.opacity = '';
    el.style.pointerEvents = '';
    el.title = '';
  });
}

function showLogoutButton() {
  let logoutBtn = document.getElementById('sidebar-logout-btn');
  if (!logoutBtn) {
    logoutBtn = document.createElement('div');
    logoutBtn.id = 'sidebar-logout-btn';
    logoutBtn.className = 'sidebar-logout-btn';
    logoutBtn.innerHTML = `<i class="fas fa-sign-out-alt"></i><span>로그아웃</span>`;
    logoutBtn.addEventListener('click', logout);
    // 사이드바 footer 위에 삽입
    const footer = document.querySelector('.sidebar-footer');
    if (footer) footer.parentNode.insertBefore(logoutBtn, footer);
  }
  logoutBtn.style.display = 'flex';

  // 현재 역할 표시
  const roleLabels = { admin1: '관리자 1', admin2: '관리자 2', member: '일반 멤버' };
  const roleEl = document.getElementById('sidebar-login-role');
  if (roleEl) roleEl.textContent = roleLabels[State.loginRole] || '';
}

/* ============================================================  OWNER EDIT  ============================================================ */
function renderOwnerAvatarPicker() {
  const row=document.getElementById('avatar-color-row'); if(!row) return;
  row.innerHTML=AVATAR_COLORS.map(c=>`<div class="avatar-color-swatch ${c===State.owner.avatarColor?'selected':''}" style="background:${c}" onclick="selectOwnerColor('${c}')"></div>`).join('');
}

function selectOwnerColor(c) {
  State.owner.avatarColor=c;
  const prev=document.getElementById('owner-preview-avatar');
  if(prev) prev.style.background=c;
  renderOwnerAvatarPicker();
}

function openOwnerEdit() {
  document.getElementById('owner-name').value          = State.owner.name;
  document.getElementById('owner-role-input').value    = State.owner.role;
  document.getElementById('owner-email').value         = State.owner.email;
  document.getElementById('owner-dept-input').value    = State.owner.dept||'';
  document.getElementById('owner-phone').value         = State.owner.phone||'';
  const prev=document.getElementById('owner-preview-avatar');
  if(prev){ prev.style.background=State.owner.avatarColor; prev.textContent=State.owner.name.charAt(0); }
  renderOwnerAvatarPicker();

  // 직원 로그인 시에만 비밀번호 변경 섹션 표시
  const pwSection = document.getElementById('my-pw-change-section');
  if(pwSection){
    const isStaff = (State.loginRole === 'member') && !!State.loginMember;
    pwSection.style.display = isStaff ? 'block' : 'none';
    // 비밀번호 입력 필드 초기화
    const cur  = document.getElementById('my-current-pw');
    const nw   = document.getElementById('my-new-pw');
    const conf = document.getElementById('my-new-pw-confirm');
    if(cur)  cur.value  = '';
    if(nw)   nw.value   = '';
    if(conf) conf.value = '';
  }
}

/* 직원 본인 비밀번호 변경 */
async function changeMyPassword() {
  const member = State.loginMember;
  if(!member){ toast('로그인 정보를 찾을 수 없습니다.','error'); return; }

  const currentPw = (document.getElementById('my-current-pw')?.value || '').trim();
  const newPw     = (document.getElementById('my-new-pw')?.value     || '').trim();
  const confirmPw = (document.getElementById('my-new-pw-confirm')?.value || '').trim();

  if(!currentPw){ toast('현재 비밀번호를 입력하세요.','error'); return; }
  if(member.login_pw !== currentPw){ toast('현재 비밀번호가 올바르지 않습니다.','error'); return; }
  if(!newPw || newPw.length < 4){ toast('새 비밀번호는 4자 이상 입력하세요.','error'); return; }
  if(newPw !== confirmPw){ toast('새 비밀번호가 일치하지 않습니다.','error'); return; }
  if(newPw === currentPw){ toast('새 비밀번호가 현재 비밀번호와 동일합니다.','error'); return; }

  try {
    await api.patch('members', member.id, { login_pw: newPw });
    State.loginMember.login_pw = newPw;
    // 로컬 members 배열도 갱신
    const idx = State.members ? State.members.findIndex(m=>m.id===member.id) : -1;
    if(idx > -1) State.members[idx].login_pw = newPw;
    // 입력 필드 초기화
    document.getElementById('my-current-pw').value  = '';
    document.getElementById('my-new-pw').value      = '';
    document.getElementById('my-new-pw-confirm').value = '';
    toast('비밀번호가 성공적으로 변경되었습니다! 🔐','success');
  } catch(e){
    toast('비밀번호 변경 중 오류가 발생했습니다.','error');
  }
}

/* 비밀번호 표시/숨기기 토글 (프로필 모달용) */
function togglePwVisibility(inputId, btn){
  const input = document.getElementById(inputId);
  if(!input) return;
  if(input.type === 'password'){
    input.type = 'text';
    if(btn) btn.innerHTML = '<i class="fas fa-eye-slash"></i>';
  } else {
    input.type = 'password';
    if(btn) btn.innerHTML = '<i class="fas fa-eye"></i>';
  }
}

/* 오너 프로필 저장 — 서버 DB (app_settings) 저장으로 모든 기기 동기화 */
async function saveOwner() {
  const name = document.getElementById('owner-name').value.trim();
  if(!name){ toast('이름을 입력하세요.','error'); return; }
  State.owner.name  = name;
  State.owner.role  = document.getElementById('owner-role-input').value.trim() || '오너';
  State.owner.email = document.getElementById('owner-email').value.trim();
  State.owner.dept  = document.getElementById('owner-dept-input').value.trim();
  State.owner.phone = document.getElementById('owner-phone').value.trim();

  // 사이드바 즉시 업데이트
  _applyOwnerToUI();

  // m1 멤버 업데이트
  const m1 = getMember(State.owner.id);
  if(m1){ m1.name = State.owner.name; m1.avatar_color = State.owner.avatarColor; }

  // 대시보드 인사말
  const greet = document.getElementById('dash-greeting');
  if(greet) greet.textContent = `안녕하세요, ${State.owner.name} 님 👋`;

  closeModal('modal-owner-edit');
  toast('프로필이 수정되었습니다! ✨', 'success');

  // 서버에 저장 (백그라운드) — 실패해도 로컬은 반영됨
  try {
    const recId = State.owner._settingsId || 'owner';
    await fetch(`tables/app_settings/${recId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name:         State.owner.name,
        role:         State.owner.role,
        email:        State.owner.email,
        dept:         State.owner.dept,
        phone:        State.owner.phone,
        avatar_color: State.owner.avatarColor,
      }),
    });
  } catch(e) {
    console.warn('[ECLADO] owner 서버 저장 실패:', e);
    // 폴백: localStorage에도 저장
    try { localStorage.setItem('eclado_owner', JSON.stringify(State.owner)); } catch(_) {}
  }
}

/* 앱 시작 시 서버에서 오너 프로필 로드 */
async function loadOwnerFromStorage() {
  // 1) 서버에서 로드 시도
  try {
    const res = await fetch('tables/app_settings?limit=10');
    const data = await res.json();
    const rows = data.data || [];
    const rec = rows.find(r => r.id === 'owner') || rows[0];
    if (rec && rec.name) {
      State.owner.name        = rec.name;
      State.owner.role        = rec.role  || State.owner.role;
      State.owner.email       = rec.email || State.owner.email;
      State.owner.dept        = rec.dept  || State.owner.dept;
      State.owner.phone       = rec.phone || '';
      State.owner.avatarColor = rec.avatar_color || State.owner.avatarColor;
      State.owner._settingsId = rec.id;
      // 구버전 localStorage 제거
      try { localStorage.removeItem('eclado_owner'); } catch(_) {}
      _applyOwnerToUI();
      return;
    }
  } catch(e) {
    console.warn('[ECLADO] owner 서버 로드 실패, localStorage 폴백:', e);
  }
  // 2) 폴백: localStorage
  try {
    const saved = localStorage.getItem('eclado_owner');
    if(saved) { const o = JSON.parse(saved); Object.assign(State.owner, o); }
  } catch(e) {}
  _applyOwnerToUI();
}

/* 사이드바/UI에 오너 정보 반영 */
function _applyOwnerToUI() {
  const nameEl = document.getElementById('sidebar-owner-name');
  const roleEl = document.getElementById('sidebar-owner-role');
  const avEl   = document.getElementById('sidebar-avatar');
  if(nameEl) nameEl.textContent = State.owner.name;
  if(roleEl) roleEl.textContent = State.owner.role;
  if(avEl)   { avEl.textContent = State.owner.name.charAt(0); avEl.style.background = State.owner.avatarColor; }
}

/* ============================================================  MODAL / SIDEBAR  ============================================================ */
function openModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('open');
  // body scroll lock — login-open 클래스와 독립적으로 관리
  document.body.classList.add('modal-open');
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('open');
  // 열려있는 모달이 없을 때만 scroll lock 해제
  const anyOpen = document.querySelector('.modal-overlay.open');
  if (!anyOpen) document.body.classList.remove('modal-open');
}
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebar-overlay').classList.add('open');
  if (window.innerWidth <= 768) document.body.classList.add('sidebar-open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
  document.body.classList.remove('sidebar-open');
}

/* ============================================================  BIND EVENTS  ============================================================ */
function bindEvents() {
  // 네비게이션
  document.querySelectorAll('.nav-item').forEach(item=>item.addEventListener('click',()=>showPage(item.dataset.page)));
  // 모바일 사이드바
  document.getElementById('sidebar-toggle').addEventListener('click',openSidebar);
  document.getElementById('sidebar-overlay').addEventListener('click',closeSidebar);
  // 모달 닫기
  document.querySelectorAll('.modal-close,[data-modal]').forEach(btn=>btn.addEventListener('click',()=>closeModal(btn.dataset.modal||btn.closest('.modal-overlay')?.id)));
  document.querySelectorAll('.modal-overlay').forEach(ov=>ov.addEventListener('click',e=>{ if(e.target===ov) closeModal(ov.id); }));
  document.addEventListener('keydown',e=>{ if(e.key==='Escape') document.querySelectorAll('.modal-overlay.open').forEach(m=>closeModal(m.id)); });

  // 프로젝트
  document.getElementById('btn-new-project').addEventListener('click', openNewProjectModal);
  document.getElementById('btn-new-project-2').addEventListener('click', openNewProjectModal);
  document.getElementById('btn-save-project').addEventListener('click', saveProject);
  // 파일 드롭존 초기화 (모달 열릴 때)
  document.getElementById('modal-project-detail').addEventListener('click', e=>{
    if(e.target === document.getElementById('modal-project-detail')) return;
  });
  // 파일 드롭존 초기화
  setTimeout(initProjFileDrop, 500);
  document.getElementById('project-search').addEventListener('input',renderProjects);
  document.querySelectorAll('.filter-btn').forEach(btn=>btn.addEventListener('click',()=>{
    document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active'); State.projectFilter=btn.dataset.filter; renderProjects();
  }));
  document.getElementById('view-grid').addEventListener('click',()=>{ document.getElementById('projects-grid').classList.remove('list-view'); document.getElementById('view-grid').classList.add('active'); document.getElementById('view-list').classList.remove('active'); });
  document.getElementById('view-list').addEventListener('click',()=>{ document.getElementById('projects-grid').classList.add('list-view'); document.getElementById('view-list').classList.add('active'); document.getElementById('view-grid').classList.remove('active'); });

  // 작업
  document.getElementById('btn-new-task').addEventListener('click',()=>{ resetTaskForm(); populateTaskModal(); openModal('modal-task'); setTimeout(initTaskAttachDrop,80); });
  document.getElementById('btn-save-task').addEventListener('click',saveTask);
  document.querySelectorAll('.btn-add-card').forEach(btn=>btn.addEventListener('click',()=>{ resetTaskForm(); populateTaskModal(); document.getElementById('task-status').value=btn.dataset.status; openModal('modal-task'); setTimeout(initTaskAttachDrop,80); }));
  document.getElementById('kanban-project-filter').addEventListener('change',e=>{ State.taskProjectFilter=e.target.value; renderKanban(); });
  document.getElementById('btn-send-comment').addEventListener('click',sendComment);
  document.getElementById('comment-input').addEventListener('keydown',e=>{ if(e.key==='Enter') sendComment(); });

  // 두레이 메신저 단축키: Ctrl+Enter 전송
  document.addEventListener('keydown', e => {
    const msgInput = document.getElementById('dooray-msg-input');
    if(msgInput && document.activeElement===msgInput) {
      if(e.key==='Enter' && (e.ctrlKey||e.metaKey)) {
        e.preventDefault();
        dooraySendComment();
      }
    }
  });

  // 부서
  document.getElementById('btn-new-dept').addEventListener('click',()=>{ document.getElementById('modal-dept-title').textContent='부서 등록'; ['dept-id','dept-name','dept-code','dept-desc'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';}); renderDeptColorRow('#1B3A6B'); openModal('modal-dept'); });
  document.getElementById('btn-save-dept').addEventListener('click',saveDept);

  // 팀원
  document.getElementById('btn-invite-member').addEventListener('click',()=>{
  // 신규 등록 모드 초기화
  document.getElementById('modal-member-title').textContent = '팀원 초대';
  document.getElementById('member-edit-id').value = '';
  ['member-name','member-email','member-login-pw','member-position'].forEach(id=>{ const el=document.getElementById(id); if(el){ el.value=''; el.placeholder=el.id==='member-login-pw'?'직원이 사용할 비밀번호 (4자 이상)':el.placeholder; } });
  populateMemberDeptSelect();
  openModal('modal-member');
});
  document.getElementById('btn-save-member').addEventListener('click',saveMember);
  document.getElementById('member-search').addEventListener('input',renderMembers);
  document.getElementById('member-dept-filter').addEventListener('change',renderMembers);

  // 캘린더
  document.getElementById('btn-prev-month').addEventListener('click',()=>{ State.calendarMonth--; if(State.calendarMonth<0){State.calendarMonth=11;State.calendarYear--;} renderCalendar(); });
  document.getElementById('btn-next-month').addEventListener('click',()=>{ State.calendarMonth++; if(State.calendarMonth>11){State.calendarMonth=0;State.calendarYear++;} renderCalendar(); });
  document.getElementById('btn-new-cal-event').addEventListener('click', openNewCalEvent);

  // 메신저
  document.getElementById('btn-new-room').addEventListener('click',()=>{
    // 모달 초기화
    window._nrSelectedMembers = new Set();
    window._inviteTargetRoomId = null;
    const titleEl=document.getElementById('new-room-modal-title');
    if(titleEl) titleEl.innerHTML=`<i class="fas fa-comments" style="color:var(--primary);margin-right:8px"></i>새 대화 시작`;
    const btn=document.getElementById('btn-create-room');
    if(btn){ btn.innerHTML='<i class="fas fa-plus"></i> 대화 시작'; btn.onclick=createRoom; }
    const nameInp=document.getElementById('new-room-name'); if(nameInp) nameInp.value='';
    const searchInp=document.getElementById('room-member-search'); if(searchInp) searchInp.value='';
    const picker=document.getElementById('nr-icon-picker'); if(picker) picker.style.display='none';
    switchRoomTab('dm');
    openModal('modal-new-room');
  });
  document.getElementById('btn-send-msg').addEventListener('click',sendMessage);
  document.getElementById('chat-input-rich').addEventListener('keydown',e=>{
    if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); sendMessage(); }
  });
  // 전역 클릭: 컬러 피커 닫기
  document.addEventListener('click', _closeAllColorPickers);
  document.getElementById('btn-create-room').addEventListener('click',createRoom);
  document.getElementById('room-search').addEventListener('input',renderMessenger);
  // 이모지 피커 이벤트 위임
  const iconGrid=document.querySelector('.nr-icon-grid');
  if(iconGrid) iconGrid.addEventListener('click',e=>{
    const text=e.target.textContent?.trim();
    if(text && /\p{Emoji}/u.test(text)) selectRoomIcon(text);
  });
  // 스레드 모달 Enter 전송
  const mthInput = document.getElementById('mth-reply-input');
  if(mthInput) mthInput.addEventListener('keydown', e=>{
    if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); addThreadReply(); }
  });

  // 이메일
  document.getElementById('btn-compose').addEventListener('click',()=>{ populateComposeModal(); openModal('modal-compose'); });
  document.getElementById('btn-send-email').addEventListener('click',()=>sendEmail(false));
  document.getElementById('btn-save-draft').addEventListener('click',()=>sendEmail(true));
  document.querySelectorAll('.email-folder').forEach(el=>el.addEventListener('click',()=>{
    document.querySelectorAll('.email-folder').forEach(f=>f.classList.remove('active'));
    el.classList.add('active'); State.emailFolder=el.dataset.folder; State.currentEmailId=null;
    document.getElementById('email-detail-empty').style.display='flex';
    document.getElementById('email-detail-content').style.display='none';
    renderEmailList();
  }));
  document.getElementById('email-search').addEventListener('input',renderEmailList);

  // 오너 프로필
  document.getElementById('my-profile').addEventListener('click',()=>{ openOwnerEdit(); openModal('modal-owner-edit'); });
  document.getElementById('btn-save-owner').addEventListener('click',saveOwner);

  // 연차관리
  initLeaveLock();
  const btnAddLeave = document.getElementById('btn-add-leave-record');
  if (btnAddLeave) btnAddLeave.addEventListener('click', openLeaveRecordAdd);
  const btnLockAgain = document.getElementById('btn-leave-lock-again');
  if (btnLockAgain) btnLockAgain.addEventListener('click', lockLeave);
  const btnSaveLeaveRec = document.getElementById('btn-save-leave-record');
  if (btnSaveLeaveRec) btnSaveLeaveRec.addEventListener('click', saveLeaveRecord);
  const btnAutoCalc = document.getElementById('btn-auto-calc');
  if (btnAutoCalc) btnAutoCalc.addEventListener('click', autoCalcLeave);
  // 셀 클릭 모달 — 새 기록 추가 버튼 (기본)
  const btnLxCellSave = document.getElementById('btn-lx-cell-save');
  if (btnLxCellSave) {
    btnLxCellSave.dataset.mode = 'add';
    btnLxCellSave.addEventListener('click', function() {
      if (this.dataset.mode === 'add') saveLxCellUsage();
      // edit 모드는 openLxUsageEditInline에서 onclick으로 처리
    });
  }
  // 셀 모달 — 잔여 미리보기 갱신 (수동 입력)
  const lxDays = document.getElementById('lx-days');
  if (lxDays) lxDays.addEventListener('input', () => {
    _updateLxRemainPreview(document.getElementById('lx-record-id').value, null);
    const hintEl = document.getElementById('lx-days-hint');
    if (hintEl) hintEl.textContent = ''; // 수동 입력 시 힌트 제거
  });
  // 셀 모달 — 유형 변경 시 일수 자동 재계산 (반차=0.5일)
  const lxType = document.getElementById('lx-type');
  if (lxType) lxType.addEventListener('change', autoCalcLxDays);
  // 연차 검색/필터
  const leaveSearch = document.getElementById('leave-search');
  if (leaveSearch) leaveSearch.addEventListener('input', renderLeaveExcelTable);
  const leaveDeptF = document.getElementById('leave-dept-filter');
  if (leaveDeptF) leaveDeptF.addEventListener('change', renderLeaveExcelTable);
  const leaveStatusF = document.getElementById('leave-status-filter');
  if (leaveStatusF) leaveStatusF.addEventListener('change', renderLeaveExcelTable);
  const leaveYearSel = document.getElementById('leave-year-select');
  if (leaveYearSel) leaveYearSel.addEventListener('change', e => {
    LeaveState.currentYear = parseInt(e.target.value);
    renderLeaveStats(); renderLeaveExcelTable();
  });
  // 연차 비밀번호 변경
  const leavePwForm = document.getElementById('leave-pw-form');
  if (leavePwForm) leavePwForm.addEventListener('submit', e => { e.preventDefault(); saveLeavePassword_fn(); });
  const btnSaveLeavePw = document.getElementById('btn-save-leave-pw');
  if (btnSaveLeavePw) btnSaveLeavePw.addEventListener('click', saveLeavePassword_fn);
  // 모달 닫힐 때 버튼 원상복구
  const lxModal = document.getElementById('modal-lx-cell');
  if (lxModal) {
    const resetLxBtn = () => {
      const btn = document.getElementById('btn-lx-cell-save');
      if (btn) {
        btn.innerHTML = '<i class="fas fa-plus"></i> 추가';
        btn.dataset.mode = 'add';
        btn.onclick = null;
      }
    };
    lxModal.addEventListener('click', e => { if (e.target === lxModal) resetLxBtn(); });
    document.querySelectorAll('[data-modal="modal-lx-cell"], #modal-lx-cell .modal-close').forEach(el =>
      el.addEventListener('click', resetLxBtn));
  }

  // 팀원 수정
  const btnSaveMemberEdit = document.getElementById('btn-save-member-edit');
  if (btnSaveMemberEdit) btnSaveMemberEdit.addEventListener('click', saveMemberEdit);

  // 작업 모달 파일 첨부
  const btnTaskAttach = document.getElementById('task-attach-zone');
  if(btnTaskAttach) { initTaskAttachDrop(); }
  // 작업 댓글 파일 첨부
  const btnCommentAttach = document.getElementById('btn-task-comment-attach');
  if(btnCommentAttach) btnCommentAttach.addEventListener('click', ()=>document.getElementById('task-comment-file')?.click());
  const taskCommentFile = document.getElementById('task-comment-file');
  if(taskCommentFile) taskCommentFile.addEventListener('change', handleTaskCommentFile);
  // 채팅 파일 첨부
  const btnChatAttach = document.getElementById('btn-chat-attach');
  if(btnChatAttach) btnChatAttach.addEventListener('click', ()=>document.getElementById('chat-file-input')?.click());
  const chatFileInput = document.getElementById('chat-file-input');
  if(chatFileInput) chatFileInput.addEventListener('change', handleChatFileSelect);

  // 관리자 비밀번호 변경
  const adminPwForm = document.getElementById('admin-pw-form');
  if (adminPwForm) adminPwForm.addEventListener('submit', e => { e.preventDefault(); saveAdminPassword(); });
  const btnSaveAdminPw = document.getElementById('btn-save-admin-pw');
  if (btnSaveAdminPw) btnSaveAdminPw.addEventListener('click', saveAdminPassword);

  // ─── 클라우드 저장소 ───
  const cloudInput = document.getElementById('cloud-file-input');
  if (cloudInput) cloudInput.addEventListener('change', e => handleCloudUpload(e.target.files));
  const cloudSearch = document.getElementById('cloud-search-input');
  if (cloudSearch) cloudSearch.addEventListener('input', e => { _cloudSearch = e.target.value; renderCloudFiles(); });
  const cloudCat = document.getElementById('cloud-cat-filter');
  if (cloudCat) cloudCat.addEventListener('change', e => { _cloudCategory = e.target.value; renderCloudFiles(); });
  document.querySelectorAll('.cloud-view-btn').forEach(btn => {
    btn.addEventListener('click', () => setCloudView(btn.dataset.view));
  });

  // ─── 개인 프로젝트 ───
  const btnAddPersonal = document.getElementById('btn-add-personal');
  if (btnAddPersonal) btnAddPersonal.addEventListener('click', () => openPersonalProjectModal(null));
  const btnSavePersonal = document.getElementById('btn-save-personal-project');
  if (btnSavePersonal) btnSavePersonal.addEventListener('click', savePersonalProject);
  const btnPersonalPwChange = document.getElementById('btn-personal-pw-change');
  if (btnPersonalPwChange) btnPersonalPwChange.addEventListener('click', openPersonalPwChangeModal);
  const btnLockPersonal = document.getElementById('btn-lock-personal');
  if (btnLockPersonal) btnLockPersonal.addEventListener('click', lockPersonal);
  const btnPersonalUnlock = document.getElementById('btn-personal-unlock');
  if (btnPersonalUnlock) btnPersonalUnlock.addEventListener('click', unlockPersonal);
  const personalPwInput = document.getElementById('personal-pw-input');
  if (personalPwInput) personalPwInput.addEventListener('keydown', e => { if (e.key === 'Enter') unlockPersonal(); });
  const btnSavePersonalPw = document.getElementById('btn-save-personal-pw');
  if (btnSavePersonalPw) btnSavePersonalPw.addEventListener('click', savePersonalPwChange);
  const btnResetPersonalPw = document.getElementById('btn-reset-personal-pw');
  if (btnResetPersonalPw) btnResetPersonalPw.addEventListener('click', resetPersonalPw);
  const ppFileInput = document.getElementById('pp-file-input');
  if (ppFileInput) ppFileInput.addEventListener('change', handlePPFileSelect);
  const ppProgressInput = document.getElementById('pp-progress');
  if (ppProgressInput) ppProgressInput.addEventListener('input', e => {
    const el = document.getElementById('pp-progress-val');
    if (el) el.textContent = e.target.value + '%';
  });
  const personalSearch = document.getElementById('personal-search-input');
  if (personalSearch) personalSearch.addEventListener('input', e => { _personalSearch = e.target.value; renderPersonalProjects(); });
  const personalStatusFilter = document.getElementById('personal-status-filter');
  if (personalStatusFilter) personalStatusFilter.addEventListener('change', e => { _personalStatusFilter = e.target.value; renderPersonalProjects(); });
}

/* ============================================================
   유틸: Promise 기반 FileReader (readFileAsDataUrl)
   ============================================================ */
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result);
    reader.onerror = e => reject(new Error('파일 읽기 실패: ' + file.name));
    reader.readAsDataURL(file);
  });
}

/* ============================================================
   유틸: 이미지 Canvas 압축 (API 크기 제한 대응)
   - 이미지: 최대 800px, JPEG quality 0.72 → Base64 < 500KB 목표
   - PNG → 흰 배경 + JPEG 변환 (PNG는 압축률 낮아 JPEG 필수)
   - 동영상/문서: 압축 없이 원본 dataUrl 반환
   - 단계적 압축: 결과가 여전히 크면 quality/크기 재시도
   ============================================================ */
async function compressFileForUpload(file) {
  // 동영상 · 문서는 압축 불가 → readFileAsDataUrl로 원본 그대로
  if (!file.type.startsWith('image/')) {
    return readFileAsDataUrl(file);
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('파일 읽기 실패: ' + file.name));
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = () => reject(new Error('이미지 로드 실패: ' + file.name));
      img.onload = () => {
        try {
          // ── 1단계: 800px 리사이즈 + quality 0.72 ──
          function doCompress(maxDim, quality) {
            let { width, height } = img;
            if (width > maxDim || height > maxDim) {
              if (width >= height) {
                height = Math.round(height * maxDim / width);
                width  = maxDim;
              } else {
                width  = Math.round(width * maxDim / height);
                height = maxDim;
              }
            }
            // 흰 배경 캔버스 (PNG 투명도 처리 + 모든 타입 JPEG 변환)
            const c = document.createElement('canvas');
            c.width = width; c.height = height;
            const ctx = c.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            return c.toDataURL('image/jpeg', quality);
          }

          // 1차 압축: 800px, quality 0.72
          let result = doCompress(800, 0.72);

          // 2차 압축: 결과 Base64가 600KB 초과 시 → 600px, quality 0.65
          const KB = result.length * 0.75 / 1024; // Base64 → 실제 바이트 추정
          if (KB > 600) {
            result = doCompress(600, 0.65);
          }

          // 3차 압축: 여전히 400KB 초과 시 → 450px, quality 0.58
          const KB2 = result.length * 0.75 / 1024;
          if (KB2 > 400) {
            result = doCompress(450, 0.58);
          }

          resolve(result);
        } catch(e) {
          // Canvas 실패 시 원본 dataUrl 사용 (최후 수단)
          resolve(ev.target.result);
        }
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ============================================================
   유틸: Base64 dataUrl → 실제 파일 다운로드
   ============================================================ */
function downloadFromDataUrl(dataUrl, fileName) {
  try {
    const a = document.createElement('a');
    a.href     = dataUrl;
    a.download = fileName || '파일';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => document.body.removeChild(a), 300);
  } catch(e) {
    toast('다운로드에 실패했습니다.', 'error');
  }
}

/* ============================================================  FILE UPLOAD — 작업 첨부  ============================================================ */

function handleTaskFileSelect(event) {
  const files = Array.from(event.target.files||[]);
  files.forEach(async file => {
    if(file.size > 100*1024*1024){ toast(`${file.name}: 100MB 초과 파일은 첨부할 수 없습니다.`,'error'); return; }
    if(file.size > 2*1024*1024) toast(`⏳ "${file.name}" 압축 중...`,'info');
    try {
      const dataUrl = await compressFileForUpload(file);
      _taskPendingFiles.push({ file, dataUrl });
      addTaskAttachThumb(file, dataUrl, _taskPendingFiles.length-1);
    } catch(e) {
      toast(`❌ "${file.name}" 읽기 실패`, 'error');
    }
  });
  event.target.value = '';
}

function addTaskAttachThumb(file, dataUrl, idx) {
  const prev = document.getElementById('task-attach-preview'); if(!prev) return;
  const div = document.createElement('div');
  const isImg = file.type.startsWith('image/');
  const isVid = file.type.startsWith('video/');
  div.className = 'task-attach-thumb' + (isImg ? ' thumb-image' : isVid ? ' thumb-video' : ' thumb-doc');
  div.dataset.idx = idx;

  // 파일 크기 표시
  const sizeLabel = `<div class="thumb-size-label">${fmtSize(file.size)}</div>`;

  if(isImg) {
    div.innerHTML = `
      <img src="${dataUrl}" alt="${escHtml(file.name)}" title="${escHtml(file.name)}">
      <div class="thumb-overlay">
        <div class="thumb-name">${escHtml(file.name)}</div>
        ${sizeLabel}
      </div>
      <button class="attach-remove-btn" onclick="removeTaskAttach(${idx})" title="제거">×</button>
      <div class="thumb-type-badge thumb-badge-img"><i class="fas fa-image"></i> 사진</div>`;
  } else if(isVid) {
    div.innerHTML = `
      <video src="${dataUrl}" muted title="${escHtml(file.name)}"></video>
      <div class="thumb-overlay">
        <i class="fas fa-play-circle" style="font-size:22px;color:rgba(255,255,255,.9)"></i>
        <div class="thumb-name">${escHtml(file.name)}</div>
        ${sizeLabel}
      </div>
      <button class="attach-remove-btn" onclick="removeTaskAttach(${idx})" title="제거">×</button>
      <div class="thumb-type-badge thumb-badge-vid"><i class="fas fa-video"></i> 동영상</div>`;
  } else {
    const icon = getFileIcon(file.type);
    const ext  = file.name.split('.').pop().toUpperCase();
    div.innerHTML = `
      <div class="task-attach-file-icon">
        <i class="fas ${icon}"></i>
        <div class="thumb-ext-badge">${ext}</div>
      </div>
      <div class="thumb-doc-name" title="${escHtml(file.name)}">${escHtml(file.name)}</div>
      ${sizeLabel}
      <button class="attach-remove-btn" onclick="removeTaskAttach(${idx})" title="제거">×</button>
      <div class="thumb-type-badge thumb-badge-doc"><i class="fas fa-file"></i> 문서</div>`;
  }
  prev.appendChild(div);
}

function removeTaskAttach(idx) {
  _taskPendingFiles.splice(idx, 1);
  // 미리보기 전체 재렌더
  const prev = document.getElementById('task-attach-preview'); if(!prev) return;
  prev.innerHTML = '';
  _taskPendingFiles.forEach((f, i) => addTaskAttachThumb(f.file, f.dataUrl, i));
}

function initTaskAttachDrop() {
  const zone = document.getElementById('task-attach-zone'); if(!zone) return;
  // cloneNode로 기존 리스너 완전 제거 후 재등록 (중복 방지)
  const newZone = zone.cloneNode(true);
  zone.parentNode.replaceChild(newZone, zone);

  // 클릭 시 파일 선택 (버튼 클릭 이벤트 버블링 방지)
  newZone.addEventListener('click', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.closest('button'))) return;
    document.getElementById('task-file-input')?.click();
  });
  newZone.addEventListener('dragover', e=>{ e.preventDefault(); e.stopPropagation(); newZone.classList.add('drag-over'); });
  newZone.addEventListener('dragleave', e=>{ if(!newZone.contains(e.relatedTarget)) newZone.classList.remove('drag-over'); });
  newZone.addEventListener('drop', e=>{
    e.preventDefault(); e.stopPropagation(); newZone.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer.files||[]);
    files.forEach(async file=>{
      if(file.size>100*1024*1024){ toast(`${file.name}: 100MB 초과`,'error'); return; }
      if(file.size>2*1024*1024) toast(`⏳ "${file.name}" 압축 중...`,'info');
      try {
        const dataUrl = await compressFileForUpload(file);
        _taskPendingFiles.push({file,dataUrl});
        addTaskAttachThumb(file,dataUrl,_taskPendingFiles.length-1);
      } catch(err) { toast(`❌ "${file.name}" 읽기 실패`,'error'); }
    });
  });
}

async function uploadTaskAttachments(taskId) {
  const files = [..._taskPendingFiles]; // 복사 후 진행
  _taskPendingFiles = [];               // 즉시 초기화 (중복 방지)
  let ok = 0, fail = 0;
  for (const f of files) {
    const payload = {
      id:           genId(),
      task_id:      taskId,
      file_name:    f.file.name,
      file_type:    f.file.type || 'application/octet-stream',
      file_size:    f.file.size,
      data_url:     f.dataUrl,
      uploader_id:  State.owner.id   || 'm1',
      uploader_name: State.owner.name || '—',
    };
    try {
      const r = await api.post('task_attachments', payload);
      if (!r || r.error) throw new Error(r?.error || '저장 실패');
      ok++;
    } catch(e) {
      console.error('작업 첨부 업로드 실패:', f.file.name, e);
      fail++;
      toast(`❌ "${f.file.name}" 업로드 실패`, 'error');
    }
  }
  if (ok > 0 && files.length > 1) toast(`📎 첨부파일 ${ok}개 업로드 완료`, 'success');
}

/* ── 작업 상세 드롭존 클릭 핸들러 (global input 사용 — 충돌 완전 차단) ── */
function _taskDetailDropZoneClick(e, taskId) {
  e.preventDefault();
  e.stopPropagation();
  const inp = document.getElementById('task-detail-file-input-global');
  if (!inp) return;

  // 이전 onChange 리스너 제거 후 새로 등록 (메모리 누수 방지)
  const newInp = inp.cloneNode(true);
  inp.parentNode.replaceChild(newInp, inp);

  newInp.onchange = function(ev) {
    const files = Array.from(ev.target.files || []);
    if (!files.length) return;
    uploadTaskDetailFiles(files, taskId);
    newInp.value = '';
  };
  newInp.click();
}

/* ── 작업 상세 첨부파일 탭 드롭존 초기화 ── */
function initTaskDetailDrop(taskId) {
  const zone = document.getElementById('task-detail-drop-zone');
  if (!zone || zone._detailDropInited) return;
  zone._detailDropInited = true;

  zone.addEventListener('dragover', e => {
    e.preventDefault(); e.stopPropagation();
    zone.classList.add('drag-over');
  });
  zone.addEventListener('dragleave', e => {
    e.stopPropagation();
    // 자식 요소로 이동할 때 drag-over 유지
    if (!zone.contains(e.relatedTarget)) zone.classList.remove('drag-over');
  });
  zone.addEventListener('drop', e => {
    e.preventDefault(); e.stopPropagation();
    zone.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer.files || []);
    if (!files.length) return;
    uploadTaskDetailFiles(files, taskId);
  });
}

/* ── 작업 상세 탭에서 파일 선택 핸들러 (legacy — 미사용, 호환성 유지) ── */
function handleTaskDetailFileSelect(event, taskId) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;
  uploadTaskDetailFiles(files, taskId);
  event.target.value = '';
}

/* ── 작업 상세 탭 파일 업로드 실행 ── */
async function uploadTaskDetailFiles(files, taskId) {
  const zone = document.getElementById('task-detail-drop-zone');
  if (zone) zone.classList.add('uploading');

  let ok = 0, fail = 0;
  for (const file of files) {
    if (file.size > 100 * 1024 * 1024) {
      toast(`⚠️ "${file.name}": 100MB 초과 파일은 첨부할 수 없습니다.`, 'error');
      fail++;
      continue;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast(`⏳ "${file.name}" (${fmtSize(file.size)}) 변환 중...`, 'info');
    }
    try {
      const dataUrl = await compressFileForUpload(file);
      const payload = {
        id:            genId(),
        task_id:       taskId,
        file_name:     file.name,
        file_type:     file.type || 'application/octet-stream',
        file_size:     file.size,
        data_url:      dataUrl,
        uploader_id:   State.owner.id   || 'm1',
        uploader_name: State.owner.name || '—',
      };
      const r = await api.post('task_attachments', payload);
      if (!r || r.error) throw new Error(r?.error || '저장 실패');
      ok++;
    } catch(e) {
      console.error('작업 첨부 업로드 실패:', file.name, e);
      fail++;
      toast(`❌ "${file.name}" 업로드 실패 — ${e.message||'오류'}`, 'error');
    }
  }

  if (zone) zone.classList.remove('uploading');

  if (ok > 0) {
    toast(ok === 1 ? `✅ 파일이 업로드되었습니다.` : `✅ 파일 ${ok}개 업로드 완료!`, 'success');
    await loadAndRenderTaskFiles(taskId);
  }
  if (fail > 0 && ok === 0) {
    toast(`❌ 업로드에 실패했습니다.`, 'error');
  }
}

async function loadAndRenderTaskFiles(taskId) {
  const box = document.getElementById('task-detail-file-list'); if(!box) return;
  box.innerHTML = '<p style="color:var(--text-muted);font-size:13px;padding:12px 0"><i class="fas fa-spinner fa-spin" style="margin-right:6px"></i>불러오는 중...</p>';
  try {
    const res = await fetch(`tables/task_attachments?limit=100`);
    const text = await res.text();
    let json = {};
    try { json = JSON.parse(text); } catch(pe) { json = { data: [] }; }
    const files = (json.data||[]).filter(f=>f.task_id===taskId).sort((a,b)=>(b.created_at||0)-(a.created_at||0));
    if(!files.length){
      box.innerHTML='<div class="tfl-empty"><i class="fas fa-paperclip"></i><div>첨부파일이 없습니다.</div><small>위 업로드 영역에서 파일을 추가하세요.</small></div>';
      return;
    }

    // 이미지와 비이미지 파일을 분리
    const imgFiles = files.filter(f=>{const ft=f.file_type||'';return (ft.startsWith('image/')||ft==='image')&&f.data_url;});
    const otherFiles = files.filter(f=>{const ft=f.file_type||'';return !((ft.startsWith('image/')||ft==='image')&&f.data_url);});

    // 라이트박스 오픈 시 현재 이미지 인덱스 저장용
    const imgUrls = imgFiles.map(f=>f.data_url);
    const imgNames = imgFiles.map(f=>f.file_name||'파일');
    // 전역 저장 (라이트박스 네비게이션용)
    window._taskLightboxImages = imgUrls;
    window._taskLightboxNames = imgNames;

    let html = `<div class="task-files-header"><i class="fas fa-paperclip"></i> 첨부파일 ${files.length}개</div>`;

    // ── 이미지 카드 그리드 ──
    if(imgFiles.length){
      html += `<div class="tfl-img-grid">`;
      html += imgFiles.map((f,i)=>{
        const safeUrl = f.data_url;
        const safeName = escHtml(f.file_name||'파일');
        const timeStr = f.created_at ? relTime(f.created_at) : '';
        let cmtCount = 0;
        try { cmtCount = JSON.parse(f.file_comments||'[]').length; } catch(e){}
        const cmtBadge = cmtCount > 0 ? `<span class="file-cmt-badge">${cmtCount}</span>` : '';
        return `<div class="tfl-img-card" onclick="openTaskLightbox(${i})">
          <div class="tfl-img-wrap">
            <img src="${safeUrl}" alt="${safeName}" loading="lazy">
            <div class="tfl-img-overlay">
              <i class="fas fa-search-plus"></i>
              <span>크게 보기</span>
            </div>
          </div>
          <div class="tfl-img-footer">
            <span class="tfl-img-name" title="${safeName}">${safeName}</span>
            <div class="tfl-img-meta">${fmtSize(f.file_size||0)}${timeStr?` · ${timeStr}`:''}</div>
            <div class="tfl-img-btns">
              <button class="tfl-dl-btn" onclick="event.stopPropagation();downloadFromDataUrl('${safeUrl}','${safeName}')" title="다운로드"><i class="fas fa-download"></i></button>
              <button class="tfl-cmt-btn" onclick="event.stopPropagation();openFileDetailModal('task_attachments','${f.id}','${taskId}')" title="수정/댓글"><i class="fas fa-comment-alt"></i>${cmtBadge}</button>
              <button class="tfl-del-btn" onclick="event.stopPropagation();deleteTaskFile('${f.id}','${taskId}')" title="삭제"><i class="fas fa-trash"></i></button>
            </div>
          </div>
        </div>`;
      }).join('');
      html += `</div>`;
    }

    // ── 비이미지 파일 목록 ──
    if(otherFiles.length){
      if(imgFiles.length) html += `<div class="tfl-section-label"><i class="fas fa-file"></i> 문서 · 영상</div>`;
      html += otherFiles.map(f=>{
        const ft = f.file_type||'';
        const isVid = ft.startsWith('video/') || ft === 'video';
        const icon  = isVid ? 'fa-file-video' : getFileIcon(ft || f.file_name||'');
        const typeLabel = isVid ? '동영상' : '문서';
        const typeCls   = isVid ? 'file-badge-vid' : 'file-badge-doc';
        const timeStr = f.created_at ? relTime(f.created_at) : '';

        let thumb = '';
        if(isVid && f.data_url){
          thumb = `<div class="tfl-vid-thumb"><video src="${f.data_url}" muted playsinline></video><i class="fas fa-play-circle tfl-play-icon"></i></div>`;
        } else {
          thumb = `<div class="tfl-doc-icon"><i class="fas ${icon}"></i></div>`;
        }

        const dlBtn = f.data_url
          ? `<button class="task-file-dl-btn" onclick="downloadFromDataUrl('${f.data_url}','${escHtml(f.file_name||'파일')}')" title="내려받기"><i class="fas fa-download"></i> 받기</button>`
          : '';
        let cmtCount2 = 0;
        try { cmtCount2 = JSON.parse(f.file_comments||'[]').length; } catch(e){}
        const cmtBadge2 = cmtCount2 > 0 ? `<span class="file-cmt-badge">${cmtCount2}</span>` : '';

        return `<div class="task-file-item">
          ${thumb}
          <div class="task-file-info">
            <div class="file-name" title="${escHtml(f.file_name||'')}">${escHtml(f.file_name||'파일')}</div>
            <div class="file-meta">
              <span class="file-type-badge ${typeCls}">${typeLabel}</span>
              ${fmtSize(f.file_size||0)}${f.uploader_name?` · ${escHtml(f.uploader_name)}`:''}${timeStr?` · ${timeStr}`:''}
            </div>
            ${f.file_desc ? `<div class="tfl-file-desc">${escHtml(f.file_desc)}</div>` : ''}
          </div>
          <div class="task-file-actions">
            ${dlBtn}
            <button class="task-file-cmt-btn" onclick="openFileDetailModal('task_attachments','${f.id}','${taskId}')" title="수정/댓글"><i class="fas fa-comment-alt"></i>${cmtBadge2}</button>
            <button class="task-file-del-btn" onclick="deleteTaskFile('${f.id}','${taskId}')" title="삭제"><i class="fas fa-trash"></i></button>
          </div>
        </div>`;
      }).join('');
    }

    box.innerHTML = html;
  } catch(e) {
    console.error('파일 목록 불러오기 실패:', e);
    box.innerHTML='<p style="color:var(--danger,#e53e3e);font-size:13px">불러오기 실패</p>';
  }
}

// 작업 파일 탭 전용 라이트박스 (이미지 슬라이드 + 다운로드)
function openTaskLightbox(idx) {
  const urls   = window._taskLightboxImages || [];
  const names  = window._taskLightboxNames  || [];
  if(!urls.length) return;
  let cur = idx;

  let ov = document.getElementById('task-lightbox-overlay');
  if(!ov){
    ov = document.createElement('div');
    ov.id = 'task-lightbox-overlay';
    ov.className = 'task-lightbox-overlay';
    ov.innerHTML = `
      <button class="tlb-close" id="tlb-close-btn"><i class="fas fa-times"></i></button>
      <button class="tlb-nav tlb-prev" id="tlb-prev-btn"><i class="fas fa-chevron-left"></i></button>
      <div class="tlb-img-wrap">
        <img id="tlb-main-img" src="" alt="">
        <div class="tlb-spinner" id="tlb-spinner"><i class="fas fa-spinner fa-spin"></i></div>
      </div>
      <button class="tlb-nav tlb-next" id="tlb-next-btn"><i class="fas fa-chevron-right"></i></button>
      <div class="tlb-bar">
        <span class="tlb-name" id="tlb-name"></span>
        <div class="tlb-bar-btns">
          <button class="tlb-dl-btn" id="tlb-dl-btn"><i class="fas fa-download"></i> 다운로드</button>
        </div>
        <span class="tlb-counter" id="tlb-counter"></span>
      </div>`;
    document.body.appendChild(ov);

    ov.addEventListener('click', e=>{ if(e.target===ov) closeTlb(); });
    document.getElementById('tlb-close-btn').addEventListener('click', closeTlb);
    document.getElementById('tlb-prev-btn').addEventListener('click', ()=>moveTlb(-1));
    document.getElementById('tlb-next-btn').addEventListener('click', ()=>moveTlb(1));
    document.getElementById('tlb-dl-btn').addEventListener('click', ()=>{
      downloadFromDataUrl(urls[cur], names[cur]||'파일');
    });
  }

  function renderTlb() {
    const img = document.getElementById('tlb-main-img');
    const spin = document.getElementById('tlb-spinner');
    const nameEl = document.getElementById('tlb-name');
    const cntEl = document.getElementById('tlb-counter');
    const prevBtn = document.getElementById('tlb-prev-btn');
    const nextBtn = document.getElementById('tlb-next-btn');

    if(spin) spin.style.display='flex';
    if(img){ img.style.opacity='0'; img.src = urls[cur]; img.onload = ()=>{ img.style.opacity='1'; if(spin) spin.style.display='none'; }; }
    if(nameEl) nameEl.textContent = names[cur]||'';
    if(cntEl)  cntEl.textContent  = `${cur+1} / ${urls.length}`;
    if(prevBtn) prevBtn.style.opacity = urls.length<=1 ? '0' : '';
    if(nextBtn) nextBtn.style.opacity = urls.length<=1 ? '0' : '';
  }

  function moveTlb(dir) {
    cur = (cur + dir + urls.length) % urls.length;
    renderTlb();
  }
  function closeTlb() {
    ov.style.display='none';
    document.removeEventListener('keydown', tlbKey);
  }
  function tlbKey(e) {
    if(e.key==='Escape') closeTlb();
    if(e.key==='ArrowLeft')  moveTlb(-1);
    if(e.key==='ArrowRight') moveTlb(1);
  }

  // 기존 키 핸들러 제거 후 재등록
  document.removeEventListener('keydown', ov._keyHandler);
  ov._keyHandler = tlbKey;
  document.addEventListener('keydown', tlbKey);

  ov.style.display = 'flex';
  renderTlb();
}

async function deleteTaskFile(fileId, taskId) {
  if(!confirm('첨부파일을 삭제하시겠습니까?')) return;
  try { await api.del('task_attachments', fileId); toast('파일이 삭제되었습니다.','success'); loadAndRenderTaskFiles(taskId); }
  catch(e){ toast('삭제 실패','error'); }
}

/* ── 댓글 파일 첨부 ── */
function handleTaskCommentFile(event) {
  const files = Array.from(event.target.files||[]);
  files.forEach(async file=>{
    if(file.size>100*1024*1024){ toast(`${file.name}: 100MB 초과`,'error'); return; }
    if(file.size>2*1024*1024) toast(`⏳ "${file.name}" 압축 중...`,'info');
    try {
      const dataUrl = await compressFileForUpload(file);
      _commentPendingFiles.push({file, dataUrl});
      renderCommentAttachPreview();
    } catch(e) { toast(`❌ "${file.name}" 읽기 실패`,'error'); }
  });
  event.target.value='';
}

function renderCommentAttachPreview() {
  const box=document.getElementById('comment-attach-preview'); if(!box) return;
  box.innerHTML = _commentPendingFiles.map((f,i)=>{
    const isImg=f.file.type.startsWith('image/');
    const thumb = isImg ? `<img src="${f.dataUrl}" style="width:24px;height:24px;object-fit:cover;border-radius:3px">` : '';
    return `<div class="comment-attach-chip">${thumb}<i class="fas ${getFileIcon(f.file.type)}"></i><span>${escHtml(f.file.name)}</span><button class="chip-remove" onclick="removeCommentAttach(${i})">×</button></div>`;
  }).join('');
}

function removeCommentAttach(idx) {
  _commentPendingFiles.splice(idx,1);
  renderCommentAttachPreview();
}

/* ── 채팅 파일 첨부 ── */
function handleChatFileSelect(event) {
  const files=Array.from(event.target.files||[]);
  files.forEach(async file=>{
    if(file.size>100*1024*1024){ toast(`${file.name}: 100MB 초과`,'error'); return; }
    if(file.size>2*1024*1024) toast(`⏳ "${file.name}" 압축 중...`,'info');
    try {
      const dataUrl = await compressFileForUpload(file);
      _chatPendingFiles.push({file,dataUrl});
      renderChatAttachPreview();
    } catch(e) { toast(`❌ "${file.name}" 읽기 실패`,'error'); }
  });
  event.target.value='';
}

function renderChatAttachPreview() {
  const box=document.getElementById('chat-attach-preview'); if(!box) return;
  if(!_chatPendingFiles.length){ box.innerHTML=''; return; }
  box.innerHTML = _chatPendingFiles.map((f,i)=>{
    const isImg=f.file.type.startsWith('image/');
    const isVid=f.file.type.startsWith('video/');
    let inner='';
    if(isImg) inner=`<img src="${f.dataUrl}" alt="${escHtml(f.file.name)}">`;
    else if(isVid) inner=`<video src="${f.dataUrl}" muted></video>`;
    else inner=`<div class="chat-attach-file-chip"><i class="fas ${getFileIcon(f.file.type)}"></i><span>${escHtml(f.file.name)}</span></div>`;
    return `<div class="chat-attach-item">${inner}<button class="chat-attach-remove" onclick="removeChatAttach(${i})">×</button></div>`;
  }).join('');
}

function removeChatAttach(idx) {
  _chatPendingFiles.splice(idx,1);
  renderChatAttachPreview();
}

/* ── 라이트박스 ── */
function openLightbox(src) {
  let ov = document.getElementById('lightbox-overlay');
  if(!ov) {
    ov = document.createElement('div');
    ov.id = 'lightbox-overlay';
    ov.className = 'lightbox-overlay';
    ov.innerHTML = `<button class="lb-close" onclick="closeLightbox()"><i class="fas fa-times"></i></button><img src="" alt="" id="lb-img">`;
    ov.addEventListener('click', e=>{ if(e.target===ov) closeLightbox(); });
    document.body.appendChild(ov);
  }
  document.getElementById('lb-img').src = src;
  ov.style.display = 'flex';
  document.addEventListener('keydown', _lbKeyHandler);
}
function closeLightbox() {
  const ov=document.getElementById('lightbox-overlay');
  if(ov) ov.style.display='none';
  document.removeEventListener('keydown', _lbKeyHandler);
}
function _lbKeyHandler(e){ if(e.key==='Escape') closeLightbox(); }

/* ── 유틸: 파일 아이콘 + 크기 포맷 ── */
function getFileIcon(type) {
  if(!type) return 'fa-file';
  if(type.startsWith('image/')) return 'fa-file-image';
  if(type.startsWith('video/')) return 'fa-file-video';
  if(type.startsWith('audio/')) return 'fa-file-audio';
  if(type.includes('pdf'))  return 'fa-file-pdf';
  if(type.includes('word') || type.includes('document')) return 'fa-file-word';
  if(type.includes('excel') || type.includes('sheet'))  return 'fa-file-excel';
  if(type.includes('powerpoint') || type.includes('presentation')) return 'fa-file-powerpoint';
  if(type.includes('zip') || type.includes('rar') || type.includes('7z')) return 'fa-file-archive';
  if(type.includes('text')) return 'fa-file-alt';
  // 디자인 파일
  if(type.includes('photoshop') || type.includes('psd')) return 'fa-file-image';
  if(type.includes('illustrator') || type.includes('ai') || type.includes('eps')) return 'fa-vector-square';
  if(type.includes('svg')) return 'fa-bezier-curve';
  if(type.includes('figma')) return 'fa-figma';
  return 'fa-file';
}
function fmtSize(bytes) {
  if(!bytes || bytes===0) return '0 B';
  const k=1024, sizes=['B','KB','MB','GB'];
  const i=Math.floor(Math.log(bytes)/Math.log(k));
  return parseFloat((bytes/Math.pow(k,i)).toFixed(1))+' '+sizes[i];
}

/* ============================================================
   프로젝트 설명란 파일 첨부
   ============================================================ */

function handleProjDescFileSelect(event) {
  const files = Array.from(event.target.files || []);
  files.forEach(async file => {
    if(file.size > 100*1024*1024){ toast(`${file.name}: 100MB 초과`,'error'); return; }
    if(file.size > 2*1024*1024) toast(`⏳ "${file.name}" 압축 중...`,'info');
    try {
      const dataUrl = await compressFileForUpload(file);
      _projDescPendingFiles.push({ file, dataUrl });
      renderProjDescPreview();
    } catch(e) { toast(`❌ "${file.name}" 읽기 실패`,'error'); }
  });
  event.target.value = '';
}

function renderProjDescPreview() {
  const prev = document.getElementById('proj-desc-preview'); if(!prev) return;
  prev.innerHTML = '';
  _projDescPendingFiles.forEach((f, i) => {
    const div = document.createElement('div');
    div.className = 'proj-desc-thumb';

    const isImg = f.file.type.startsWith('image/');
    const isVid = f.file.type.startsWith('video/');
    const safeName = escHtml(f.file.name);
    const safeUrl  = f.dataUrl || '';

    // 미리보기 영역
    let previewHtml = '';
    if(isImg) {
      previewHtml = `<div class="pdt-img-wrap" onclick="openLightbox('${safeUrl}')" title="클릭하면 크게 봅니다">
        <img src="${safeUrl}" alt="${safeName}">
        <div class="pdt-zoom-icon"><i class="fas fa-search-plus"></i></div>
      </div>`;
    } else if(isVid) {
      previewHtml = `<div class="pdt-vid-wrap">
        <video src="${safeUrl}" muted playsinline></video>
        <div class="pdt-play-icon"><i class="fas fa-play-circle"></i></div>
      </div>`;
    } else {
      const ext = f.file.name.split('.').pop().toUpperCase();
      previewHtml = `<div class="pdt-doc-wrap">
        <i class="fas ${getFileIcon(f.file.type)}"></i>
        <span class="pdt-ext">${ext}</span>
      </div>`;
    }

    // 다운로드 버튼
    const dlBtnHtml = safeUrl
      ? `<a class="pdt-dl-btn" href="${safeUrl}" download="${safeName}" title="다운로드"><i class="fas fa-download"></i></a>`
      : '';

    div.innerHTML = `
      ${previewHtml}
      <button class="proj-desc-remove-btn" onclick="removeProjDescFile(${i})" title="제거"><i class="fas fa-times"></i></button>
      <div class="pdt-footer">
        <div class="pdt-name" title="${safeName}">${safeName}</div>
        <div class="pdt-meta-row">
          <span class="pdt-size">${fmtSize(f.file.size)}</span>
          ${dlBtnHtml}
        </div>
      </div>`;
    prev.appendChild(div);
  });
}

function removeProjDescFile(idx) {
  _projDescPendingFiles.splice(idx, 1);
  renderProjDescPreview();
}

function initProjDescDrop() {
  const zone = document.getElementById('proj-desc-attach-zone'); if(!zone) return;
  // 이미 이벤트가 등록된 경우 중복 방지
  if(zone._dropInited) return;
  zone._dropInited = true;
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('drag-over');
    Array.from(e.dataTransfer.files || []).forEach(async file => {
      if(file.size > 100*1024*1024){ toast(`${file.name}: 100MB 초과`,'error'); return; }
      if(file.size > 2*1024*1024) toast(`⏳ "${file.name}" 압축 중...`,'info');
      try {
        const dataUrl = await compressFileForUpload(file);
        _projDescPendingFiles.push({ file, dataUrl });
        renderProjDescPreview();
      } catch(err) { toast(`❌ "${file.name}" 읽기 실패`,'error'); }
    });
  });
}

async function uploadProjDescFiles(projId) {
  for(const f of _projDescPendingFiles) {
    const isImg = f.file.type.startsWith('image/');
    const isVid = f.file.type.startsWith('video/');
    const data = {
      id: genId(), project_id: projId,
      file_name: f.file.name,
      file_type: isImg ? 'image' : isVid ? 'video' : 'document',
      file_size: fmtSize(f.file.size),
      data_url: f.dataUrl,
      uploader_id: State.owner.id, uploader_name: State.owner.name
    };
    try {
      await api.post('project_files', data);
      await addProjHistory(projId, 'file_upload', '', '', f.file.name, `"${f.file.name}" 파일이 설명란에서 업로드되었습니다.`);
    } catch(e) { console.warn('설명란 파일 업로드 실패:', f.file.name); }
  }
  toast(`✅ 파일 ${_projDescPendingFiles.length}개가 프로젝트 파일 탭에 저장되었습니다.`, 'success');
  _projDescPendingFiles = [];
}

/* ============================================================
   대시보드 — 전체 팀원 명단 모달
   ============================================================ */

function openMembersListModal() {
  // 부서 필터 옵션 구성
  const deptSel = document.getElementById('ml-dept-filter');
  if(deptSel) {
    const depts = [...new Set(State.members.map(m => m.department).filter(Boolean))].sort();
    deptSel.innerHTML = '<option value="all">전체 부서</option>' +
      depts.map(d => `<option value="${escHtml(d)}">${escHtml(d)}</option>`).join('');
  }
  // 검색 초기화
  const search = document.getElementById('ml-search');
  if(search) search.value = '';

  renderMembersListModal();
  openModal('modal-members-list');

  // 카드 활성화 효과
  const card = document.getElementById('stat-card-members');
  if(card) {
    card.classList.add('active-stat');
    setTimeout(() => card.classList.remove('active-stat'), 1500);
  }
}

function renderMembersListModal() {
  const search   = (document.getElementById('ml-search')?.value || '').toLowerCase();
  const deptF    = document.getElementById('ml-dept-filter')?.value || 'all';

  let members = [...State.members];
  if(search)        members = members.filter(m =>
    (m.name||'').toLowerCase().includes(search) ||
    (m.department||'').toLowerCase().includes(search) ||
    (m.role||'').toLowerCase().includes(search) ||
    (m.email||'').toLowerCase().includes(search)
  );
  if(deptF !== 'all') members = members.filter(m => m.department === deptF);

  // 부서별 정렬
  members.sort((a,b) => (a.department||'').localeCompare(b.department||'') || (a.name||'').localeCompare(b.name||''));

  // 통계 바
  const statBar = document.getElementById('ml-stat-bar');
  if(statBar) {
    const total   = State.members.length;
    const depts   = [...new Set(State.members.map(m=>m.department).filter(Boolean))].length;
    const admins  = State.members.filter(m=>m.role==='admin1'||m.role==='admin2').length;
    statBar.innerHTML = `
      <div class="ml-stat-item"><span class="ml-stat-num">${total}</span>전체 팀원</div>
      <div class="ml-stat-item"><span class="ml-stat-num">${depts}</span>부서</div>
      <div class="ml-stat-item"><span class="ml-stat-num">${admins}</span>관리자</div>
      <div class="ml-stat-item"><span class="ml-stat-num">${total - admins}</span>일반 멤버</div>`;
  }

  // 카운트 레이블
  const countLabel = document.getElementById('ml-count-label');
  if(countLabel) countLabel.textContent = `${members.length}명 표시 중 (전체 ${State.members.length}명)`;

  // 목록 렌더
  const list = document.getElementById('ml-list');
  if(!list) return;
  if(!members.length) {
    list.innerHTML = `<div class="ml-empty"><i class="fas fa-users" style="font-size:32px;opacity:.3;display:block;margin-bottom:10px"></i>해당하는 팀원이 없습니다.</div>`;
    return;
  }

  list.innerHTML = members.map(m => {
    const roleLabel = ROLE_LABEL[m.role] || m.role || '멤버';
    const roleCls   = m.role === 'admin1' ? 'ml-role-admin1' : m.role === 'admin2' ? 'ml-role-admin2' : 'ml-role-member';
    const tasks     = State.tasks.filter(t => t.assignee_id === m.id && t.status !== 'done').length;
    return `<div class="ml-member-card" onclick="openMemberDetail_ml('${m.id}')">
      ${avatarEl(m, 'avatar-md')}
      <div class="ml-member-info">
        <div class="ml-member-name">${escHtml(m.name)}</div>
        <div class="ml-member-sub">${escHtml(m.department||'부서 미지정')} · ${escHtml(m.email||'—')}</div>
        ${tasks > 0 ? `<div style="font-size:10px;color:var(--accent-orange);margin-top:2px"><i class="fas fa-tasks"></i> 진행 작업 ${tasks}건</div>` : ''}
      </div>
      <span class="ml-member-role-badge ${roleCls}">${escHtml(roleLabel)}</span>
    </div>`;
  }).join('');
}

function openMemberDetail_ml(memberId) {
  // 팀원 관리 페이지로 이동 후 해당 팀원 강조
  closeModal('modal-members-list');
  showPage('members');
  // 검색창에 이름 입력하여 하이라이트
  const m = getMember(memberId);
  if(m) {
    setTimeout(() => {
      const s = document.getElementById('member-search');
      if(s) { s.value = m.name; renderMembers(); }
    }, 200);
  }
}

/* ============================================================
   연차 — 비고 인라인 편집
   ============================================================ */

function openLxNoteEdit(recordId, tdEl) {
  // 이미 편집 중이면 무시
  if (tdEl.querySelector('.lx-note-input')) return;
  const rec = LeaveState.records.find(r => r.id === recordId);
  if (!rec) return;
  const currentNote = rec.note || '';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'lx-note-input';
  input.value = currentNote;
  input.maxLength = 100;
  input.placeholder = '비고 입력...';
  tdEl.innerHTML = '';
  tdEl.appendChild(input);
  input.focus();
  input.select();

  const save = async () => {
    const newNote = input.value.trim();
    if (newNote === currentNote) { renderLeaveExcelTable(); return; }
    try {
      const updated = await api.put('leave_records', rec.id, { ...rec, note: newNote });
      const idx = LeaveState.records.findIndex(r => r.id === rec.id);
      if (idx !== -1) LeaveState.records[idx] = updated;
      toast('비고가 저장되었습니다.', 'success');
    } catch(e) { toast('저장 오류', 'error'); }
    renderLeaveExcelTable();
  };

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
    if (e.key === 'Escape') { renderLeaveExcelTable(); }
  });
  input.addEventListener('blur', save);
}

/* ============================================================
   연차 — 퇴사자 토글
   ============================================================ */

async function toggleResigned(recordId, newVal) {
  const rec = LeaveState.records.find(r => r.id === recordId);
  if (!rec) return;
  const resigned = newVal === 'true';
  const label = resigned ? '퇴사' : '재직';
  if (!confirm(`${rec.name}님을 ${label} 상태로 변경하시겠습니까?`)) return;
  try {
    const updated = await api.put('leave_records', rec.id, { ...rec, resigned });
    const idx = LeaveState.records.findIndex(r => r.id === rec.id);
    if (idx !== -1) LeaveState.records[idx] = updated;
    toast(`${rec.name}님이 ${label} 처리되었습니다.`, 'success');
    renderLeaveExcelTable();
  } catch(e) { toast('변경 오류', 'error'); }
}

/* ============================================================
   LOGO EDIT — 툴 이름·색상 수정
   ============================================================ */

const LOGO_STORAGE_KEY = 'eclado_logo_config';

function loadLogoConfig() {
  try {
    const s = localStorage.getItem(LOGO_STORAGE_KEY);
    return s ? JSON.parse(s) : { name: 'ECLADO Cowork', color: '#1B3A6B' };
  } catch(e) { return { name: 'ECLADO Cowork', color: '#1B3A6B' }; }
}

/* ── 색상 어둡게 헬퍼 ── */
function _darkenColor(hex, amount) {
  try {
    let c = hex.replace('#','');
    if (c.length === 3) c = c.split('').map(x=>x+x).join('');
    const num = parseInt(c, 16);
    const r = Math.max(0, (num >> 16) - Math.round(255 * amount));
    const g = Math.max(0, ((num >> 8) & 0xff) - Math.round(255 * amount));
    const b = Math.max(0, (num & 0xff) - Math.round(255 * amount));
    return `#${((r<<16)|(g<<8)|b).toString(16).padStart(6,'0')}`;
  } catch(e) { return hex; }
}

function applyLogoConfig(cfg) {  const name  = cfg.name  || 'ECLADO';
  const color = cfg.color || '#1B3A6B';

  // 사이드바 SVG — 텍스트 길이에 맞게 viewBox 동적 조정
  const sbText = document.getElementById('sidebar-logo-text');
  const sbSvg  = document.getElementById('sidebar-logo-svg');
  if (sbText) {
    sbText.textContent = name;
    sbText.setAttribute('fill', color);
    // 렌더 후 실제 텍스트 너비 계산해서 viewBox 갱신
    requestAnimationFrame(() => {
      try {
        const w = sbText.getComputedTextLength ? Math.ceil(sbText.getComputedTextLength()) + 10 : 420;
        if (sbSvg) sbSvg.setAttribute('viewBox', `0 0 ${w} 56`);
      } catch(e) {}
    });
  }

  // 로그인 화면 SVG
  const loginText = document.querySelector('#login-overlay svg text');
  if (loginText) { loginText.textContent = name; loginText.setAttribute('fill', color); }

  // 페이지 타이틀
  document.title = name;

  // 모바일 상단 바 타이틀
  const mobileTitle = document.getElementById('mobile-top-title');
  if (mobileTitle && mobileTitle.textContent === (loadLogoConfig()?.name || 'ECLADO Cowork')) {
    mobileTitle.textContent = name;
  }

  // CSS 변수 업데이트
  document.documentElement.style.setProperty('--primary', color);
  document.documentElement.style.setProperty('--primary-dark', _darkenColor(color, 0.15));
}

function openLogoEditModal() {
  const cfg = loadLogoConfig();
  const nameInput  = document.getElementById('logo-name-input');
  const colorInput = document.getElementById('logo-color-input');
  if (nameInput)  nameInput.value  = cfg.name  || 'ECLADO';
  if (colorInput) colorInput.value = cfg.color || '#1B3A6B';
  // 미리보기 초기화
  updateLogoPreview();
  // 컬러 인풋 변경 시 미리보기
  colorInput.oninput = updateLogoPreview;
  nameInput.oninput  = updateLogoPreview;
  // 선택된 칩 표시
  document.querySelectorAll('.logo-color-chip').forEach(chip => {
    chip.classList.toggle('selected', chip.dataset.color === cfg.color);
  });
  openModal('modal-logo-edit');
}

function updateLogoPreview() {
  const name  = document.getElementById('logo-name-input')?.value || 'ECLADO';
  const color = document.getElementById('logo-color-input')?.value || '#1B3A6B';
  const pt  = document.getElementById('logo-preview-text');
  const svg = document.getElementById('logo-preview-svg');
  if (pt) {
    pt.textContent = name;
    pt.setAttribute('fill', color);
    requestAnimationFrame(() => {
      try {
        const w = pt.getComputedTextLength ? Math.ceil(pt.getComputedTextLength()) + 10 : 420;
        if (svg) svg.setAttribute('viewBox', `0 0 ${w} 56`);
      } catch(e) {}
    });
  }
}

function pickLogoColor(color) {
  const inp = document.getElementById('logo-color-input');
  if (inp) inp.value = color;
  document.querySelectorAll('.logo-color-chip').forEach(chip => {
    chip.classList.toggle('selected', chip.dataset.color === color);
  });
  updateLogoPreview();
}

function saveLogoEdit() {
  const name  = (document.getElementById('logo-name-input')?.value || '').trim() || 'ECLADO';
  const color = document.getElementById('logo-color-input')?.value || '#1B3A6B';
  const cfg = { name, color };
  localStorage.setItem(LOGO_STORAGE_KEY, JSON.stringify(cfg));
  applyLogoConfig(cfg);
  closeModal('modal-logo-edit');
  toast(`툴 이름이 "${name}"(으)로 저장되었습니다.`, 'success');
}

function resetLogoToDefault() {
  const cfg = { name: 'ECLADO Cowork', color: '#1B3A6B' };
  const nameInput  = document.getElementById('logo-name-input');
  const colorInput = document.getElementById('logo-color-input');
  if (nameInput)  nameInput.value  = cfg.name;
  if (colorInput) colorInput.value = cfg.color;
  document.querySelectorAll('.logo-color-chip').forEach(chip => {
    chip.classList.toggle('selected', chip.dataset.color === cfg.color);
  });
  updateLogoPreview();
}

/* ============================================================
   NOTIFY SETTINGS — 메신저 알림 설정
   ============================================================ */

const NOTIFY_STORAGE_KEY = 'eclado_notify_config';

function loadNotifyConfig() {
  try {
    const s = localStorage.getItem(NOTIFY_STORAGE_KEY);
    return s ? JSON.parse(s) : getDefaultNotifyConfig();
  } catch(e) { return getDefaultNotifyConfig(); }
}

function getDefaultNotifyConfig() {
  return {
    muteAll:    false,
    newMsg:     true,
    mention:    true,
    fileMsg:    true,
    dndEnabled: false,
    dndStart:   '22:00',
    dndEnd:     '08:00',
    roomMutes:  {}   // { roomId: true } → 해당 방 알림 끔
  };
}

function openNotifyModal() {
  const cfg = loadNotifyConfig();
  // 전체 설정 적용
  const setChk = (id, val) => { const el=document.getElementById(id); if(el) el.checked = !!val; };
  setChk('notify-mute-all',    cfg.muteAll);
  setChk('notify-new-msg',     cfg.newMsg);
  setChk('notify-mention',     cfg.mention);
  setChk('notify-file',        cfg.fileMsg);
  setChk('notify-dnd-enabled', cfg.dndEnabled);
  const dndStart = document.getElementById('notify-dnd-start');
  const dndEnd   = document.getElementById('notify-dnd-end');
  if (dndStart) dndStart.value = cfg.dndStart || '22:00';
  if (dndEnd)   dndEnd.value   = cfg.dndEnd   || '08:00';
  // DND 시간 표시
  toggleDndTime();
  // 채팅방 목록 렌더
  renderNotifyRoomList(cfg);
  // 상태 바 업데이트
  updateNotifyStatusBar(cfg);
  // 전체 끄기 시 하위 옵션 비활성화
  applyMuteAllUI(cfg.muteAll);
  openModal('modal-notify-setting');
}

function renderNotifyRoomList(cfg) {
  const box = document.getElementById('notify-room-list'); if (!box) return;
  const rooms = State.chatRooms || [];
  if (!rooms.length) { box.innerHTML = '<p style="color:var(--text-muted);font-size:13px">채팅방이 없습니다.</p>'; return; }
  box.innerHTML = rooms.map(room => {
    const isMuted = !!(cfg.roomMutes && cfg.roomMutes[room.id]);
    const typeLabel = room.type === 'channel' ? '채널' : room.type === 'group' ? '그룹' : 'DM';
    const typeCls   = room.type === 'channel' ? 'nrtb-channel' : room.type === 'group' ? 'nrtb-group' : 'nrtb-dm';
    return `<div class="notify-room-item">
      <span class="notify-room-type-badge ${typeCls}">${typeLabel}</span>
      <span class="notify-room-name">${escHtml(room.name||'채팅방')}</span>
      <label class="notify-toggle" title="${isMuted?'알림 켜기':'알림 끄기'}">
        <input type="checkbox" ${!isMuted?'checked':''} data-room-id="${room.id}" onchange="toggleRoomNotify('${room.id}',this.checked)" />
        <span class="notify-slider"></span>
      </label>
    </div>`;
  }).join('');
}

function toggleRoomNotify(roomId, isOn) {
  const cfg = loadNotifyConfig();
  if (!cfg.roomMutes) cfg.roomMutes = {};
  cfg.roomMutes[roomId] = !isOn;
  localStorage.setItem(NOTIFY_STORAGE_KEY, JSON.stringify(cfg));
  updateNotifyStatusBar(cfg);
}

function toggleDndTime() {
  const enabled = document.getElementById('notify-dnd-enabled')?.checked;
  const timeBox = document.getElementById('notify-dnd-time');
  if (timeBox) timeBox.style.display = enabled ? 'block' : 'none';
  applyNotifySettings();
}

function applyMuteAllUI(muted) {
  const section = document.getElementById('notify-type-section');
  const dnd     = document.getElementById('notify-dnd-section');
  const roomList= document.getElementById('notify-room-list');
  [section, dnd, roomList].forEach(el => { if (el) el.style.opacity = muted ? '.4' : '1'; });
}

function applyNotifySettings() {
  const cfg = loadNotifyConfig();
  const muteAll = document.getElementById('notify-mute-all')?.checked;
  cfg.muteAll    = !!muteAll;
  cfg.newMsg     = document.getElementById('notify-new-msg')?.checked !== false;
  cfg.mention    = document.getElementById('notify-mention')?.checked !== false;
  cfg.fileMsg    = document.getElementById('notify-file')?.checked !== false;
  cfg.dndEnabled = document.getElementById('notify-dnd-enabled')?.checked || false;
  cfg.dndStart   = document.getElementById('notify-dnd-start')?.value || '22:00';
  cfg.dndEnd     = document.getElementById('notify-dnd-end')?.value   || '08:00';
  localStorage.setItem(NOTIFY_STORAGE_KEY, JSON.stringify(cfg));
  applyMuteAllUI(muteAll);
  updateNotifyStatusBar(cfg);
  updateNotifyBellIcon(cfg);
}

function saveNotifySettings() {
  applyNotifySettings();
  closeModal('modal-notify-setting');
  toast('알림 설정이 저장되었습니다.', 'success');
}

function resetNotifySettings() {
  const cfg = getDefaultNotifyConfig();
  localStorage.setItem(NOTIFY_STORAGE_KEY, JSON.stringify(cfg));
  openNotifyModal(); // 재렌더
  toast('알림 설정이 기본값으로 초기화되었습니다.', 'info');
}

function updateNotifyStatusBar(cfg) {
  const bar  = document.getElementById('notify-status-bar');
  const icon = document.getElementById('notify-status-icon');
  const text = document.getElementById('notify-status-text');
  if (!bar) return;
  if (cfg.muteAll) {
    bar.style.background = '#fff0f0'; bar.style.borderColor = '#e53e3e'; bar.style.color = '#e53e3e';
    if (icon) icon.className = 'fas fa-bell-slash';
    if (text) text.textContent = '모든 알림이 꺼져 있습니다.';
  } else {
    const parts = [];
    if (cfg.newMsg)     parts.push('새 메시지');
    if (cfg.mention)    parts.push('멘션');
    if (cfg.fileMsg)    parts.push('파일');
    if (cfg.dndEnabled) parts.push(`방해금지 ${cfg.dndStart}~${cfg.dndEnd}`);
    bar.style.background = 'var(--primary-light)'; bar.style.borderColor = 'var(--primary)'; bar.style.color = 'var(--primary)';
    if (icon) icon.className = 'fas fa-bell';
    if (text) text.textContent = parts.length ? `활성 알림: ${parts.join(' · ')}` : '모든 알림이 꺼져 있습니다.';
  }
}

function updateNotifyBellIcon(cfg) {
  const btn = document.getElementById('btn-notify-setting');
  if (!btn) return;
  btn.classList.toggle('notify-bell-badge', !cfg.muteAll);
  btn.classList.toggle('notify-bell-muted', cfg.muteAll);
}

/**
 * 메시지 전송 전 알림 권한 체크 (알림 시뮬레이션)
 * 실제 push 알림은 서버 없이 불가 → 인앱 토스트로 대체
 */
function checkAndNotify(senderName, content) {
  const cfg = loadNotifyConfig();
  if (cfg.muteAll) return;

  // 방해 금지 시간 체크
  if (cfg.dndEnabled) {
    const now = new Date();
    const hm  = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const start = cfg.dndStart || '22:00', end = cfg.dndEnd || '08:00';
    // 자정 걸치는 구간 처리
    const inDnd = start > end
      ? (hm >= start || hm < end)
      : (hm >= start && hm < end);
    if (inDnd) return;
  }

  if (cfg.newMsg) {
    toast(`💬 ${senderName}: ${content.slice(0,40)}${content.length>40?'…':''}`, 'info');
  }
}

/* ============================================================
   연차 직원 상세 모달 (LEAVE MEMBER DETAIL)
   ============================================================ */

function openLeaveMemberDetail(recordId) {
  const rec = LeaveState.records.find(r => r.id === recordId);
  if (!rec) { toast('직원 정보를 찾을 수 없습니다.', 'error'); return; }
  renderLeaveMemberDetail(rec);
  openModal('modal-leave-member');
}

function renderLeaveMemberDetail(rec) {
  const years = calcYearsOfService(rec.join_date);
  const allUsages = LeaveState.usages.filter(u => u.leave_record_id === rec.id);

  // 전 연도 목록 추출 (leave_records 기준 year + usages의 year)
  const yearSet = new Set();
  LeaveState.records.filter(r => r.name === rec.name).forEach(r => yearSet.add(r.year || LeaveState.currentYear));
  allUsages.forEach(u => { if (u.year) yearSet.add(u.year); });
  yearSet.add(LeaveState.currentYear);
  const yearList = Array.from(yearSet).sort((a,b) => b - a);

  // 현재 연도 레코드들 (같은 이름의 레코드)
  const allRecs = LeaveState.records.filter(r => r.name === rec.name);

  // 전체 부여 / 사용 합계
  let totalGranted = 0, totalUsed = 0;
  allRecs.forEach(r => {
    totalGranted += r.granted_days || 0;
    totalUsed    += calcUsedDays(r.id);
  });
  const currentRec = LeaveState.records.find(r => r.name === rec.name && r.year === LeaveState.currentYear) || rec;
  const currentGranted = currentRec.granted_days || 0;
  const currentUsed    = calcUsedDays(currentRec.id);
  const currentRemain  = Math.max(currentGranted - currentUsed, 0);

  // 헤더
  const header = document.getElementById('lm-detail-header');
  if (header) {
    const initial = (rec.name||'?').charAt(0);
    const joinFmt = rec.join_date ? rec.join_date.replace(/-/g, '.') : '미등록';
    const resignedBadge = rec.resigned ? '<span class="lm-badge resigned">퇴사</span>' : '<span class="lm-badge">재직</span>';
    header.innerHTML = `
      <div class="lm-avatar">${initial}</div>
      <div class="lm-info">
        <div class="lm-name">${escHtml(rec.name || '—')}</div>
        <div class="lm-sub">
          <span><i class="fas fa-building"></i> ${escHtml(rec.department || '—')}</span>
          <span><i class="fas fa-id-badge"></i> ${ROLE_LABEL[rec.role] || rec.role || '—'}</span>
          <span><i class="fas fa-calendar-alt"></i> 입사: ${joinFmt}</span>
        </div>
      </div>
      <div class="lm-badges">
        ${resignedBadge}
        <span class="lm-badge"><i class="fas fa-clock"></i> 근속 ${years}년</span>
      </div>`;
  }

  // 통계 카드
  const statsRow = document.getElementById('lm-stats-row');
  if (statsRow) {
    const rate = currentGranted > 0 ? Math.round(currentUsed / currentGranted * 100) : 0;
    statsRow.innerHTML = `
      <div class="lm-stat-card">
        <div class="lm-stat-icon">⏱️</div>
        <div class="lm-stat-val">${years}년</div>
        <div class="lm-stat-lbl">총 근속연수</div>
      </div>
      <div class="lm-stat-card accent-green">
        <div class="lm-stat-icon">🎁</div>
        <div class="lm-stat-val">${currentGranted}일</div>
        <div class="lm-stat-lbl">${LeaveState.currentYear}년 부여</div>
      </div>
      <div class="lm-stat-card accent-orange">
        <div class="lm-stat-icon">✅</div>
        <div class="lm-stat-val">${currentUsed}일</div>
        <div class="lm-stat-lbl">${LeaveState.currentYear}년 사용</div>
      </div>
      <div class="lm-stat-card accent-red">
        <div class="lm-stat-icon">📅</div>
        <div class="lm-stat-val">${currentRemain}일</div>
        <div class="lm-stat-lbl">잔여 연차</div>
      </div>
      <div class="lm-stat-card accent-purple">
        <div class="lm-stat-icon">📊</div>
        <div class="lm-stat-val">${rate}%</div>
        <div class="lm-stat-lbl">올해 사용률</div>
      </div>`;
  }

  // 근무연수 바
  const serviceBar = document.getElementById('lm-service-bar');
  if (serviceBar) {
    const maxYears = 20;
    const pct = Math.min(years / maxYears * 100, 100);
    const milestones = [0, 1, 3, 5, 10, 15, 20];
    serviceBar.innerHTML = `
      <div class="lm-service-title"><i class="fas fa-chart-line"></i> 근속연수 현황</div>
      <div class="lm-service-track">
        <div class="lm-service-fill" style="width:${pct}%">
          <span>${years}년</span>
        </div>
      </div>
      <div class="lm-service-milestones">
        ${milestones.map(y => `<div class="lm-milestone ${y <= years ? 'active' : ''}">${y}년</div>`).join('')}
      </div>`;
  }

  // 연도별 탭 & 이력
  const yearTabsEl = document.getElementById('lm-year-tabs');
  const yearContentEl = document.getElementById('lm-year-content');
  if (!yearTabsEl || !yearContentEl) return;

  yearTabsEl.innerHTML = yearList.map((y, i) =>
    `<button class="lm-year-tab ${i===0?'active':''}" onclick="switchLmYear(${y},'${rec.name}')" data-year="${y}">${y}년</button>`
  ).join('');

  renderLmYearContent(yearList[0], rec.name, yearContentEl, allRecs);
}

function switchLmYear(year, name) {
  document.querySelectorAll('.lm-year-tab').forEach(btn => {
    btn.classList.toggle('active', +btn.dataset.year === +year);
  });
  const contentEl = document.getElementById('lm-year-content');
  if (!contentEl) return;
  const allRecs = LeaveState.records.filter(r => r.name === name);
  renderLmYearContent(year, name, contentEl, allRecs);
}

function renderLmYearContent(year, name, containerEl, allRecs) {
  const yearRec  = allRecs.find(r => r.year === year);
  const usages   = yearRec
    ? LeaveState.usages.filter(u => u.leave_record_id === yearRec.id)
    : [];
  const granted  = yearRec ? (yearRec.granted_days || 0) : 0;
  const used     = yearRec ? calcUsedDays(yearRec.id) : 0;
  const remain   = Math.max(granted - used, 0);

  // 월별 요약 칩
  const monthData = Array.from({length: 12}, (_, i) => {
    const m = i + 1;
    const mu = usages.filter(u => u.month === m);
    return { m, days: mu.reduce((s,u) => s+(u.days||0), 0) };
  });
  const monthChips = monthData.map(({m, days}) =>
    `<div class="lm-month-chip ${days>0?'has-data':''}">
       <span class="m-label">${m}월</span>
       <span class="m-days ${days===0?'zero':''}">${days>0?days+'일':'—'}</span>
     </div>`
  ).join('');

  // 상세 이력 테이블
  const typeColorMap = {
    '연차': '#4A90E2', '반차(오전)': '#8E44AD', '반차(오후)': '#1ABC9C',
    '병가': '#E74C3C', '건강검진': '#27AE60', '경조사': '#E67E22', '기타': '#9AAAC0',
  };
  const rows = usages.length
    ? usages.map(u => {
        const c = typeColorMap[u.leave_type] || '#9AAAC0';
        const dateStr = u.start_date && u.end_date && u.start_date !== u.end_date
          ? `${u.start_date} ~ ${u.end_date}`
          : (u.start_date || '—');
        return `<tr>
          <td>${u.month || '—'}월</td>
          <td><span class="lm-type-chip" style="background:${c}20;color:${c}">${escHtml(u.leave_type||'—')}</span></td>
          <td>${dateStr}</td>
          <td><strong>${u.days || 0}</strong>일</td>
          <td style="color:var(--text-muted);font-size:12px">${u.reason ? escHtml(u.reason) : '—'}</td>
        </tr>`;
      }).join('')
    : `<tr class="lm-empty-row"><td colspan="5"><i class="fas fa-inbox" style="font-size:24px;display:block;margin-bottom:8px;opacity:.4"></i>${year}년 연차 사용 이력이 없습니다.</td></tr>`;

  containerEl.innerHTML = `
    <div class="lm-year-section">
      <div class="lm-year-section-title"><i class="fas fa-calendar-check"></i> ${year}년 연차 요약</div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px;font-size:13px;">
        <span>부여: <strong style="color:var(--primary)">${granted}일</strong></span>
        <span>사용: <strong style="color:#E67E22">${used}일</strong></span>
        <span>잔여: <strong style="color:${remain===0?'#E74C3C':'#27AE60'}">${remain}일</strong></span>
      </div>
      <div class="lm-month-summary">${monthChips}</div>
    </div>
    <div class="lm-year-section">
      <div class="lm-year-section-title"><i class="fas fa-list-alt"></i> ${year}년 상세 이력</div>
      <div style="overflow-x:auto">
        <table class="lm-usage-table">
          <thead>
            <tr>
              <th>월</th><th>유형</th><th>기간</th><th>일수</th><th>사유</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

/* ============================================================
   직원 연차 전체 관리표 — 입사 연도부터 현재까지 엑셀 스타일
   ============================================================ */

/**
 * 이름 클릭 → 전체 연차 관리표 모달 열기
 */
function openLeaveMemberFullView(recordId) {
  const rec = LeaveState.records.find(r => r.id === recordId);
  if (!rec) { toast('직원 정보를 찾을 수 없습니다.', 'error'); return; }

  // 헤더 아바타·제목 세팅
  const avatar = document.getElementById('lfv-avatar');
  const title  = document.getElementById('lfv-title');
  const subtitle = document.getElementById('lfv-subtitle');
  if (avatar) {
    avatar.textContent = (rec.name || '?').charAt(0);
    // 멤버 색상 사용
    const member = State.members.find(m => m.name === rec.name);
    avatar.style.background = member?.avatar_color || 'var(--primary)';
  }
  if (title) title.textContent = `${rec.name || '—'} 연차 전체 이력`;
  if (subtitle) {
    const joinFmt = rec.join_date ? rec.join_date.replace(/-/g, '.') : '미등록';
    const years   = calcYearsOfService(rec.join_date);
    const dept    = rec.department || '—';
    subtitle.textContent = `${dept} · 입사 ${joinFmt} · 근속 ${years}년 · ${rec.resigned ? '퇴사' : '재직 중'}`;
  }

  renderLeaveMemberFullView(rec);
  openModal('modal-leave-fullview');
}

/**
 * 전체 연차 관리표 렌더링
 * - 입사 연도 ~ 현재 연도 모든 연도를 연도별 섹션 + 엑셀 스타일 테이블로 표시
 */
function renderLeaveMemberFullView(rec) {
  const wrap = document.getElementById('lfv-table-wrap');
  const summaryBar = document.getElementById('lfv-summary-bar');
  if (!wrap) return;

  // 같은 이름의 모든 연도 레코드
  const allRecs = LeaveState.records.filter(r => r.name === rec.name);

  // 연도 범위: 입사 연도 ~ 현재 연도
  const joinYear = rec.join_date ? new Date(rec.join_date).getFullYear() : LeaveState.currentYear;
  const nowYear  = LeaveState.currentYear;
  const yearList = [];
  for (let y = nowYear; y >= joinYear; y--) yearList.push(y);

  // 전체 누적 통계
  let totalGranted = 0, totalUsed = 0;
  allRecs.forEach(r => {
    totalGranted += r.granted_days || 0;
    totalUsed    += calcUsedDays(r.id);
  });
  const totalRemain = Math.max(totalGranted - totalUsed, 0);
  const totalRate   = totalGranted > 0 ? Math.round(totalUsed / totalGranted * 100) : 0;

  // 요약 바
  if (summaryBar) {
    summaryBar.innerHTML = `
      <div class="lfv-sum-item">
        <span class="lfv-sum-icon">📅</span>
        <span class="lfv-sum-val">${joinYear}년 ~</span>
        <span class="lfv-sum-lbl">입사 연도</span>
      </div>
      <div class="lfv-sum-divider"></div>
      <div class="lfv-sum-item">
        <span class="lfv-sum-icon">🎁</span>
        <span class="lfv-sum-val lfv-col-grant">${totalGranted}일</span>
        <span class="lfv-sum-lbl">누적 부여</span>
      </div>
      <div class="lfv-sum-item">
        <span class="lfv-sum-icon">✅</span>
        <span class="lfv-sum-val lfv-col-used">${totalUsed}일</span>
        <span class="lfv-sum-lbl">누적 사용</span>
      </div>
      <div class="lfv-sum-item">
        <span class="lfv-sum-icon">📊</span>
        <span class="lfv-sum-val lfv-col-remain">${totalRemain}일</span>
        <span class="lfv-sum-lbl">잔여 합계</span>
      </div>
      <div class="lfv-sum-divider"></div>
      <div class="lfv-sum-item">
        <div class="lfv-sum-rate-wrap">
          <div class="lfv-sum-rate-bar">
            <div class="lfv-sum-rate-fill ${totalRate>=80?'rate-exhaust':totalRate>=50?'rate-warning':'rate-normal'}" style="width:${Math.min(totalRate,100)}%"></div>
          </div>
          <span class="lfv-sum-rate-text">${totalRate}% 사용</span>
        </div>
        <span class="lfv-sum-lbl">전체 사용률</span>
      </div>`;
  }

  // 연도별 섹션 생성
  wrap.innerHTML = yearList.map(year => {
    const yearRec  = allRecs.find(r => r.year === year);
    const usages   = yearRec ? LeaveState.usages.filter(u => u.leave_record_id === yearRec.id) : [];
    const granted  = yearRec ? (yearRec.granted_days || 0) : 0;
    const used     = yearRec ? calcUsedDays(yearRec.id) : 0;
    const remain   = Math.max(granted - used, 0);
    const rate     = granted > 0 ? Math.round(used / granted * 100) : 0;
    const rateClass = rate >= 80 ? 'rate-exhaust' : rate >= 50 ? 'rate-warning' : 'rate-normal';
    const isCurrentYear = year === nowYear;
    const hasRecord = !!yearRec;

    // 12개월 헤더
    const monthHeaders = Array.from({length:12}, (_,i) =>
      `<th class="lfv-th-month" colspan="2">${i+1}월</th>`
    ).join('');

    // 날짜 칩 + 일수 셀
    let monthCols = '';
    for (let m = 1; m <= 12; m++) {
      const mUsages = usages.filter(u => u.month === m);
      const mDays   = mUsages.reduce((s,u) => s+(u.days||0), 0);

      let dateContent = '';
      if (mUsages.length > 0) {
        const chips = mUsages.map(u => {
          const cls = _leaveTypeChipClass(u.leave_type);
          const dateStr = u.start_date && u.end_date && u.start_date !== u.end_date
            ? `${u.start_date.slice(5)} ~ ${u.end_date.slice(5)}`
            : (u.start_date ? u.start_date.slice(5) : '—');
          const shortType = u.leave_type === '연차' ? '연' :
                            u.leave_type === '반차(오전)' ? '반(오)' :
                            u.leave_type === '반차(오후)' ? '반(후)' :
                            u.leave_type === '병가' ? '병' :
                            u.leave_type === '건강검진' ? '검' :
                            u.leave_type === '경조사' ? '경' : '기';
          return `<span class="lx-date-chip ${cls}" title="${u.leave_type}: ${dateStr} (${u.days}일)${u.reason?' — '+u.reason:''}">${shortType}:${dateStr}</span>`;
        }).join('');
        dateContent = `<div class="lx-date-chips">${chips}</div>`;
      } else {
        dateContent = `<span class="lfv-empty-cell">—</span>`;
      }

      monthCols += `
        <td class="lx-td-date lfv-td-date${mUsages.length>0?' has-data':''}">${dateContent}</td>
        <td class="lx-td-days lfv-td-days${mDays===0?' days-zero':''}">${mDays > 0 ? mDays : '—'}</td>`;
    }

    // 연도 행이 없는 경우 안내 행
    const dataRow = hasRecord
      ? `<tr class="${rate>=80?'lx-row-exhaust':rate>=50?'lx-row-warning':''}">
          <td class="lfv-td-year-label">
            <span class="lfv-year-badge ${isCurrentYear?'current':''}">
              ${year}년${isCurrentYear?' <span class="lfv-cur-tag">올해</span>':''}
            </span>
          </td>
          <td class="lx-td-grant lfv-td-sum">${granted}</td>
          ${monthCols}
          <td class="lx-td-total lfv-td-sum">${used}</td>
          <td class="lx-td-remain lfv-td-sum ${remain===0&&granted>0?'lx-remain-exhaust':remain>0&&rate>=50?'lx-remain-warning':'lx-remain-ok'}">${remain}</td>
          <td class="lfv-td-rate-cell">
            <div class="lx-rate-bar-wrap">
              <div class="lx-rate-bar"><div class="lx-rate-fill ${rateClass}" style="width:${Math.min(rate,100)}%"></div></div>
              <span class="lx-rate-text ${rateClass}">${rate}%</span>
            </div>
          </td>
        </tr>`
      : `<tr class="lfv-no-record-row">
          <td class="lfv-td-year-label">
            <span class="lfv-year-badge ${isCurrentYear?'current':''}">${year}년${isCurrentYear?' <span class="lfv-cur-tag">올해</span>':''}</span>
          </td>
          <td colspan="26" class="lfv-no-record-msg">
            <i class="fas fa-info-circle"></i> ${year}년 연차 레코드 없음
          </td>
        </tr>`;

    return `
      <div class="lfv-year-section ${isCurrentYear?'lfv-year-current':''}">
        <div class="lfv-year-section-head">
          <span class="lfv-ys-year">${year}년${isCurrentYear?' <span class="lfv-cur-label">현재</span>':''}</span>
          ${hasRecord ? `
          <span class="lfv-ys-grant">부여 <strong>${granted}일</strong></span>
          <span class="lfv-ys-used">사용 <strong style="color:#E67E22">${used}일</strong></span>
          <span class="lfv-ys-remain">잔여 <strong style="color:${remain===0&&granted>0?'#E74C3C':'#27AE60'}">${remain}일</strong></span>
          <div class="lfv-ys-bar-wrap">
            <div class="lx-rate-bar" style="width:120px"><div class="lx-rate-fill ${rateClass}" style="width:${Math.min(rate,100)}%"></div></div>
            <span class="lx-rate-text ${rateClass}" style="font-size:11px">${rate}%</span>
          </div>` : `<span style="color:var(--text-muted);font-size:12px">레코드 없음</span>`}
        </div>
        <div class="lfv-table-scroll">
          <table class="lfv-excel-table">
            <thead>
              <tr>
                <th class="lfv-th-year" rowspan="2">연도</th>
                <th class="lfv-th-grant" rowspan="2">부여</th>
                ${monthHeaders}
                <th class="lfv-th-sum" rowspan="2">합계</th>
                <th class="lfv-th-sum" rowspan="2">잔여</th>
                <th class="lfv-th-rate" rowspan="2">사용률</th>
              </tr>
              <tr>
                ${Array.from({length:12}, () => '<th class="lfv-th-sub">내역</th><th class="lfv-th-sub lfv-th-days">일</th>').join('')}
              </tr>
            </thead>
            <tbody>
              ${dataRow}
            </tbody>
          </table>
        </div>
      </div>`;
  }).join('');
}

/* ============================================================
   파일 상세 모달 — 수정 / 삭제 / 댓글 (공통)
   tableType: 'project_files' | 'task_attachments' | 'cloud_files'
   ============================================================ */
let _fdModal = { tableType: '', fileId: '', parentId: '' };

function openFileDetailModal(tableType, fileId, parentId) {
  _fdModal = { tableType, fileId, parentId: parentId || '' };
  _renderFileDetailModal();
  openModal('modal-file-detail');
}

async function _renderFileDetailModal() {
  const { tableType, fileId } = _fdModal;
  let file = null;
  try {
    file = await api.getOne(tableType, fileId);
  } catch(e) {
    toast('파일 정보를 불러올 수 없습니다.', 'error');
    return;
  }
  if (!file) return;

  const isImg = (file.file_type||'').startsWith('image') || file.file_type === 'image';
  const isVid = (file.file_type||'').startsWith('video') || file.file_type === 'video';

  // 미리보기
  let previewHtml = '';
  if (isImg && file.data_url) {
    previewHtml = `<div class="fdm-preview"><img src="${file.data_url}" alt="${escHtml(file.file_name||'')}" onclick="openLightbox('${file.data_url}')" class="fdm-preview-img"/></div>`;
  } else if (isVid && file.data_url) {
    previewHtml = `<div class="fdm-preview"><video src="${file.data_url}" controls class="fdm-preview-video"></video></div>`;
  } else {
    const icon = getFileIcon(file.file_type || file.file_name || '');
    previewHtml = `<div class="fdm-preview fdm-preview-icon"><i class="fas ${icon}"></i></div>`;
  }

  // 파일명 표시
  const fileName = file.file_name || (tableType==='cloud_files' ? file.file_name : file.file_name) || '파일';
  // 설명
  const desc = file.file_desc || file.note || '';
  // 댓글 파싱
  let comments = [];
  try { comments = JSON.parse(file.file_comments || '[]'); } catch(e) { comments = []; }

  const dlAttr = file.data_url ? `href="${file.data_url}" download="${escHtml(fileName)}"` : '';

  document.getElementById('fdm-preview-wrap').innerHTML = previewHtml;
  document.getElementById('fdm-file-name').textContent = fileName;
  document.getElementById('fdm-file-meta').textContent =
    [file.file_size || file.file_size_str || '', file.uploader_name || '', relTime(file.created_at || Date.now())].filter(Boolean).join(' · ');
  document.getElementById('fdm-desc-input').value = desc;
  // 다운로드 버튼
  const dlBtn = document.getElementById('fdm-dl-btn');
  if (dlBtn) {
    if (file.data_url) { dlBtn.href = file.data_url; dlBtn.download = fileName; dlBtn.style.display = ''; }
    else dlBtn.style.display = 'none';
  }
  // 파일명 수정 input
  document.getElementById('fdm-name-input').value = fileName;
  // 댓글 렌더
  _renderFdmComments(comments);
}

function _renderFdmComments(comments) {
  const box = document.getElementById('fdm-comments-list');
  if (!box) return;
  if (!comments.length) {
    box.innerHTML = `<div class="fdm-no-comment">아직 댓글이 없습니다. 첫 댓글을 남겨보세요!</div>`;
    return;
  }
  box.innerHTML = comments.map((c, i) => {
    const isMe = c.authorId === State.owner.id;
    const m = getMember(c.authorId);
    return `<div class="fdm-comment-item" id="fdm-cmt-${i}">
      ${avatarEl(m || {name: c.author || '?', avatar_color: '#888'}, 'avatar-sm')}
      <div class="fdm-cmt-body">
        <div class="fdm-cmt-header">
          <span class="fdm-cmt-author">${escHtml(c.author||'알 수 없음')}</span>
          <span class="fdm-cmt-time">${relTime(c.ts||Date.now())}</span>
          ${isMe ? `<div class="fdm-cmt-actions">
            <button onclick="editFdmComment(${i})" title="수정"><i class="fas fa-pencil-alt"></i></button>
            <button onclick="deleteFdmComment(${i})" title="삭제"><i class="fas fa-trash"></i></button>
          </div>` : ''}
        </div>
        <div class="fdm-cmt-text" id="fdm-cmt-text-${i}">${escHtml(c.text||'')}</div>
        <div class="fdm-cmt-edit-row" id="fdm-cmt-edit-${i}" style="display:none">
          <textarea class="fdm-cmt-edit-input" id="fdm-cmt-edit-input-${i}">${escHtml(c.text||'')}</textarea>
          <div style="display:flex;gap:6px;margin-top:6px">
            <button class="btn btn-primary btn-sm" onclick="saveFdmCommentEdit(${i})">저장</button>
            <button class="btn btn-ghost btn-sm" onclick="cancelFdmCommentEdit(${i})">취소</button>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

async function saveFdmFileEdit() {
  const { tableType, fileId, parentId } = _fdModal;
  const newName = document.getElementById('fdm-name-input').value.trim();
  const newDesc = document.getElementById('fdm-desc-input').value.trim();
  if (!newName) { toast('파일명을 입력하세요.', 'error'); return; }
  try {
    const file = await api.getOne(tableType, fileId);
    const updatePayload = { ...file, file_name: newName, file_desc: newDesc };
    if (tableType === 'cloud_files') updatePayload.note = newDesc;
    await api.put(tableType, fileId, updatePayload);
    toast('수정되었습니다.', 'success');
    _renderFileDetailModal();
    _refreshFileList(tableType, parentId);
  } catch(e) { toast('수정 오류', 'error'); }
}

async function deleteFdmFile() {
  const { tableType, fileId, parentId } = _fdModal;
  if (!confirm('이 파일을 삭제하시겠습니까?')) return;
  try {
    await api.del(tableType, fileId);
    toast('삭제되었습니다.', 'success');
    closeModal('modal-file-detail');
    _refreshFileList(tableType, parentId);
  } catch(e) { toast('삭제 오류', 'error'); }
}

async function addFdmComment() {
  const inp = document.getElementById('fdm-comment-input');
  const text = (inp?.value || '').trim();
  if (!text) { toast('댓글 내용을 입력하세요.', 'error'); return; }
  const { tableType, fileId } = _fdModal;
  try {
    const file = await api.getOne(tableType, fileId);
    let comments = [];
    try { comments = JSON.parse(file.file_comments || '[]'); } catch(e) { comments = []; }
    const newComment = {
      id: genId(),
      authorId: State.owner.id,
      author: State.owner.name || '나',
      text,
      ts: Date.now()
    };
    comments.push(newComment);
    await api.put(tableType, fileId, { ...file, file_comments: JSON.stringify(comments) });
    inp.value = '';
    _renderFdmComments(comments);
    toast('댓글이 등록되었습니다.', 'success');
  } catch(e) { toast('댓글 등록 오류', 'error'); }
}

async function deleteFdmComment(idx) {
  if (!confirm('댓글을 삭제하시겠습니까?')) return;
  const { tableType, fileId } = _fdModal;
  try {
    const file = await api.getOne(tableType, fileId);
    let comments = [];
    try { comments = JSON.parse(file.file_comments || '[]'); } catch(e) { comments = []; }
    comments.splice(idx, 1);
    await api.put(tableType, fileId, { ...file, file_comments: JSON.stringify(comments) });
    _renderFdmComments(comments);
    toast('댓글이 삭제되었습니다.', 'success');
  } catch(e) { toast('삭제 오류', 'error'); }
}

function editFdmComment(idx) {
  document.getElementById(`fdm-cmt-text-${idx}`).style.display = 'none';
  document.getElementById(`fdm-cmt-edit-${idx}`).style.display = 'block';
}
function cancelFdmCommentEdit(idx) {
  document.getElementById(`fdm-cmt-text-${idx}`).style.display = '';
  document.getElementById(`fdm-cmt-edit-${idx}`).style.display = 'none';
}
async function saveFdmCommentEdit(idx) {
  const newText = document.getElementById(`fdm-cmt-edit-input-${idx}`)?.value.trim();
  if (!newText) { toast('내용을 입력하세요.', 'error'); return; }
  const { tableType, fileId } = _fdModal;
  try {
    const file = await api.getOne(tableType, fileId);
    let comments = [];
    try { comments = JSON.parse(file.file_comments || '[]'); } catch(e) { comments = []; }
    comments[idx] = { ...comments[idx], text: newText, edited: true };
    await api.put(tableType, fileId, { ...file, file_comments: JSON.stringify(comments) });
    _renderFdmComments(comments);
    toast('댓글이 수정되었습니다.', 'success');
  } catch(e) { toast('수정 오류', 'error'); }
}

/* 파일 목록 새로고침 (tableType에 따라 해당 뷰 갱신) */
async function _refreshFileList(tableType, parentId) {
  if (tableType === 'project_files' && parentId) await loadAndRenderProjFiles(parentId);
  else if (tableType === 'task_attachments' && parentId) {
    await doorayLoadFiles(parentId);
    // task 탭이 files면 loadAndRenderTaskFiles도 갱신
    if (typeof loadAndRenderTaskFiles === 'function') loadAndRenderTaskFiles(parentId);
  }
  else if (tableType === 'cloud_files') { await loadCloudFiles(); renderCloudQuota(); renderCloudFiles(); }
}

/* ============================================================
   클라우드 저장소 (CLOUD STORAGE)
   ============================================================ */
const CLOUD_MAX_BYTES = 100 * 1024 * 1024 * 1024; // 100 GB (표시용)
const CLOUD_UPLOAD_MAX = 100 * 1024 * 1024;        // 파일당 100 MB

let _cloudView = 'grid';   // 'grid' | 'list'
let _cloudSearch = '';
let _cloudCategory = 'all';
let _cloudFiles = [];       // 로컬 캐시

async function initCloudPage() {
  await loadCloudFiles();
  renderCloudQuota();
  renderCloudFiles();
  initCloudDrop();
}

async function loadCloudFiles() {
  try {
    const res = await api.get('cloud_files', 'limit=200&sort=created_at');
    _cloudFiles = res.data || [];
  } catch(e) { toast('클라우드 파일 로드 오류', 'error'); _cloudFiles = []; }
}

function renderCloudQuota() {
  // 직접 업로드 파일만 용량 계산 (링크 파일 제외)
  const uploadFiles = _cloudFiles.filter(f => !_isLinkFile(f));
  const used = uploadFiles.reduce((s, f) => s + (f.file_size_bytes || 0), 0);
  const pct  = Math.min(used / CLOUD_MAX_BYTES * 100, 100);
  const fill   = document.getElementById('cloud-quota-fill');
  const usedEl = document.getElementById('cloud-used-str');
  const maxEl  = document.getElementById('cloud-max-str');
  if (fill) {
    fill.style.width = pct + '%';
    fill.className = 'cloud-quota-fill' + (pct > 90 ? ' full' : pct > 70 ? ' warn' : '');
  }
  if (usedEl) usedEl.textContent = fmtSize(used);
  if (maxEl)  maxEl.textContent  = '100 GB';

  // 통계 카드 — 전체 항목 수
  const totalEl   = document.getElementById('cloud-stat-total');
  if (totalEl) totalEl.textContent = _cloudFiles.length + '개';

  // 통계 카드 — 이미지 (직접 업로드)
  const imgEl = document.getElementById('cloud-stat-img');
  if (imgEl) imgEl.textContent = uploadFiles.filter(f => f.category === '이미지').length + '개';

  // 통계 카드 — Google Drive 링크 수
  const gdriveEl = document.getElementById('cloud-stat-gdrive');
  if (gdriveEl) gdriveEl.textContent = _cloudFiles.filter(f => _getLinkSvc(f) === 'gdrive').length + '개';

  // 통계 카드 — Dropbox 링크 수
  const dropboxEl = document.getElementById('cloud-stat-dropbox');
  if (dropboxEl) dropboxEl.textContent = _cloudFiles.filter(f => _getLinkSvc(f) === 'dropbox').length + '개';
}

function renderCloudFiles() {
  let files = [..._cloudFiles];
  // 서비스 탭 필터
  if (_cloudServiceTab !== 'all') {
    if (_cloudServiceTab === 'upload') {
      files = files.filter(f => !_isLinkFile(f));
    } else {
      files = files.filter(f => _getLinkSvc(f) === _cloudServiceTab);
    }
  }
  if (_cloudSearch) {
    const q = _cloudSearch.toLowerCase();
    files = files.filter(f => (f.file_name||'').toLowerCase().includes(q) || (f.note||'').toLowerCase().includes(q));
  }
  if (_cloudCategory !== 'all') {
    files = files.filter(f => f.category === _cloudCategory);
  }
  const wrap = document.getElementById('cloud-files-wrap');
  if (!wrap) return;

  if (!files.length) {
    wrap.innerHTML = `<div class="cloud-empty">
      <i class="fas fa-folder-open"></i>
      <p>파일이 없습니다</p>
      <small>위 영역에 파일을 드래그&드롭하거나 클릭하여 업로드하세요</small>
    </div>`;
    return;
  }

  if (_cloudView === 'grid') {
    wrap.innerHTML = `<div class="cloud-files-grid">${files.map(f => _cloudFileCardHtml(f)).join('')}</div>`;
  } else {
    wrap.innerHTML = `<div class="cloud-files-list">${files.map(f => _cloudFileRowHtml(f)).join('')}</div>`;
  }
}

function _cloudFileCardHtml(f) {
  // 링크 파일
  if (_isLinkFile(f)) {
    const svc    = _getLinkSvc(f);
    const svcLbl = _getLinkSvcLabel(svc);
    const svcIcon = _getLinkSvcIcon(svc);
    return `<div class="cloud-file-card link-card svc-${svc}">
      <div style="font-size:36px;margin-bottom:8px;text-align:center">${svcIcon}</div>
      <span class="cloud-link-badge ${svc}">${svcLbl}</span>
      <div class="cfc-name" title="${escHtml(f.file_name||'')}">${escHtml(f.file_name||'링크')}</div>
      <div class="cfc-meta">${f.category||'기타'}${f.note ? ' · '+escHtml(f.note) : ''}</div>
      <div class="cfc-actions" style="margin-top:10px">
        <a class="cfc-open-btn ${svc}" href="${f.data_url||'#'}" target="_blank" rel="noopener">
          <i class="fas fa-external-link-alt"></i> 열기
        </a>
        <button class="cfc-del-btn" onclick="deleteCloudFile('${f.id}')"><i class="fas fa-trash"></i></button>
      </div>
    </div>`;
  }
  // 일반 업로드 파일
  const icon  = getFileIcon(f.file_type || '');
  const isImg = (f.file_type||'').startsWith('image/');
  const thumb = isImg
    ? `<img class="cfc-thumb" src="${f.data_url||''}" alt="${escHtml(f.file_name||'')}" onclick="openLightbox('${f.data_url||''}')"/>`
    : `<span class="cfc-icon">${icon}</span>`;
  let cfcCmtCount = 0;
  try { cfcCmtCount = JSON.parse(f.file_comments||'[]').length; } catch(e){}
  const cfcCmtBadge = cfcCmtCount > 0 ? `<span class="file-cmt-badge">${cfcCmtCount}</span>` : '';
  return `<div class="cloud-file-card">
    ${thumb}
    <div class="cfc-name" title="${escHtml(f.file_name||'')}">${escHtml(f.file_name||'파일')}</div>
    <div class="cfc-meta">${f.file_size_str||''} · ${f.category||'기타'}</div>
    ${f.file_desc||f.note ? `<div class="cfc-desc">${escHtml(f.file_desc||f.note||'')}</div>` : ''}
    <div class="cfc-actions">
      <a class="cfc-dl-btn dl-btn" href="${f.data_url||'#'}" download="${escHtml(f.file_name||'file')}"><i class="fas fa-download"></i> 받기</a>
      <button class="cfc-cmt-btn" onclick="openFileDetailModal('cloud_files','${f.id}','')" title="수정/댓글"><i class="fas fa-comment-alt"></i>${cfcCmtBadge}</button>
      <button class="cfc-del-btn" onclick="deleteCloudFile('${f.id}')"><i class="fas fa-trash"></i></button>
    </div>
  </div>`;
}

function _cloudFileRowHtml(f) {
  const dt = f.created_at ? new Date(+f.created_at).toLocaleDateString('ko-KR') : '—';
  // 링크 파일
  if (_isLinkFile(f)) {
    const svc    = _getLinkSvc(f);
    const svcLbl = _getLinkSvcLabel(svc);
    const svcIcon = _getLinkSvcIcon(svc);
    return `<div class="cloud-file-row">
      <span class="cfr-icon" style="font-size:24px">${svcIcon}</span>
      <div class="cfr-info">
        <div class="cfr-name">${escHtml(f.file_name||'링크')}
          <span class="cloud-link-badge ${svc}" style="margin-left:6px">${svcLbl}</span>
        </div>
        <div class="cfr-meta">${f.category||'기타'} · ${dt} · ${escHtml(f.uploader_name||'—')}${f.note ? ' · '+escHtml(f.note) : ''}</div>
      </div>
      <div class="cfr-actions">
        <a class="cfc-open-btn ${svc}" href="${f.data_url||'#'}" target="_blank" rel="noopener"><i class="fas fa-external-link-alt"></i> 열기</a>
        <button class="cfc-del-btn" onclick="deleteCloudFile('${f.id}')"><i class="fas fa-trash"></i></button>
      </div>
    </div>`;
  }
  // 일반 파일
  const icon  = getFileIcon(f.file_type || '');
  const isImg = (f.file_type||'').startsWith('image/');
  const iconHtml = isImg
    ? `<img class="cfr-thumb" src="${f.data_url||''}" alt="${escHtml(f.file_name||'')}" onclick="openLightbox('${f.data_url||''}')"/>`
    : `<span class="cfr-icon">${icon}</span>`;
  let cfrCmtCount = 0;
  try { cfrCmtCount = JSON.parse(f.file_comments||'[]').length; } catch(e){}
  const cfrCmtBadge = cfrCmtCount > 0 ? `<span class="file-cmt-badge">${cfrCmtCount}</span>` : '';
  return `<div class="cloud-file-row">
    ${iconHtml}
    <div class="cfr-info">
      <div class="cfr-name" title="${escHtml(f.file_name||'')}">${escHtml(f.file_name||'파일')}</div>
      <div class="cfr-meta">${f.file_size_str||''} · ${f.category||'기타'} · ${dt} · ${escHtml(f.uploader_name||'—')}</div>
      ${f.file_desc||f.note ? `<div class="cfr-desc">${escHtml(f.file_desc||f.note||'')}</div>` : ''}
    </div>
    <div class="cfr-actions">
      <a class="cfc-dl-btn dl-btn" href="${f.data_url||'#'}" download="${escHtml(f.file_name||'file')}"><i class="fas fa-download"></i> 다운로드</a>
      <button class="cfc-cmt-btn" onclick="openFileDetailModal('cloud_files','${f.id}','')" title="수정/댓글"><i class="fas fa-comment-alt"></i>${cfrCmtBadge}</button>
      <button class="cfc-del-btn" onclick="deleteCloudFile('${f.id}')"><i class="fas fa-trash"></i></button>
    </div>
  </div>`;
}

async function deleteCloudFile(id) {
  if (!confirm('이 파일을 삭제하시겠습니까?')) return;
  try {
    await api.del('cloud_files', id);
    _cloudFiles = _cloudFiles.filter(f => f.id !== id);
    renderCloudQuota();
    renderCloudFiles();
    toast('파일이 삭제되었습니다.', 'success');
  } catch(e) { toast('삭제 오류', 'error'); }
}

function setCloudView(type) {
  _cloudView = type;
  document.querySelectorAll('.cloud-view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === type);
  });
  renderCloudFiles();
}

function initCloudDrop() {
  const zone = document.getElementById('cloud-drop-zone');
  if (!zone) return;
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('drag-over');
    handleCloudUpload(e.dataTransfer.files);
  });
  zone.addEventListener('click', () => document.getElementById('cloud-file-input')?.click());
}

async function handleCloudUpload(files) {
  if (!files || !files.length) return;
  const fileArr = Array.from(files);
  let successCount = 0;
  let failCount = 0;

  for (const file of fileArr) {
    if (file.size > CLOUD_UPLOAD_MAX) {
      toast(`⚠️ ${file.name} — 파일 크기가 100MB를 초과합니다.`, 'error');
      failCount++;
      continue;
    }
    const usedNow = _cloudFiles.reduce((s,f) => s+(f.file_size_bytes||0), 0);
    if (usedNow + file.size > CLOUD_MAX_BYTES) {
      toast('저장소 용량이 부족합니다. (100GB 초과)', 'error');
      failCount++;
      continue;
    }
    // 진행 중 토스트
    if (file.size > 2 * 1024 * 1024) {
      toast(`⏳ "${file.name}" (${fmtSize(file.size)}) 변환 중...`, 'info');
    }
    try {
      const dataUrl  = await readFileAsDataUrl(file);
      const category = _detectCloudCategory(file.type);
      const payload  = {
        uploader_id:     State.owner.id   || 'm1',
        uploader_name:   State.owner.name || '—',
        file_name:       file.name,
        file_type:       file.type || 'application/octet-stream',
        file_size_bytes: file.size,
        file_size_str:   fmtSize(file.size),
        data_url:        dataUrl,
        category,
        note: '',
      };
      const newFile = await api.post('cloud_files', payload);
      if (!newFile || newFile.error) throw new Error(newFile?.error || 'API 오류');
      _cloudFiles.unshift(newFile);
      successCount++;
      renderCloudQuota();
      renderCloudFiles();
      toast(`✅ "${file.name}" 업로드 완료!`, 'success');
    } catch(e) {
      console.error('클라우드 업로드 실패:', file.name, e);
      toast(`❌ "${file.name}" 업로드 실패 — ${e.message||'서버 오류'}`, 'error');
      failCount++;
    }
  }
  if (fileArr.length > 1) {
    toast(`총 ${successCount}개 업로드 완료${failCount>0?' / '+failCount+'개 실패':''}`, successCount>0?'success':'error');
  }
}

/* ── 클라우드 서비스 탭 필터 ── */
let _cloudServiceTab = 'all';

function setCloudServiceTab(svc) {
  _cloudServiceTab = svc;
  document.querySelectorAll('.cloud-svc-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.svc === svc);
  });
  renderCloudFiles();
}

/* ── 링크 등록 모달 ── */
let _selectedLinkSvc = 'gdrive';

function openCloudLinkModal() {
  _selectedLinkSvc = 'gdrive';
  document.getElementById('cloud-link-url').value  = '';
  document.getElementById('cloud-link-name').value = '';
  document.getElementById('cloud-link-note').value = '';
  document.getElementById('cloud-link-type').value = '기타';
  document.getElementById('cloud-link-err').textContent = '';
  selectLinkSvc('gdrive');
  openModal('modal-cloud-link');
}

function selectLinkSvc(svc) {
  _selectedLinkSvc = svc;
  document.querySelectorAll('.cloud-link-svc-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.svc === svc)
  );
  ['gdrive','dropbox','link'].forEach(s => {
    const el = document.getElementById('clg-' + s);
    if (el) el.style.display = s === svc ? 'block' : 'none';
  });
  // URL placeholder 변경
  const urlInput = document.getElementById('cloud-link-url');
  if (urlInput) {
    if (svc === 'gdrive')   urlInput.placeholder = 'https://drive.google.com/file/d/...';
    if (svc === 'dropbox')  urlInput.placeholder = 'https://www.dropbox.com/s/...';
    if (svc === 'link')     urlInput.placeholder = 'https://...';
  }
}

async function saveCloudLink() {
  const url  = document.getElementById('cloud-link-url')?.value.trim();
  const name = document.getElementById('cloud-link-name')?.value.trim();
  const note = document.getElementById('cloud-link-note')?.value.trim();
  const type = document.getElementById('cloud-link-type')?.value || '기타';
  const err  = document.getElementById('cloud-link-err');

  if (!url)  { if(err) err.textContent = 'URL을 입력하세요.'; return; }
  if (!name) { if(err) err.textContent = '이름을 입력하세요.'; return; }
  if (!url.startsWith('http')) { if(err) err.textContent = 'http(s)://로 시작하는 URL을 입력하세요.'; return; }
  if (err) err.textContent = '';

  // 서비스 자동 감지
  let detectedSvc = _selectedLinkSvc;
  if (url.includes('drive.google.com'))  detectedSvc = 'gdrive';
  if (url.includes('dropbox.com'))       detectedSvc = 'dropbox';

  try {
    const newFile = await api.post('cloud_files', {
      uploader_id:   State.owner.id || 'm1',
      uploader_name: State.owner.name || '—',
      file_name:     name,
      file_type:     'link/' + detectedSvc,
      file_size_bytes: 0,
      file_size_str:   '링크',
      data_url:        url,
      category:        type,
      note:            note,
    });
    _cloudFiles.unshift(newFile);
    renderCloudQuota();
    renderCloudFiles();
    closeModal('modal-cloud-link');
    toast(`"${name}" 링크가 등록되었습니다.`, 'success');
  } catch(e) { toast('등록 오류', 'error'); }
}

function _isLinkFile(f) {
  return (f.file_type || '').startsWith('link/');
}
function _getLinkSvc(f) {
  return (f.file_type || '').replace('link/', '') || 'link';
}
function _getLinkSvcLabel(svc) {
  if (svc === 'gdrive')  return 'Google Drive';
  if (svc === 'dropbox') return 'Dropbox';
  return '외부 링크';
}
function _getLinkSvcIcon(svc) {
  if (svc === 'gdrive')  return '<img src="https://www.gstatic.com/images/branding/product/1x/drive_2020q4_32dp.png" style="width:20px;height:20px;vertical-align:middle" alt="Drive">';
  if (svc === 'dropbox') return '<img src="https://cfl.dropboxstatic.com/static/images/logo_catalog/dropbox_logo_glyph_m1.svg" style="width:20px;height:20px;vertical-align:middle" alt="Dropbox">';
  return '<i class="fas fa-link" style="color:var(--accent-teal)"></i>';
}

function _detectCloudCategory(mime) {
  if (mime.startsWith('image/')) return '이미지';
  if (mime.startsWith('video/')) return '영상';
  if (mime.startsWith('audio/')) return '오디오';
  if (mime.includes('pdf') || mime.includes('word') || mime.includes('sheet') || mime.includes('presentation') || mime.includes('text')) return '문서';
  return '기타';
}

/* ============================================================
   개인 프로젝트 (PERSONAL PROJECTS)
   ============================================================ */
const PERSONAL_PW_KEY = 'eclado_personal_pw';
let _personalUnlocked = false;
let _personalProjects = [];
let _personalPendingFiles = [];
let _editingPersonalId = null;
let _personalSearch = '';
let _personalStatusFilter = 'all';

const PP_COLORS = ['#1B3A6B','#4A90E2','#27AE60','#E67E22','#E74C3C','#8E44AD','#1ABC9C','#F39C12'];

function getPersonalPw() {
  return localStorage.getItem(PERSONAL_PW_KEY) || 'personal1234';
}

function unlockPersonal() {
  const input   = document.getElementById('personal-pw-input');
  const err     = document.getElementById('personal-pw-err');
  const layer   = document.getElementById('personal-lock-layer');
  const content = document.getElementById('personal-content');
  if (!input) return;
  const val = input.value;
  if (val === getPersonalPw()) {
    _personalUnlocked = true;
    if (layer)   layer.style.display   = 'none';
    if (content) content.style.display = 'block';
    input.value = '';
    if (err) err.textContent = '';
    loadPersonalProjects().then(() => { renderPersonalStats(); renderPersonalProjects(); });
  } else {
    if (err) err.textContent = '비밀번호가 올바르지 않습니다.';
    input.select();
  }
}

function lockPersonal() {
  _personalUnlocked = false;
  const layer   = document.getElementById('personal-lock-layer');
  const content = document.getElementById('personal-content');
  if (layer)   layer.style.display   = 'flex';
  if (content) content.style.display = 'none';
  toast('개인 프로젝트가 잠겼습니다.', 'info');
}

async function initPersonalPage() {
  const layer   = document.getElementById('personal-lock-layer');
  const content = document.getElementById('personal-content');
  if (!_personalUnlocked) {
    if (layer)   layer.style.display   = 'flex';
    if (content) content.style.display = 'none';
    return;
  }
  if (layer)   layer.style.display   = 'none';
  if (content) content.style.display = 'block';
  await loadPersonalProjects();
  renderPersonalStats();
  renderPersonalProjects();
}

async function loadPersonalProjects() {
  try {
    const res = await api.get('personal_projects', 'limit=200&sort=created_at');
    _personalProjects = (res.data || []).filter(p => p.owner_id === (State.owner.id || 'm1'));
  } catch(e) { toast('개인 프로젝트 로드 오류', 'error'); _personalProjects = []; }
}

function renderPersonalStats() {
  const total = _personalProjects.length;
  const inProg = _personalProjects.filter(p => p.status === 'in_progress').length;
  const done   = _personalProjects.filter(p => p.status === 'completed').length;
  const avg    = total ? Math.round(_personalProjects.reduce((s,p) => s+(p.progress||0), 0) / total) : 0;
  const els = {
    'personal-stat-total': total + '개',
    'personal-stat-inprog': inProg + '개',
    'personal-stat-done': done + '개',
    'personal-stat-progress': avg + '%',
  };
  Object.entries(els).forEach(([id,v]) => {
    const el = document.getElementById(id); if (el) el.textContent = v;
  });
}

function renderPersonalProjects() {
  let projs = [..._personalProjects];
  if (_personalSearch) {
    const q = _personalSearch.toLowerCase();
    projs = projs.filter(p => (p.title||'').toLowerCase().includes(q) || (p.description||'').toLowerCase().includes(q));
  }
  if (_personalStatusFilter !== 'all') {
    projs = projs.filter(p => p.status === _personalStatusFilter);
  }
  const grid = document.getElementById('personal-projects-grid');
  if (!grid) return;
  if (!projs.length) {
    grid.innerHTML = `<div class="personal-empty" style="grid-column:1/-1">
      <i class="fas fa-user-lock"></i>
      <p>개인 프로젝트가 없습니다</p>
      <small>우측 상단 버튼으로 첫 프로젝트를 추가하세요</small>
    </div>`;
    return;
  }
  grid.innerHTML = projs.map(p => _personalProjCardHtml(p)).join('');
}

function _personalProjCardHtml(p) {
  const statusLabel = STATUS_LABEL[p.status] || p.status || '—';
  const priorityLabel = PRIORITY_LABEL[p.priority] || p.priority || '—';
  const progress = p.progress || 0;
  const color = p.color || '#1B3A6B';
  const tags = p.tags ? p.tags.split(',').filter(Boolean) : [];
  const tagsHtml = tags.length
    ? `<div class="ppc-tags">${tags.map(t=>`<span class="ppc-tag">${escHtml(t.trim())}</span>`).join('')}</div>`
    : '';
  let filesHtml = '';
  try {
    const files = JSON.parse(p.files || '[]');
    if (files.length) {
      filesHtml = `<div class="ppc-files-row">${files.map(f=> {
        const isImg = (f.type||'').startsWith('image/');
        const dlAttr = f.data_url && f.data_url !== '#' ? `href="${f.data_url}" download="${escHtml(f.name||'file')}"` : 'href="#"';
        return `<span class="ppc-file-chip">
          <i class="fas ${getFileIcon(f.type||'')}"></i>
          <span class="ppc-file-name" title="${escHtml(f.label||f.name||'파일')}">${escHtml(f.label||f.name||'파일')}</span>
          <span class="ppc-file-size">${f.sizeStr||fmtSize(f.size||0)}</span>
          ${f.data_url ? `<a class="ppc-file-dl" ${dlAttr} title="다운로드"><i class="fas fa-download"></i></a>` : ''}
        </span>`;
      }).join('')}</div>`;
    }
  } catch(e) {}
  const dateStr = [p.start_date, p.end_date].filter(Boolean).join(' ~ ') || '';
  return `<div class="personal-proj-card status-${p.status||''}" style="border-left-color:${color}">
    <i class="fas fa-lock ppc-lock-icon" title="비밀번호 잠금"></i>
    <div class="ppc-header">
      <div class="ppc-title">${escHtml(p.title||'제목 없음')}</div>
    </div>
    <div class="ppc-badges">
      <span class="ppc-badge status-${p.status||''}">${statusLabel}</span>
      <span class="ppc-badge priority-${p.priority||''}">${priorityLabel}</span>
    </div>
    ${p.description ? `<div class="ppc-desc">${escHtml(p.description)}</div>` : ''}
    <div class="ppc-progress-wrap">
      <div class="ppc-progress-bar"><div class="ppc-progress-fill" style="width:${progress}%;background:${color}"></div></div>
      <div class="ppc-progress-label"><span>진행률</span><span>${progress}%</span></div>
    </div>
    ${tagsHtml}
    ${dateStr ? `<div class="ppc-meta"><i class="fas fa-calendar"></i> ${dateStr}</div>` : ''}
    ${filesHtml}
    <div class="ppc-actions">
      <button class="ppc-edit-btn" onclick="openPersonalProjectModal('${p.id}')"><i class="fas fa-pencil-alt"></i> 수정</button>
      <button class="ppc-del-btn" onclick="deletePersonalProject('${p.id}')"><i class="fas fa-trash"></i></button>
    </div>
  </div>`;
}

function openPersonalProjectModal(id) {
  _editingPersonalId = id || null;
  _personalPendingFiles = [];
  const modal = document.getElementById('modal-personal-project');
  const titleEl = document.getElementById('pp-modal-title');
  if (titleEl) titleEl.textContent = id ? '개인 프로젝트 수정' : '개인 프로젝트 추가';

  if (id) {
    const p = _personalProjects.find(x => x.id === id);
    if (p) {
      document.getElementById('pp-title').value        = p.title || '';
      document.getElementById('pp-desc').value         = p.description || '';
      document.getElementById('pp-status').value       = p.status || 'planning';
      document.getElementById('pp-priority').value     = p.priority || 'medium';
      document.getElementById('pp-start-date').value   = p.start_date || '';
      document.getElementById('pp-end-date').value     = p.end_date || '';
      document.getElementById('pp-tags').value         = p.tags || '';
      document.getElementById('pp-progress').value     = p.progress || 0;
      document.getElementById('pp-progress-val').textContent = (p.progress||0) + '%';
      _selectedPPColor = p.color || '#1B3A6B';
      // 기존 파일
      try {
        _personalPendingFiles = JSON.parse(p.files || '[]');
      } catch(e) { _personalPendingFiles = []; }
    }
  } else {
    document.getElementById('pp-title').value        = '';
    document.getElementById('pp-desc').value         = '';
    document.getElementById('pp-status').value       = 'planning';
    document.getElementById('pp-priority').value     = 'medium';
    document.getElementById('pp-start-date').value   = '';
    document.getElementById('pp-end-date').value     = '';
    document.getElementById('pp-tags').value         = '';
    document.getElementById('pp-progress').value     = 0;
    document.getElementById('pp-progress-val').textContent = '0%';
    _selectedPPColor = '#1B3A6B';
  }
  renderPPColorPicker();
  renderPPFilePreview();
  openModal('modal-personal-project');
  initPPDrop();
}

let _selectedPPColor = '#1B3A6B';

function renderPPColorPicker() {
  const row = document.getElementById('pp-color-row');
  if (!row) return;
  row.innerHTML = PP_COLORS.map(c =>
    `<div class="pp-color-swatch ${c===_selectedPPColor?'selected':''}" style="background:${c}" onclick="selectPPColor('${c}')"></div>`
  ).join('');
}

function selectPPColor(c) {
  _selectedPPColor = c;
  renderPPColorPicker();
}

function initPPDrop() {
  const zone = document.getElementById('pp-attach-zone');
  if (!zone || zone._ppDropInited) return;
  zone._ppDropInited = true;
  // 클릭으로 파일 선택
  zone.addEventListener('click', () => document.getElementById('pp-file-input')?.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('drag-over');
    handlePPFileSelect({ target: { files: e.dataTransfer.files } });
  });
}

async function handlePPFileSelect(event) {
  const files = event.target?.files || event.dataTransfer?.files;
  if (!files) return;
  for (const file of Array.from(files)) {
    if (file.size > CLOUD_UPLOAD_MAX) { toast(`${file.name} — 100MB 초과`, 'error'); continue; }
    if (file.size > 2*1024*1024) toast(`⏳ "${file.name}" 압축 중...`, 'info');
    try {
      const dataUrl = await compressFileForUpload(file);
      _personalPendingFiles.push({ name: file.name, size: file.size, sizeStr: fmtSize(file.size), type: file.type, data_url: dataUrl });
      renderPPFilePreview();
    } catch(e) { toast(`❌ "${file.name}" 읽기 오류`, 'error'); }
  }
}

function renderPPFilePreview() {
  const preview = document.getElementById('pp-file-preview');
  if (!preview) return;
  if (!_personalPendingFiles.length) { preview.innerHTML = ''; return; }
  preview.innerHTML = _personalPendingFiles.map((f,i) => {
    const isImg = (f.type||'').startsWith('image/');
    const thumbHtml = isImg && f.data_url
      ? `<img src="${f.data_url}" class="pfi-thumb-img" alt="${escHtml(f.name)}" onclick="openLightbox('${f.data_url}')" style="cursor:pointer">`
      : `<span class="pfi-icon"><i class="fas ${getFileIcon(f.type||'')}"></i></span>`;
    // 표시 제목: label이 있으면 사용, 없으면 원본 파일명
    const labelVal = escHtml(f.label || f.name || '');
    return `<div class="pp-file-item" data-idx="${i}">
       ${thumbHtml}
       <div class="pfi-info">
         <input class="pfi-label-input form-control"
           type="text"
           placeholder="파일 제목 입력"
           value="${labelVal}"
           oninput="updatePPFileLabel(${i}, this.value)"
           title="파일에 표시될 제목 (수정 가능)" />
         <span class="pfi-size">${f.sizeStr||fmtSize(f.size||0)}</span>
       </div>
       <a class="pfi-dl btn btn-ghost btn-sm" href="${f.data_url||'#'}" download="${escHtml(f.name)}" title="다운로드"><i class="fas fa-download"></i></a>
       <button class="pfi-del btn btn-sm" onclick="removePPFile(${i})" title="제거" style="color:#E74C3C;background:transparent;border:none;padding:4px 8px"><i class="fas fa-times"></i></button>
     </div>`;
  }).join('');
}

function updatePPFileLabel(idx, value) {
  if (_personalPendingFiles[idx] !== undefined) {
    _personalPendingFiles[idx].label = value;
  }
}

function removePPFile(idx) {
  _personalPendingFiles.splice(idx, 1);
  renderPPFilePreview();
}

async function savePersonalProject() {
  const title = document.getElementById('pp-title')?.value.trim();
  if (!title) { toast('제목을 입력하세요.', 'error'); return; }
  const data = {
    owner_id:   State.owner.id || 'm1',
    title,
    description: document.getElementById('pp-desc')?.value.trim() || '',
    status:   document.getElementById('pp-status')?.value || 'planning',
    priority: document.getElementById('pp-priority')?.value || 'medium',
    start_date: document.getElementById('pp-start-date')?.value || '',
    end_date:   document.getElementById('pp-end-date')?.value || '',
    tags:       document.getElementById('pp-tags')?.value.trim() || '',
    progress:   parseInt(document.getElementById('pp-progress')?.value) || 0,
    color:      _selectedPPColor,
    files:      JSON.stringify(_personalPendingFiles),
  };
  try {
    let saved;
    if (_editingPersonalId) {
      saved = await api.put('personal_projects', _editingPersonalId, data);
      const idx = _personalProjects.findIndex(p => p.id === _editingPersonalId);
      if (idx !== -1) _personalProjects[idx] = saved;
      toast('프로젝트가 수정되었습니다.', 'success');
    } else {
      saved = await api.post('personal_projects', data);
      _personalProjects.unshift(saved);
      toast('프로젝트가 추가되었습니다.', 'success');
    }
    closeModal('modal-personal-project');
    renderPersonalStats();
    renderPersonalProjects();
  } catch(e) { toast('저장 오류', 'error'); }
}

async function deletePersonalProject(id) {
  if (!confirm('이 프로젝트를 삭제하시겠습니까?')) return;
  try {
    await api.del('personal_projects', id);
    _personalProjects = _personalProjects.filter(p => p.id !== id);
    renderPersonalStats();
    renderPersonalProjects();
    toast('삭제되었습니다.', 'success');
  } catch(e) { toast('삭제 오류', 'error'); }
}

function openPersonalPwChangeModal() {
  document.getElementById('pp-pw-current')?.value && (document.getElementById('pp-pw-current').value = '');
  document.getElementById('pp-pw-new')?.value    && (document.getElementById('pp-pw-new').value = '');
  document.getElementById('pp-pw-confirm')?.value && (document.getElementById('pp-pw-confirm').value = '');
  document.getElementById('pp-pw-err') && (document.getElementById('pp-pw-err').textContent = '');
  openModal('modal-personal-pw');
}

function savePersonalPwChange() {
  const cur     = document.getElementById('pp-pw-current')?.value || '';
  const newPw   = document.getElementById('pp-pw-new')?.value || '';
  const confirm2= document.getElementById('pp-pw-confirm')?.value || '';
  const err     = document.getElementById('pp-pw-err');
  if (cur !== getPersonalPw()) { if (err) err.textContent = '현재 비밀번호가 올바르지 않습니다.'; return; }
  if (!newPw)    { if (err) err.textContent = '새 비밀번호를 입력하세요.'; return; }
  if (newPw !== confirm2) { if (err) err.textContent = '새 비밀번호가 일치하지 않습니다.'; return; }
  localStorage.setItem(PERSONAL_PW_KEY, newPw);
  closeModal('modal-personal-pw');
  toast('비밀번호가 변경되었습니다.', 'success');
}

function resetPersonalPw() {
  if (!confirm('비밀번호를 초기값(personal1234)으로 초기화하시겠습니까?')) return;
  localStorage.removeItem(PERSONAL_PW_KEY);
  closeModal('modal-personal-pw');
  toast('비밀번호가 초기화되었습니다. (personal1234)', 'info');
}

/* ============================================================
   모바일 메신저 뒤로가기
   ============================================================ */
function closeMobileChat() {
  State.currentRoomId = null;
  const msnSidebar = document.querySelector('.messenger-sidebar');
  const chatMain   = document.getElementById('messenger-main');
  if (msnSidebar) msnSidebar.style.display = '';
  if (chatMain)   chatMain.style.display   = 'none';
  renderMessenger();
}

/* ============================================================  INIT  ============================================================ */
async function init() {
  await loadOwnerFromStorage(); // 서버에서 오너 프로필 로드 (모든 기기 동기화)
  applyLogoConfig(loadLogoConfig());
  updateNotifyBellIcon(loadNotifyConfig());
  bindEvents();

  // 로그인 오버레이 먼저 표시 (position:fixed로 변경되어 body 고정 불필요)
  const overlay = document.getElementById('login-overlay');
  if (overlay) overlay.classList.remove('hidden');
  // body.login-open은 overflow:hidden만 적용 (position:fixed 제거로 모바일 렌더링 버그 해결)
  document.body.classList.add('login-open');

  // 서버에서 비밀번호 로드 (모든 기기 동기화) — 완료 후 로그인 활성화
  await loadCredentials();

  initLogin();
  // loadAll은 로그인 성공 후 handleLogin()에서 호출
}

document.addEventListener('DOMContentLoaded', init);

/* ── 모바일 키보드 대응: 입력 포커스 시 해당 필드가 보이도록 스크롤 ── */
document.addEventListener('focusin', e => {
  const tag = e.target.tagName;
  if (tag !== 'INPUT' && tag !== 'TEXTAREA' && e.target.contentEditable !== 'true') return;

  const overlay = document.getElementById('login-overlay');
  const inLogin = overlay && !overlay.classList.contains('hidden') && overlay.contains(e.target);

  // 로그인 overlay: position:fixed로 변경되어 별도 스크롤 처리 불필요
  if (!inLogin) {
    setTimeout(() => {
      try {
        e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch(_) {}
    }, 300);
  }
});
