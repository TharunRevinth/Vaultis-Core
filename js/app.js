const SUPABASE_URL = 'https://addghapkcuhowzxkmtdh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkZGdoYXBrY3Vob3d6eGttdGRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3NzcyOTYsImV4cCI6MjA5MDM1MzI5Nn0._fpsJ7DRlM6uv9ZEuUSQ8mgouVBoHgX_AmHJ-4aKhWw';
let supabaseClient, engine, isAdmin=false, spendChart=null, myAccNo=null, originalAccNo=null, assistedUserId=null, lastSignalId=null, currentDisplayStatus=null, currentTransactions=[], currentPage=1;
let create_account_func, deposit_func, withdraw_func, get_total_money_func, get_below_threshold_count_func, clear_system_func;

document.addEventListener('DOMContentLoaded', async () => {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    showView('landing-view');
    initWasm();
});

function initWasm() {
    if (typeof VitaBankEngine !== 'undefined') {
        VitaBankEngine().then(i => {
            engine=i;
            create_account_func=i.cwrap('create_account','number',['number','string','number']);
            deposit_func=i.cwrap('deposit','number',['number','number']);
            withdraw_func=i.cwrap('withdraw','number',['number','number']);
            get_total_money_func=i.cwrap('get_total_money','number',[]);
            get_below_threshold_count_func=i.cwrap('get_below_threshold_count','number',['number']);
            clear_system_func=i.cwrap('clear_system',null,[]);
        });
    }
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container'); if (!container) return;
    const toast = document.createElement('div'); toast.className = `toast ${type}`;
    toast.style.background = type === 'success' ? '#10b981' : '#ed1c24';
    toast.style.padding = '12px 20px'; toast.style.color = 'white'; toast.style.borderRadius = '4px'; toast.style.marginBottom = '10px';
    toast.innerHTML = message;
    container.appendChild(toast); setTimeout(() => toast.remove(), 4000);
}

function toggleAuth(type) {
    openModal('auth-modal');
    document.getElementById('auth-login-box').classList.toggle('hidden', type==='register');
    document.getElementById('auth-register-box').classList.toggle('hidden', type==='login');
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    const {data,error}=await supabaseClient.auth.signInWithPassword({email, password:pass});
    if(!error) { closeModal('auth-modal'); initDashboard(data.user); } else showToast(error.message,"error");
}

async function handleRegister(event) {
    event.preventDefault();
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const pin = document.getElementById('reg-pin').value;
    const { data, error } = await supabaseClient.auth.signUp({ email, password, options: { data: { full_name: name, pin: pin } } });
    if (error) { showToast(error.message, "error"); return; }
    const accNo = Math.floor(100000 + Math.random() * 900000);
    await supabaseClient.from('accounts').insert([{ acc_no: accNo, user_id: data.user.id, name: name, balance: 500 }]);
    await supabaseClient.from('transactions').insert([{ acc_no: accNo, user_id: data.user.id, description: 'OPENING', amount: 500, status: 'SUCCESS' }]);
    location.reload();
}

async function initDashboard(user) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    await supabaseClient.from('profiles').update({ help_code: code }).eq('id', user.id);
    const { data: profile } = await supabaseClient.from('profiles').select('*').eq('id', user.id).single();
    if (profile) {
        isAdmin = profile.is_admin || (user.email === 'alpha14@gmail.com');
        document.getElementById('display-user').textContent = (isAdmin ? "[MANAGER] " : "") + profile.full_name;
        document.getElementById('support-token-display').textContent = profile.help_code;
        if (isAdmin) document.getElementById('admin-only-nav').classList.remove('hidden');
        setupBridgeListener(user.id);
    }
    showView('dashboard-view'); switchSubView('summary'); syncFromCloud();
}

function showView(id) {
    document.getElementById('landing-view').classList.toggle('hidden', id==='dashboard-view');
    document.getElementById('dashboard-view').classList.toggle('hidden', id === 'landing-view');
}

async function switchSubView(id) {
    document.querySelectorAll('.sub-view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById('view-' + id); if(target) target.classList.add('active');
    document.querySelectorAll('.nav-item').forEach(i => { i.classList.remove('active'); if (i.getAttribute('onclick')?.includes(`'${id}'`)) i.classList.add('active'); });
    if(id === 'reports' && isAdmin) refreshReports();
}

async function respondToHandshake(authorized) {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const newStatus = authorized ? 'AUTHORIZED' : 'DENIED', tempToken = authorized ? Math.floor(1000 + Math.random() * 9000).toString() : null;
    const { data: signal } = await supabaseClient.from('handshake_signals').select('id').eq('member_id', user.id).eq('status', 'REQUESTED').order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (signal) {
        await supabaseClient.from('handshake_signals').update({ status: newStatus, recovery_token: tempToken }).eq('id', signal.id);
        currentDisplayStatus = newStatus; updateNotificationPane(newStatus, tempToken);
    }
}

function handleHandshakeSignal(signal) {
    if (!signal) { if (currentDisplayStatus !== 'NONE') updateNotificationPane('NONE'); currentDisplayStatus = 'NONE'; lastSignalId = null; return; }
    if (signal.id === lastSignalId && signal.status === currentDisplayStatus) return;
    lastSignalId = signal.id; currentDisplayStatus = signal.status;
    if (signal.status === 'REQUESTED' && !assistedUserId) updateNotificationPane('REQUESTED');
    else if (signal.status === 'AUTHORIZED') { if (!assistedUserId) updateNotificationPane('AUTHORIZED', signal.recovery_token); }
}

function updateNotificationPane(status, token = null) {
    const pane = document.getElementById('notification-pane'); if (!pane) return;
    if (status === 'REQUESTED') {
        pane.innerHTML = `<div style="background:#fff5f5; border:1px solid #feb2b2; padding:15px; border-radius:8px;"><p>Admin Reset Requested</p><button class="btn-bank" onclick="respondToHandshake(true)">ALLOW</button></div>`;
    } else if (status === 'AUTHORIZED' && token) {
        pane.innerHTML = `<div style="background:#f0fff4; border:1px solid #c6f6d5; padding:15px; border-radius:8px;"><p>Handshake Active</p><h3>${token}</h3></div>`;
    } else { pane.innerHTML = ''; }
}

function setupBridgeListener(uId) {
    supabaseClient.channel(`bridge-${uId}`).on('postgres_changes',{event:'*',schema:'public',table:'handshake_signals',filter:`member_id=eq.${uId}`},p=>handleHandshakeSignal(p.new||p.old)).subscribe();
    setInterval(async () => { const {data} = await supabaseClient.from('handshake_signals').select('*').eq('member_id', uId).order('created_at', { ascending: false }).limit(1).maybeSingle(); handleHandshakeSignal(data); }, 5000);
}

async function requestPINAuthorization(callback) {
    openModal('pinModal');
    document.getElementById('pin-confirm-btn').onclick = async () => {
        const val = document.getElementById('auth-pin-input').value;
        if (assistedUserId) {
            const { data: sig } = await supabaseClient.from('handshake_signals').select('recovery_token').eq('member_id', assistedUserId).eq('status', 'AUTHORIZED').order('created_at', { ascending: false }).limit(1).maybeSingle();
            if (sig && val === sig.recovery_token) { closeModal('pinModal'); await callback(); } else showToast("INVALID TOKEN.", "error");
        } else {
            const { data: { user } } = await supabaseClient.auth.getUser(); const { data: profile } = await supabaseClient.from('profiles').select('pin').eq('id', user.id).maybeSingle();
            if (profile && val === profile.pin) { closeModal('pinModal'); await callback(); } else showToast("INVALID PIN.", "error");
        }
    };
}

async function handleOp(event, type) {
    event.preventDefault(); const amt = parseFloat(new FormData(event.target).get('amount'));
    requestPINAuthorization(async () => {
        const result = type === 'deposit' ? deposit_func(myAccNo, amt) : withdraw_func(myAccNo, amt);
        if (result >= 0) {
            await supabaseClient.from('accounts').update({ balance: result }).eq('acc_no', myAccNo);
            const uId = assistedUserId || (await supabaseClient.auth.getUser()).data.user.id;
            await supabaseClient.from('transactions').insert([{ acc_no: myAccNo, description: type.toUpperCase(), amount: type === 'deposit' ? amt : -amt, status: 'SUCCESS', user_id: uId }]);
            if (assistedUserId) await supabaseClient.from('handshake_signals').delete().eq('member_id', assistedUserId);
            showToast("SUCCESS."); await syncFromCloud(); switchSubView('summary');
        } else showToast("Denied.", "error");
    });
}

async function handleTransfer(event) {
    event.preventDefault(); const amt = parseFloat(document.getElementById('trans-amount').value), destAcc = parseInt(document.getElementById('trans-dest-acc').value);
    requestPINAuthorization(async () => {
        const { error } = await supabaseClient.rpc('transfer_funds', { sender_acc: myAccNo, receiver_acc: destAcc, amount_val: amt });
        if (!error) { if (assistedUserId) await supabaseClient.from('handshake_signals').delete().eq('member_id', assistedUserId); showToast("SUCCESS."); await syncFromCloud(); switchSubView('summary'); }
        else showToast(error.message, "error");
    });
}

async function syncFromCloud() {
    if (!engine) return; clear_system_func(); const { data: { user } } = await supabaseClient.auth.getUser(); const { data: accounts } = await supabaseClient.from('accounts').select('*');
    const tbody = document.getElementById('portfolio-table-body'); if (tbody) tbody.innerHTML = '';
    if (accounts) {
        accounts.forEach(acc => {
            create_account_func(acc.acc_no, acc.name, acc.balance);
            if (isAdmin || acc.user_id === user.id || (assistedUserId && acc.user_id === assistedUserId)) {
                const row = tbody.insertRow();
                const isAss = assistedUserId && acc.user_id === assistedUserId;
                const act = (isAdmin && acc.user_id !== user.id && !assistedUserId) ? `<button class="btn-bank" style="font-size:0.6rem; padding:4px 8px;" onclick="requestAdminAssistance('${acc.user_id}', ${acc.acc_no})">ASSIST</button>` : (isAss ? `Assisting` : `Verified`);
                row.innerHTML = `<td>Savings</td><td>${acc.acc_no}</td><td>${act}</td><td style="text-align:right">₹${acc.balance.toLocaleString('en-IN')}</td>`;
            }
            if (acc.user_id === (assistedUserId || user.id)) { if (!assistedUserId) originalAccNo = acc.acc_no; myAccNo = acc.acc_no; document.getElementById('client-id-tag').textContent = myAccNo; document.getElementById('total-balance').textContent = `₹${acc.balance.toLocaleString('en-IN')}`; }
        });
    }
    const { data: trans } = await supabaseClient.from('transactions').select('*').order('created_at', { ascending: true }); renderAnalytics(trans || []); renderTransactions(trans || []);
}

function renderAnalytics(tr) {
    const myT=tr.filter(t=>t.acc_no===myAccNo);
    let inflow=0, outflow=0; myT.forEach(t=>{ if(t.amount>0) inflow+=t.amount; else outflow+=Math.abs(t.amount); });
    const inEl = document.getElementById('monthly-inflow'), outEl = document.getElementById('monthly-outflow');
    if(inEl) inEl.textContent=`₹${inflow.toLocaleString()}`; if(outEl) outEl.textContent=`₹${outflow.toLocaleString()}`;
    const ctx=document.getElementById('spendChart')?.getContext('2d');
    if(ctx){ if(spendChart) spendChart.destroy(); spendChart=new Chart(ctx,{type:'bar', data:{labels:myT.map(t=>new Date(t.created_at).toLocaleDateString()), datasets:[{data:myT.map(t=>t.amount), backgroundColor:myT.map(t=>t.amount>0?'#10b981':'#ed1c24')}]}, options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}}}); }
}

function renderTransactions(tr) {
    const tbody = document.getElementById('recent-transactions-table-body'); if(!tbody) return;
    tbody.innerHTML = ''; const myT = tr.filter(t => t.acc_no === myAccNo).reverse();
    myT.forEach(t => { const row = tbody.insertRow(); row.innerHTML = `<td>${new Date(t.created_at).toLocaleDateString()}</td><td>${t.description}</td><td style="text-align:right; color:${t.amount<0?'red':'green'}">₹${Math.abs(t.amount).toLocaleString()}</td>`; });
}

function refreshReports() { if(!engine) return; document.getElementById('total-money-held').textContent = `₹${get_total_money_func().toLocaleString()}`; }
async function updateProfile(e) { e.preventDefault(); const n = document.getElementById('prof-name').value; const {data:{user}}=await supabaseClient.auth.getUser(); await supabaseClient.from('profiles').update({full_name:n}).eq('id',user.id); showToast("Updated."); }
async function requestAdminAssistance(tId, tAcc) {
  const code = prompt("Enter Member Support Code:");
  const { data: p } = await supabaseClient.from("profiles").select("help_code, full_name").eq("id", tId).single();
  if (p && code === p.help_code) {
    showToast("Connected"); assistedUserId = tId; assistedAccNo = tAcc; setupBridgeListener(tId); await syncFromCloud(); switchSubView('summary');
  } else { showToast("Invalid Code", "error"); }
}
async function terminateAssistance() { assistedUserId = null; assistedAccNo = null; await syncFromCloud(); }
function handleLogout() { supabaseClient.auth.signOut(); location.reload(); }
function openModal(id) { document.getElementById(id)?.classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id)?.classList.add('hidden'); }
function syncProfileState() {}
