require('dotenv').config({ path: '../terminal/.env' });
const { createClient } = require('@supabase/supabase-js');
const VitaBankEngine = require('../wasm/engine.js');
const readline = require('readline');

const supabase = createClient("https://addghapkcuhowzxkmtdh.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkZGdoYXBrY3Vob3d6eGttdGRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3NzcyOTYsImV4cCI6MjA5MDM1MzI5Nn0._fpsJ7DRlM6uv9ZEuUSQ8mgouVBoHgX_AmHJ-4aKhWw");
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

let engine, create_account_func, deposit_func, withdraw_func, get_total_money_func, clear_system_func;
let currentUser = null, isAdmin = false;

async function init() {
    console.log("\n--- Vaultis Secure Terminal Bridge ---");
    rl.question("Manager/Member Email: ", (email) => {
        rl.question("Password: ", async (password) => {
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) { console.error("Login Failed:", error.message); process.exit(1); }
            currentUser = data.user;
            const { data: prof } = await supabase.from('profiles').select('is_admin').eq('id', currentUser.id).single();
            isAdmin = prof?.is_admin || (email === 'alpha14@gmail.com');
            startEngine();
        });
    });
}

async function startEngine() {
    const instance = await VitaBankEngine();
    engine = instance;
    create_account_func = engine.cwrap('create_account', 'number', ['number', 'string', 'number']);
    deposit_func = engine.cwrap('deposit', 'number', ['number', 'number']);
    withdraw_func = engine.cwrap('withdraw', 'number', ['number', 'number']);
    get_total_money_func = engine.cwrap('get_total_money', 'number', []);
    clear_system_func = engine.cwrap('clear_system', null, []);
    await syncFromSupabase();
    mainMenu();
}

async function syncFromSupabase() {
    clear_system_func();
    const { data: accounts } = await supabase.from('accounts').select('*');
    if (accounts) accounts.forEach(acc => create_account_func(acc.acc_no, acc.name, acc.balance));
}

async function adminOnboardMember() {
    console.log("\n--- NEW MEMBER ONBOARDING ---");
    rl.question("Member Full Name: ", (name) => {
        rl.question("Initial Deposit: ", (bal) => {
            rl.question("Set 4-Digit Temp PIN: ", async (pin) => {
                const accNo = Math.floor(100000 + Math.random() * 900000);
                const balance = parseFloat(bal) || 500.0;
                const { error: accErr } = await supabase.from('accounts').insert([{ 
                    acc_no: accNo, name: name, balance: balance, temp_pin: pin 
                }]);
                if (!accErr) {
                    await supabase.from('transactions').insert([{ acc_no: accNo, description: 'TERMINAL OPENING', amount: balance, status: 'SUCCESS' }]);
                    console.log(`\nSUCCESS: Account ${accNo} created for ${name}.\n`);
                } else console.error("FAILED: " + accErr.message);
                mainMenu();
            });
        });
    });
}

function mainMenu() {
    console.log("\n--- VAULTIS COMMAND CENTER ---");
    console.log("1. Check System Total\n2. Register New Member\n3. Exit");
    rl.question("Action: ", async (choice) => {
        if (choice === '1') { console.log("Total Bank Ledger:", get_total_money_func()); mainMenu(); }
        else if (choice === '2' && isAdmin) { await adminOnboardMember(); }
        else process.exit(0);
    });
}

init();
