// REPLACE THIS URL WITH YOUR ACTUAL GOOGLE WEB APP URL
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbyXbpBf2kV37wPc2gGgupl-E3eA44zrRQuygcQ4CmUjaOa_25ycrEYCr6unC5AO38gm/exec";

document.addEventListener('DOMContentLoaded', () => {
    const loginSection = document.getElementById('loginSection');
    const appSection = document.getElementById('appSection');
    const monthFilter = document.getElementById('monthFilter');
    const loader = document.getElementById('loader');
    const isLeave = document.getElementById('isLeave');
    const timeGroup = document.getElementById('timeInputGroup');

    // Init Month Filter
    const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const now = new Date();
    months.forEach((m, i) => {
        let opt = document.createElement('option');
        opt.value = `${m}-${now.getFullYear()}`;
        opt.innerHTML = opt.value;
        if(i === now.getMonth()) opt.selected = true;
        monthFilter.appendChild(opt);
    });

    // Check Login Session
    const savedUser = localStorage.getItem('user');
    const savedName = localStorage.getItem('name');
    if(savedUser) showApp(savedName);

    // --- AUTH ACTIONS ---
    document.getElementById('loginBtn').onclick = async () => {
        const u = document.getElementById('username').value;
        const p = document.getElementById('password').value;
        if(!u || !p) return alert("Fill all fields");
        
        toggleLoader(true);
        try {
            const res = await fetch(WEB_APP_URL, {method: 'POST', body: JSON.stringify({action: 'login', username: u, password: p})});
            const json = await res.json();
            if(json.success) {
                localStorage.setItem('user', u);
                localStorage.setItem('name', json.name);
                showApp(json.name);
            } else {
                document.getElementById('errorMsg').innerText = "Invalid Credentials";
            }
        } catch(e) { alert("Network Error"); }
        toggleLoader(false);
    };

    function showApp(name) {
        loginSection.style.display = 'none';
        appSection.style.display = 'block';
        document.getElementById('welcomeName').innerText = `Hi ${name}`;
        document.getElementById('userInitial').innerText = name.charAt(0).toUpperCase();
        document.getElementById('punchDate').valueAsDate = new Date();
        loadData();
    }

    // --- DATA ACTIONS ---
    async function loadData() {
        toggleLoader(true);
        try {
            const res = await fetch(WEB_APP_URL, {
                method: 'POST', 
                body: JSON.stringify({
                    action: 'getEntries', 
                    username: localStorage.getItem('user'), 
                    month: monthFilter.value
                })
            });
            const entries = await res.json();
            renderTable(entries);
        } catch(e) { console.error("Load failed", e); }
        toggleLoader(false);
    }

    document.getElementById('saveBtn').onclick = async () => {
        const date = document.getElementById('punchDate').value;
        const m = document.getElementById('morningPunch').value;
        const e = document.getElementById('eveningPunch').value;
        if(!date) return alert("Select Date");

        const stats = calculateShift(m, e, isLeave.checked);
        
        toggleLoader(true);
        try {
            // Wait for server to confirm save
            await fetch(WEB_APP_URL, {
                method: 'POST', 
                body: JSON.stringify({
                    action: 'saveEntry', 
                    username: localStorage.getItem('user'),
                    date, 
                    month: monthFilter.value, 
                    morning: m, 
                    evening: e, 
                    isLeave: isLeave.checked,
                    diff: stats.diff, 
                    status: stats.status
                })
            });
            // Immediately reload data after save
            await loadData();
            alert("Record Updated Successfully!");
        } catch(err) {
            alert("Failed to sync. Check internet.");
            toggleLoader(false);
        }
    };

    function calculateShift(m, e, leave) {
        if(leave) return { diff: 0, status: 'Leave' };
        const toM = t => { const [h, mi] = t.split(':').map(Number); return h*60+mi; };
        const inM = toM(m), outM = toM(e), lateL = toM('09:30'), baseS = toM('09:15'), stdE = toM('19:00');
        let diff = 0, status = "On-Time";
        if(inM > lateL) { diff -= (inM - baseS); status = "Late"; }
        diff += (outM - stdE);
        if(diff > 0 && status !== "Late") status = "Overtime";
        if(diff < 0 && status === "On-Time") status = "Early-Exit";
        if(diff >= 0 && status === "Late") status = "Balanced";
        return { diff, status };
    }

    function renderTable(data) {
        const tbody = document.querySelector('#timeTable tbody');
        tbody.innerHTML = '';
        let total = 0;
        
        // Sorting by date
        data.sort((a,b) => new Date(a.date) - new Date(b.date)).forEach(row => {
            total += parseInt(row.diff);
            const r = tbody.insertRow();
            r.innerHTML = `
                <td>${row.date.split('-').reverse().join('/')}</td>
                <td>${row.isLeave ? '-' : row.morning}</td>
                <td>${row.isLeave ? '-' : row.evening}</td>
                <td><span class="badge ${row.status.toLowerCase()}">${row.status}</span></td>
                <td class="${row.diff < 0 ? 'neg' : 'pos'}">${formatMins(row.diff)}</td>
            `;
        });
        document.getElementById('totalTime').innerText = formatMins(total);
        document.getElementById('totalTime').className = total < 0 ? 'value neg' : 'value pos';
    }

    // UI Helpers
    function formatMins(m) {
        const h = Math.floor(Math.abs(m)/60), mi = Math.abs(m)%60;
        return `${m < 0 ? '-' : ''}${h}h ${String(mi).padStart(2, '0')}m`;
    }

    function toggleLoader(show) { loader.style.display = show ? 'flex' : 'none'; }

    isLeave.onchange = () => {
        timeGroup.classList.toggle('disabled', isLeave.checked);
        timeGroup.style.opacity = isLeave.checked ? "0.3" : "1";
        timeGroup.style.pointerEvents = isLeave.checked ? "none" : "auto";
    };

    // Card Switches
    document.getElementById('gotoReset').onclick = () => { document.getElementById('loginCard').style.display='none'; document.getElementById('resetCard').style.display='block'; };
    document.getElementById('backToLogin').onclick = () => { document.getElementById('resetCard').style.display='none'; document.getElementById('loginCard').style.display='block'; };

    monthFilter.onchange = loadData;
    document.getElementById('logoutBtn').onclick = () => { localStorage.clear(); location.reload(); };
});
