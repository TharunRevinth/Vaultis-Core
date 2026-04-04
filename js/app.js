const SUPABASE_URL = 'https://addghapkcuhowzxkmtdh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkZGdoYXBrY3Vob3d6eGttdGRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3NzcyOTYsImV4cCI6MjA5MDM1MzI5Nn0._fpsJ7DRlM6uv9ZEuUSQ8mgouVBoHgX_AmHJ-4aKhWw';
let supabaseClient, engine, isAdmin=false, spendChart=null, myAccNo=null, originalAccNo=null, assistedUserId=null, assistedAccNo=null, bridgeInterval=null, lastSignalId=null, currentDisplayStatus=null, currentTransactions=[], currentPage=1;
const itemsPerPage = 10;
let create_account_func, deposit_func, withdraw_func, get_total_money_func, get_below_threshold_count_func, clear_system_func;

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
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
            console.log("[Vaultis] Engine Operational.");
        });
    }
}

function showToast(msg, type='success') {
    const c = document.getElementById('toast-container'); if(!c) return;
    const t = document.createElement('div'); t.className=`toast ${type}`;
    t.style.background = type==='success'?'#10b981':'#ed1c24'; t.style.padding='12px 20px'; t.style.color='white'; t.style.borderRadius='4px'; t.style.marginBottom='10px';
    t.innerHTML = `<i class="fas ${type==='success'?'fa-check-circle':'fa-exclamation-triangle'}"></i> ${msg}`;
    c.appendChild(t); setTimeout(() => { t.style.opacity='0'; setTimeout(()=>t.remove(),500); }, 4000);
}

// --- AUTH & NAVIGATION ---
function toggleAuth(type) {
    openModal('auth-modal');
    document.getElementById('auth-login-box').classList.toggle('hidden', type==='register');
    document.getElementById('auth-register-box').classList.toggle('hidden', type==='login');
}

async function handleLogin(e) {
    e.preventDefault();
    const {data,error}=await supabaseClient.auth.signInWithPassword({email:document.getElementById('login-email').value, password:document.getElementById('login-password').value});
    if(!error) { closeModal('auth-modal'); initDashboard(data.user); } else showToast(error.message,"error");
}

async function handleRegister(e) {
    e.preventDefault();
    const name=document.getElementById('reg-name').value.trim(), email=document.getElementById('reg-email').value.trim(), pass=document.getElementById('reg-password').value, pin=document.getElementById('reg-pin').value, cAcc=document.getElementById('reg-acc-no').value;
    let exAcc=null;
    if(cAcc) {
        const {data}=await supabaseClient.from('accounts').select('*').eq('acc_no',parseInt(cAcc)).eq('temp_pin',pin).is('user_id',null).maybeSingle();
        exAcc=data; if(!exAcc){ return showToast("Claim Denied: Details mismatch.","error"); }
    }
    const {data,error}=await supabaseClient.auth.signUp({email, password:pass, options:{data:{full_name:name, pin:pin}}});
    if(error) return showToast(error.message,"error");
    if(exAcc){
        await supabaseClient.from('accounts').update({user_id:data.user.id, temp_pin:null, name:name}).eq('acc_no',exAcc.acc_no);
        await supabaseClient.from('transactions').update({user_id:data.user.id}).eq('acc_no',exAcc.acc_no);
    } else {
        const nAcc=Math.floor(100000+Math.random()*900000);
        await supabaseClient.from('accounts').insert([{acc_no:nAcc, user_id:data.user.id, name:name, balance:500}]);
        await supabaseClient.from('transactions').insert([{acc_no:nAcc, user_id:data.user.id, description:'OPENING', amount:500, status:'SUCCESS'}]);
    }
    location.reload();
}

async function initDashboard(user) {
    const code=Math.floor(100000+Math.random()*900000).toString();
    await supabaseClient.from('profiles').update({help_code:code}).eq('id',user.id);
    const {data:p}=await supabaseClient.from('profiles').select('*').eq('id',user.id).single();
    if(p){
        isAdmin=p.is_admin || (user.email==='alpha14@gmail.com');
        document.getElementById('display-user').textContent=(isAdmin?"[MANAGER] ":"")+p.full_name;
        if(isAdmin) document.getElementById('admin-only-nav').classList.remove('hidden');
        setupBridgeListener(user.id);
    }
    showView('dashboard-view'); switchSubView('summary'); syncFromCloud();
}

function showView(id) { document.getElementById('landing-view').classList.toggle('hidden', id==='dashboard-view'); document.getElementById('dashboard-view').classList.toggle('hidden', id === 'landing-view'); }

async function switchSubView(id) {
    document.querySelectorAll('.sub-view').forEach(v=>v.classList.remove('active'));
    const t=document.getElementById('view-'+id); if(t) t.classList.add('active');
    document.querySelectorAll('.nav-item').forEach(i=>{ i.classList.remove('active'); if(i.getAttribute('onclick')?.includes(`'${id}'`)) i.classList.add('active'); });
    if(id==='profile') syncProfileState();
}

// --- SECURE HANDSHAKE ---
async function respondToHandshake(auth) {
    const {data:{user}}=await supabaseClient.auth.getUser();
    const stat=auth?'AUTHORIZED':'DENIED', tok=auth?Math.floor(1000+Math.random()*9000).toString():null;
    const {data:sig}=await supabaseClient.from('handshake_signals').select('id').eq('member_id',user.id).eq('status', 'REQUESTED').order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (sig) {
        await supabaseClient.from('handshake_signals').update({ status: stat, recovery_token: tok }).eq('id', sig.id);
        currentDisplayStatus = stat; updateNotificationPane(stat, tok);
    }
}

function handleHandshakeSignal(s) {
    if(!s){ if(currentDisplayStatus!=='NONE') updateNotificationPane('NONE'); currentDisplayStatus='NONE'; lastSignalId=null; return; }
    if(s.id===lastSignalId && s.status===currentDisplayStatus) return;
    lastSignalId=s.id; currentDisplayStatus=s.status;
    if(s.status==='REQUESTED' && !assistedUserId) updateNotificationPane('REQUESTED');
    else if(s.status==='AUTHORIZED'){ if(!assistedUserId) updateNotificationPane('AUTHORIZED', s.recovery_token); else syncProfileState(); }
}

function updateNotificationPane(stat, tok=null) {
    const p=document.getElementById('notification-pane'); if(!p) return;
    if(stat==='REQUESTED'){ p.innerHTML=`<div style="background:#fff5f5; border:1px solid #feb2b2; padding:15px; border-radius:8px;"><p>Admin Reset Requested</p><button class="btn-bank" onclick="respondToHandshake(true)">ALLOW</button></div>`; }
    else if(stat==='AUTHORIZED' && tok){ p.innerHTML=`<div style="background:#f0fff4; border:1px solid #c6f6d5; padding:15px; border-radius:8px;"><p>Handshake Active</p><h3>${tok}</h3></div>`; }
    else { p.innerHTML=''; }
}

function setupBridgeListener(uId) {
    supabaseClient.channel(`bridge-${uId}`).on('postgres_changes',{event:'*',schema:'public',table:'handshake_signals',filter:`member_id=eq.${uId}`},p=>handleHandshakeSignal(p.new||p.old)).subscribe();
    setInterval(async () => { const {data}=await supabaseClient.from('handshake_signals').select('*').eq('member_id',uId).order('created_at',{ascending:false}).limit(1).maybeSingle(); handleHandshakeSignal(data); }, 5000);
}

// --- BANKING OPS ---
async function requestPINAuthorization(cb) {
    openModal('pinModal');
    document.getElementById('pin-confirm-btn').onclick=async ()=>{
        const v=document.getElementById('auth-pin-input').value;
        if(assistedUserId){
            const {data:sig}=await supabaseClient.from('handshake_signals').select('recovery_token').eq('member_id',assistedUserId).eq('status','AUTHORIZED').order('created_at',{ascending:false}).limit(1).maybeSingle();
            if(sig && v===sig.recovery_token){ closeModal('pinModal'); await cb(); } else showToast("INVALID TOKEN","error");
        } else {
            const {data:{user}}=await supabaseClient.auth.getUser();
            const {data:pr}=await supabaseClient.from('profiles').select('pin').eq('id',user.id).single();
            if(pr && v===pr.pin){ closeModal('pinModal'); await cb(); } else showToast("INVALID PIN","error");
        }
    };
}

async function handleOp(e,type) {
    e.preventDefault(); const amt=parseFloat(new FormData(e.target).get('amount'));
    requestPINAuthorization(async ()=>{
        const res=type==='deposit'?deposit_func(myAccNo,amt):withdraw_func(myAccNo,amt);
        if(res>=0){
            await supabaseClient.from('accounts').update({balance:res}).eq('acc_no',myAccNo);
            const uId = assistedUserId || (await supabaseClient.auth.getUser()).data.user.id;
            await supabaseClient.from('transactions').insert([{acc_no:myAccNo, description:type.toUpperCase(), amount:type==='deposit'?amt:-amt, status:'SUCCESS', user_id:uId}]);
            if(assistedUserId) await supabaseClient.from('handshake_signals').delete().eq('member_id',assistedUserId);
            showToast("SUCCESS"); await syncFromCloud(); switchSubView('summary');
        } else showToast("DENIED","error");
    });
}

// --- CORE SYNC ---
async function syncFromCloud() {
    if(!engine) return; clear_system_func(); const {data:{user}}=await supabaseClient.auth.getUser(); const {data:accs}=await supabaseClient.from('accounts').select('*');
    const tb=document.getElementById('portfolio-table-body'); if(tb) tb.innerHTML='';
    if(accs){
        accs.forEach(a=>{
            create_account_func(a.acc_no, a.name, a.balance);
            if(isAdmin || a.user_id===user.id || (assistedUserId && a.user_id===assistedUserId)){
                const row=tb.insertRow();
                row.innerHTML=`<td>Savings</td><td>${a.acc_no}</td><td>Verified</td><td style="text-align:right">₹${a.balance.toLocaleString('en-IN')}</td>`;
            }
            if(a.user_id===(assistedUserId||user.id)){ myAccNo=a.acc_no; document.getElementById('client-id-tag').textContent=myAccNo; document.getElementById('total-balance').textContent=`₹${a.balance.toLocaleString('en-IN')}`; }
        });
    }
    const {data:tr}=await supabaseClient.from('transactions').select('*').order('created_at',{ascending:true}); renderAnalytics(tr || []);
}

function renderAnalytics(tr) {
    const myT=tr.filter(t=>t.acc_no===myAccNo);
    let inflow=0, outflow=0; myT.forEach(t=>{ if(t.amount>0) inflow+=t.amount; else outflow+=Math.abs(t.amount); });
    document.getElementById('monthly-inflow').textContent=`₹${inflow.toLocaleString()}`;
    document.getElementById('monthly-outflow').textContent=`₹${outflow.toLocaleString()}`;
}

async function requestAdminAssistance(tId, tAcc) {
    const code=prompt("Enter Member Support Code:");
    const {data:p}=await supabaseClient.from('profiles').select('help_code').eq('id',tId).single();
    if(p && code===p.help_code){ assistedUserId=tId; assistedAccNo=tAcc; await syncFromCloud(); }
}

function handleLogout() { supabaseClient.auth.signOut(); location.reload(); }
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function syncProfileState() { /* Force refresh UI buttons */ }
