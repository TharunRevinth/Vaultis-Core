const SUPABASE_URL = 'https://addghapkcuhowzxkmtdh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkZGdoYXBrY3Vob3d6eGttdGRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3NzcyOTYsImV4cCI6MjA5MDM1MzI5Nn0._fpsJ7DRlM6uv9ZEuUSQ8mgouVBoHgX_AmHJ-4aKhWw';
let supabaseClient, engine, isAdmin = false, spendChart = null, myAccNo = null, originalAccNo = null, assistedUserId = null, assistedAccNo = null, bridgeInterval = null, lastSignalId = null, currentDisplayStatus = null, currentTransactions = [], currentPage = 1;
let create_account_func, deposit_func, withdraw_func, get_total_money_func, clear_system_func, get_below_threshold_count_func;

document.addEventListener('DOMContentLoaded', async () => {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    showView('landing-view');
    initWasm();
});

function initWasm() {
    if (typeof VitaBankEngine !== 'undefined') {
        VitaBankEngine().then(i => {
            engine = i;
            create_account_func = i.cwrap('create_account', 'number', ['number', 'string', 'number']);
            deposit_func = i.cwrap('deposit', 'number', ['number', 'number']);
            withdraw_func = i.cwrap('withdraw', 'number', ['number', 'number']);
            get_total_money_func = i.cwrap('get_total_money', 'number', []);
            get_below_threshold_count_func = i.cwrap('get_below_threshold_count', 'number', ['number']);
            clear_system_func = i.cwrap('clear_system', null, []);
        });
    }
}

function showToast(msg, type = 'success') {
    const c = document.getElementById('toast-container'); if (!c) return;
    const t = document.createElement('div'); t.className = `toast ${type}`;
    t.style.background = type === 'success' ? '#10b981' : '#ed1c24'; t.style.padding = '12px 20px'; t.style.color = 'white'; t.style.borderRadius = '4px'; t.style.marginBottom = '10px';
    t.innerHTML = msg;
    c.appendChild(t); setTimeout(() => t.remove(), 4000);
}

function toggleAuth(type) {
    const modal = document.getElementById('auth-modal');
    modal.classList.remove('hidden');
    document.getElementById('auth-register-box').classList.toggle('hidden', type !== 'register');
    const forgotBox = document.getElementById('auth-forgot-box');
    if (forgotBox) forgotBox.classList.toggle('hidden', type !== 'forgot');
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const pass = document.getElementById('login-password').value;
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: pass });
    if (!error) initDashboard(data.user); else showToast(error.message, "error");
}

async function handleRegister(e) {
    e.preventDefault();
    const name = document.getElementById('reg-name').value.trim(), email = document.getElementById('reg-email').value.trim(), pass = document.getElementById('reg-password').value, pin = document.getElementById('reg-pin').value;
    const offlineAccId = document.getElementById('reg-offline-acc').value.trim();

    if (offlineAccId) {
        const { data: existing, error: checkErr } = await supabaseClient.from('accounts').select('*').eq('acc_no', parseInt(offlineAccId)).maybeSingle();
        if (!existing || existing.user_id) return showToast("Invalid or already linked Terminal Account.", "error");
        if (existing.temp_pin !== pin) return showToast("Terminal Account PIN mismatch. Please confirm your pin.", "error");
    }

    const { data, error } = await supabaseClient.auth.signUp({ email, password: pass, options: { data: { full_name: name, pin: pin } } });
    if (error) return showToast(error.message, "error");

    if (offlineAccId) {
        await supabaseClient.from('accounts').update({ user_id: data.user.id, name: name, temp_pin: null }).eq('acc_no', parseInt(offlineAccId));
    } else {
        const accNo = Math.floor(100000 + Math.random() * 900000);
        await supabaseClient.from('accounts').insert([{ acc_no: accNo, user_id: data.user.id, name: name, balance: 500 }]);
    }
    showToast("Registration Secure. Welcome.");
    setTimeout(() => location.reload(), 1500);
}

async function handleForgotPassword(e) {
    e.preventDefault();
    const email = document.getElementById('forgot-email').value.trim();
    const pin = document.getElementById('forgot-pin').value;
    const newPass = document.getElementById('forgot-new-pass').value;

    const { data, error } = await supabaseClient.rpc('reset_password_with_pin', {
        user_email: email,
        p_pin: pin,
        new_password: newPass
    });

    if (!error) {
        showToast("Password updated successfully.", "success");
        closeModal('auth-modal');
    } else {
        showToast(error.message || "Failed to update password.", "error");
    }
}

async function updateStats(user) {
    const { data: acc } = await supabaseClient.from('accounts').select('acc_no').eq('user_id', user.id).maybeSingle();
    if (!acc) return;
    const myAccNo = acc.acc_no;

    const { data: txs } = await supabaseClient.from('transactions').select('amount').eq('acc_no', myAccNo);
}

async function initDashboard(user) {
    const { data: p } = await supabaseClient.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (p) {
        const newCode = Math.floor(100000 + Math.random() * 900000).toString();
        await supabaseClient.from('profiles').update({ help_code: newCode }).eq('id', user.id);
        p.help_code = newCode;
        isAdmin = p.is_admin || (user.email === 'alpha14@gmail.com');
        if (isAdmin) document.getElementById('nav-society-reports')?.classList.remove('hidden');
        document.getElementById('display-user').textContent = (isAdmin ? "[MANAGER] " : "") + p.full_name;
        document.getElementById('support-token-display').textContent = p.help_code;
        setupBridgeListener(user.id);
    }
    showView('dashboard-view'); switchSubView('summary'); syncFromCloud();
}

function showView(id) {
    document.getElementById('landing-view').classList.toggle('hidden', id === 'dashboard-view');
    document.getElementById('dashboard-view').classList.toggle('hidden', id === 'landing-view');
}

async function switchSubView(id) {
    document.querySelectorAll('.sub-view').forEach(v => v.classList.remove('active'));
    const t = document.getElementById('view-' + id); if (t) t.classList.add('active');
    document.querySelectorAll('.nav-item').forEach(i => { i.classList.remove('active'); if (i.getAttribute('onclick')?.includes(`'${id}'`)) i.classList.add('active'); });
}

function handleLogout() {
    supabaseClient.auth.signOut().then(() => {
        sessionStorage.clear();
        location.reload();
    });
}

function openModal(id) { document.getElementById(id)?.classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id)?.classList.add('hidden'); }

async function requestAdminAssistance(tId, tAcc) {
    document.getElementById('assisting-target-id-display').textContent = tAcc;
    assistedUserId = tId;
    assistedAccNo = tAcc;
    document.getElementById('sidebar-consent-code').value = '';
    openModal('assistanceModal');
}

async function confirmAssistance() {
    const code = document.getElementById('sidebar-consent-code').value.trim();
    const { data: p } = await supabaseClient.from("profiles").select("help_code, full_name").eq("id", assistedUserId).maybeSingle();
    if (p && code === p.help_code) {
        showToast("Connected to " + p.full_name);
        setupBridgeListener(assistedUserId);
        closeModal('assistanceModal');
        await syncFromCloud();
        switchSubView('summary');
    } else {
        showToast("Invalid Code", "error");
    }
}

async function terminateAssistance() { assistedUserId = null; assistedAccNo = null; await syncFromCloud(); }

async function syncFromCloud() {
    if (!engine) return;
    const { data: authData, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !authData.user) return;
    const user = authData.user;

    clear_system_func();
    const { data: accounts, error: accError } = await supabaseClient.from('accounts').select('*');
    if (accError) { console.error("Accounts Fetch Error:", accError); return; }

    const tb = document.getElementById('portfolio-table-body'); if (tb) tb.innerHTML = '';

    document.getElementById('assisting-badge').classList.toggle('hidden', !assistedUserId);
    document.getElementById('terminate-assist-btn').classList.toggle('hidden', !assistedUserId);
    document.getElementById('manager-handshake-card')?.classList.toggle('hidden', !assistedUserId);

    if (accounts) {
        accounts.forEach(acc => {
            create_account_func(acc.acc_no, acc.name, acc.balance);
            const isThisAssisted = assistedUserId && acc.user_id === assistedUserId;
            if (isAdmin || acc.user_id === user.id || isThisAssisted) {
                const row = tb.insertRow();
                let statusContent = '';
                if (isAdmin && acc.user_id !== user.id && !assistedUserId) {
                    statusContent = `<span style="font-size:0.75rem; color:#64748b; font-weight:800; vertical-align:middle;">Institutional</span> <button class="btn-assist" onclick="requestAdminAssistance('${acc.user_id}', ${acc.acc_no})">ASSIST</button>`;
                } else if (isThisAssisted) {
                    statusContent = `<span class="badge-red" style="margin:0">AUTHORIZED PENDING</span>`;
                } else {
                    statusContent = `<span class="badge-verified">Verified</span>`;
                }
                row.innerHTML = `<td>Savings</td><td>${acc.acc_no}</td><td>${statusContent}</td><td style="text-align:right">₹${acc.balance.toLocaleString('en-IN')}</td>`;
            }
            if (acc.user_id === (assistedUserId || user.id)) { if (!assistedUserId) originalAccNo = acc.acc_no; myAccNo = acc.acc_no; document.getElementById('client-id-tag').textContent = myAccNo; document.getElementById('total-balance').textContent = `₹${acc.balance.toLocaleString('en-IN')}`; }
        });

        if (isAdmin && get_total_money_func) {
            const totMoney = get_total_money_func();
            const lowBal = get_below_threshold_count_func(500);
            document.getElementById('total-liquidity-display').textContent = `₹${totMoney.toLocaleString('en-IN')}`;
            document.getElementById('low-balance-count-display').textContent = lowBal;
        }
    }
    const { data: trans, error: transError } = await supabaseClient.from('transactions').select('*').order('created_at', { ascending: true });
    if (transError) console.error("Transactions Fetch Error:", transError);
    currentTransactions = trans || [];
    applyHistoryFilter();
    renderAnalytics(currentTransactions);
}


function renderAnalytics(tr) {
    const myT = tr.filter(t => t.acc_no === myAccNo);
    let inflow = 0, outflow = 0; myT.forEach(t => { if (t.amount > 0) inflow += t.amount; else outflow += Math.abs(t.amount); });
    document.getElementById('monthly-inflow').textContent = `₹${inflow.toLocaleString()}`;
    document.getElementById('monthly-outflow').textContent = `₹${outflow.toLocaleString()}`;
    const ctx = document.getElementById('spendChart')?.getContext('2d');
    if (ctx) { if (spendChart) spendChart.destroy(); spendChart = new Chart(ctx, { type: 'bar', data: { labels: myT.map(t => new Date(t.created_at).toLocaleDateString()), datasets: [{ data: myT.map(t => t.amount), backgroundColor: myT.map(t => t.amount > 0 ? '#10b981' : '#ed1c24') }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } }); }
}

let filteredTransactions = [];
function applyHistoryFilter() {
    const sDate = document.getElementById('hist-start')?.value;
    const eDate = document.getElementById('hist-end')?.value;
    let myT = currentTransactions.filter(t => t.acc_no === myAccNo).reverse();
    if (sDate) { const sd = new Date(sDate).getTime(); myT = myT.filter(t => new Date(t.created_at).getTime() >= sd); }
    if (eDate) { const ed = new Date(eDate).getTime() + 86400000; myT = myT.filter(t => new Date(t.created_at).getTime() <= ed); }
    filteredTransactions = myT;
    currentPage = 1;
    renderTransactions();
}
function changePage(dir) {
    const maxPage = Math.ceil(filteredTransactions.length / 5) || 1;
    currentPage += dir;
    if (currentPage < 1) currentPage = 1;
    if (currentPage > maxPage) currentPage = maxPage;
    renderTransactions();
}
function renderTransactions() {
    const tbody = document.getElementById('recent-transactions-table-body'); if (!tbody) return;
    tbody.innerHTML = '';
    const maxPage = Math.ceil(filteredTransactions.length / 5) || 1;
    const pageInd = document.getElementById('page-indicator');
    if (pageInd) pageInd.textContent = `Page ${currentPage} of ${maxPage}`;
    const startIdx = (currentPage - 1) * 5;
    const pageT = filteredTransactions.slice(startIdx, startIdx + 5);
    pageT.forEach(t => { const row = tbody.insertRow(); row.innerHTML = `<td>${new Date(t.created_at).toLocaleDateString()}</td><td>${t.description}</td><td style="text-align:right; color:${t.amount < 0 ? 'red' : 'green'}">₹${Math.abs(t.amount).toLocaleString()}</td>`; });
}

function setupBridgeListener(uId) {
    supabaseClient.channel(`bridge-${uId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'handshake_signals', filter: `member_id=eq.${uId}` }, p => handleHandshakeSignal(p.new || p.old)).subscribe();
    setInterval(async () => { const { data } = await supabaseClient.from('handshake_signals').select('*').eq('member_id', uId).order('created_at', { ascending: false }).limit(1).maybeSingle(); handleHandshakeSignal(data); }, 5000);
}

function handleHandshakeSignal(sig) {
    const pane = document.getElementById('handshake-sig-pane'); if (!pane) return;
    if (sig && sig.status === 'REQUESTED') {
        pane.innerHTML = `<div class="sidebar-card" style="border:1px solid var(--bank-red);"><p style="font-weight:700;margin-bottom:10px;">Manager Priority Connect</p><div style="display:flex;gap:10px;"><button class="btn-bank btn-navy" style="flex:1;" onclick="respondToHandshake(true)">ALLOW</button><button class="btn-bank btn-outline" style="flex:1;" onclick="respondToHandshake(false)">REJECT</button></div></div>`;
    } else if (sig && sig.status === 'AUTHORIZED') {
        pane.innerHTML = `<div class="sidebar-card" style="border:1px solid #10b981;"><p>Support Identity Auto-Generated</p><h2 class="session-code">${sig.recovery_token}</h2><p style="font-size:0.7rem;">Provide to agent.</p></div>`;
    } else {
        pane.innerHTML = '';
    }
}

async function requestSecurityHandshake() {
    if (!assistedUserId) return;
    const { data: { user } } = await supabaseClient.auth.getUser();
    await supabaseClient.from('handshake_signals').delete().eq('member_id', assistedUserId);
    const { error } = await supabaseClient.from('handshake_signals').insert([{ member_id: assistedUserId, manager_id: user.id, status: 'REQUESTED' }]);
    if (error) showToast("Error: " + error.message, "error");
    else showToast("Handshake sent.");
}

async function respondToHandshake(auth) {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const stat = auth ? 'AUTHORIZED' : 'DENIED', tok = auth ? Math.floor(1000 + Math.random() * 9000).toString() : null;
    const { data: sig } = await supabaseClient.from('handshake_signals').select('id').eq('member_id', user.id).eq('status', 'REQUESTED').order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (sig) {
        const { error } = await supabaseClient.from('handshake_signals').update({ status: stat, recovery_token: tok }).eq('id', sig.id);
        if (!error) {
            showToast(auth ? "Identity Handshake Authorized." : "Access Denied.");
            const { data } = await supabaseClient.from('handshake_signals').select('*').eq('id', sig.id).maybeSingle();
            handleHandshakeSignal(data);
        } else {
            showToast(error.message, "error");
        }
    }
}

async function updateProfile(e) { e.preventDefault(); const n = document.getElementById('prof-name').value; const { data: { user } } = await supabaseClient.auth.getUser(); await supabaseClient.from('profiles').update({ full_name: n }).eq('id', user.id); showToast("Updated."); }
async function updatePin(event) { event.preventDefault(); const newPin = document.getElementById('prof-pin').value; if (newPin.length !== 4) return showToast("PIN must be 4 digits", "error"); requestPINAuthorization(async () => { const tgt = assistedUserId || (await supabaseClient.auth.getUser()).data.user.id; const { error } = await supabaseClient.from('profiles').update({ pin: newPin }).eq('id', tgt); if (!error) { showToast("PIN Updated"); if (assistedUserId) await supabaseClient.from('handshake_signals').delete().eq('member_id', assistedUserId); } else showToast(error.message, "error"); }); }
async function requestPINAuthorization(cb) {
    document.getElementById('auth-pin-input').value = '';
    if (assistedUserId) {
        document.getElementById('pin-modal-title').textContent = 'ADMIN OVERRIDE VERIFICATION';
        document.getElementById('auth-desc').textContent = 'Enter the 4-Digit Temporary PIN retrieved from the secure member handshake to authorize this transaction.';
        document.getElementById('auth-pin-input').placeholder = 'Temp PIN';
    } else {
        document.getElementById('pin-modal-title').textContent = 'AUTHORIZATION';
        document.getElementById('auth-desc').textContent = 'Confirm Secure PIN to proceed.';
        document.getElementById('auth-pin-input').placeholder = '••••';
    }
    openModal('pinModal');
    document.getElementById('pin-confirm-btn').onclick = async () => { const v = document.getElementById('auth-pin-input').value; if (assistedUserId) { const { data: sig } = await supabaseClient.from('handshake_signals').select('recovery_token').eq('member_id', assistedUserId).eq('status', 'AUTHORIZED').order('created_at', { ascending: false }).limit(1).maybeSingle(); if (sig && v === sig.recovery_token) { closeModal('pinModal'); await cb(); } else showToast("INVALID TOKEN.", "error"); } else { const { data: { user } } = await supabaseClient.auth.getUser(); const { data: profile } = await supabaseClient.from('profiles').select('pin').eq('id', user.id).maybeSingle(); if (profile && v === profile.pin) { closeModal('pinModal'); await cb(); } else showToast("INVALID PIN.", "error"); } };
}
async function handleOp(event, type) { event.preventDefault(); const amt = parseFloat(new FormData(event.target).get('amount')); requestPINAuthorization(async () => { const result = type === 'deposit' ? deposit_func(myAccNo, amt) : withdraw_func(myAccNo, amt); if (result >= 0) { await supabaseClient.from('accounts').update({ balance: result }).eq('acc_no', myAccNo); const uId = assistedUserId || (await supabaseClient.auth.getUser()).data.user.id; const desc = type.toUpperCase() + (assistedUserId ? ' (MANAGER)' : ''); await supabaseClient.from('transactions').insert([{ acc_no: myAccNo, description: desc, amount: type === 'deposit' ? amt : -amt, status: 'SUCCESS', user_id: uId }]); if (assistedUserId) await supabaseClient.from('handshake_signals').delete().eq('member_id', assistedUserId); showToast("SUCCESS."); await syncFromCloud(); switchSubView('summary'); } else showToast("Denied.", "error"); }); }
async function handleTransfer(event) { event.preventDefault(); const amt = parseFloat(document.getElementById('trans-amount').value), destAcc = parseInt(document.getElementById('trans-dest-acc').value); requestPINAuthorization(async () => { const { error } = await supabaseClient.rpc('transfer_funds', { sender_acc: myAccNo, receiver_acc: destAcc, amount_val: amt }); if (!error) { if (assistedUserId) await supabaseClient.from('handshake_signals').delete().eq('member_id', assistedUserId); showToast("SUCCESS."); await syncFromCloud(); switchSubView('summary'); } else showToast(error.message, "error"); }); }
async function handlePasswordUpdate(e) { e.preventDefault(); const newPass = document.getElementById('prof-new-pass').value; requestPINAuthorization(async () => { if (assistedUserId) { showToast("Admin Password Override Requested."); if (assistedUserId) await supabaseClient.from('handshake_signals').delete().eq('member_id', assistedUserId); } else { const { error } = await supabaseClient.auth.updateUser({ password: newPass }); if (!error) showToast("Updated"); else showToast(error.message, "error"); } }); }
