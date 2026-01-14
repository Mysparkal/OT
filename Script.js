const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbxREId4_macnQe4KOCi5i_zD9L5cmzu2EjwdXRilBZri26_Y3H59S00_a_Pm80NS6QhOA/exec"; 

document.addEventListener('DOMContentLoaded', () => {
    const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const now = new Date();
    const monthFilter = document.getElementById('monthFilter');
    
    // Setup Month Filter
    monthFilter.innerHTML = '';
    months.forEach((m, i) => {
        let opt = document.createElement('option');
        // Format: "October-2023"
        opt.value = `${m}-${now.getFullYear()}`;
        opt.innerHTML = opt.value;
        if(i === now.getMonth()) opt.selected = true;
        monthFilter.appendChild(opt);
    });

    if(localStorage.getItem('user')) showApp(localStorage.getItem('name'));

    // --- Login ---
    document.getElementById('loginBtn').onclick = async () => {
        const u = document.getElementById('username').value.trim();
        const p = document.getElementById('password').value;
        if(!u || !p) return;
        toggleLoader(true);
        try {
            const res = await fetch(WEB_APP_URL, {method: 'POST', body: JSON.stringify({action: 'login', username: u, password: p})});
            const json = await res.json();
            if(json.success) {
                localStorage.setItem('user', u);
                localStorage.setItem('name', json.name);
                showApp(json.name);
            } else {
                document.getElementById('errorMsg').innerText = "Invalid Username or Password";
            }
        } catch (e) { alert("Error connecting to server"); }
        toggleLoader(false);
    };

    // --- App Logic ---
    function showApp(name) {
        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('appSection').style.display = 'block';
        document.getElementById('welcomeName').innerText = `Hi ${name}`;
        document.getElementById('userInitial').innerText = name.charAt(0).toUpperCase();
        document.getElementById('punchDate').valueAsDate = new Date();
        loadData();
    }

    async function loadData() {
        toggleLoader(true);
        const user = localStorage.getItem('user');
        const selectedMonth = monthFilter.value;
        
        try {
            const res = await fetch(WEB_APP_URL, {
                method: 'POST', 
                body: JSON.stringify({
                    action: 'getEntries', 
                    username: user, 
                    month: selectedMonth
                })
            });
            const data = await res.json();
            renderTable(data);
        } catch (e) {
            console.error("Data fetch failed", e);
        }
        toggleLoader(false);
    }

    document.getElementById('saveBtn').onclick = async () => {
        const date = document.getElementById('punchDate').value; // yyyy-mm-dd
        if(!date) return alert("Please select a date");
        
        const leave = document.getElementById('isLeave').checked;
        const m = document.getElementById('morningPunch').value;
        const e = document.getElementById('eveningPunch').value;
        const stats = calculateShift(m, e, leave);
        
        toggleLoader(true);
        try {
            const res = await fetch(WEB_APP_URL, {
                method: 'POST', 
                body: JSON.stringify({
                    action: 'saveEntry', 
                    username: localStorage.getItem('user'), 
                    date: date, 
                    month: monthFilter.value,
                    morning: m, 
                    evening: e, 
                    isLeave: leave, 
                    diff: stats.diff, 
                    status: stats.status
                })
            });
            await loadData(); // Reload table after saving
            alert("Sheet Updated!");
        } catch (err) { alert("Sync failed"); }
        toggleLoader(false);
    };

    function calculateShift(m, e, leave) {
        if(leave) return { diff: 0, status: 'Leave' };
        const toM = t => { const [h, mi] = t.split(':').map(Number); return h*60+mi; };
        const inM = toM(m), outM = toM(e);
        const lateL = toM('09:30'), baseS = toM('09:15'), stdE = toM('19:00');
        
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

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No data found for this month</td></tr>';
        } else {
            // Sort by date ascending
            data.sort((a,b) => new Date(a.date) - new Date(b.date)).forEach(row => {
                total += parseInt(row.diff || 0);
                const r = tbody.insertRow();
                r.innerHTML = `
                    <td>${row.date.split('-').reverse().join('/')}</td>
                    <td>${row.isLeave ? '-' : row.morning}</td>
                    <td>${row.isLeave ? '-' : row.evening}</td>
                    <td><span class="badge ${row.status.toLowerCase().replace(' ', '-')}">${row.status}</span></td>
                    <td class="${row.diff < 0 ? 'neg' : 'pos'}">${formatMins(row.diff)}</td>
                    <td><button class="edit-btn" onclick="editRow('${row.date}','${row.morning}','${row.evening}',${row.isLeave})"><i class="fas fa-edit"></i></button></td>
                `;
            });
        }
        document.getElementById('totalTime').innerText = formatMins(total);
        document.getElementById('totalTime').className = total < 0 ? 'neg' : 'pos';
    }

    window.editRow = (date, m, e, leave) => {
        document.getElementById('punchDate').value = date;
        document.getElementById('morningPunch').value = m;
        document.getElementById('eveningPunch').value = e;
        document.getElementById('isLeave').checked = leave;
        // Trigger leave change effect
        document.getElementById('isLeave').dispatchEvent(new Event('change'));
        window.scrollTo({top: 0, behavior: 'smooth'});
    };

    function formatMins(m) {
        const h = Math.floor(Math.abs(m)/60), mi = Math.abs(m)%60;
        return `${m < 0 ? '-' : ''}${h}h ${String(mi).padStart(2, '0')}m`;
    }

    function toggleLoader(s) { document.getElementById('loader').style.display = s ? 'flex' : 'none'; }
    
    document.getElementById('isLeave').onchange = (e) => {
        const inputs = document.getElementById('timeInputs');
        inputs.style.opacity = e.target.checked ? "0.2" : "1";
        inputs.style.pointerEvents = e.target.checked ? "none" : "auto";
    };
    
    monthFilter.onchange = loadData;
    document.getElementById('logoutBtn').onclick = () => { localStorage.clear(); location.reload(); };

    // --- Reset Logic ---
    document.getElementById('gotoReset').onclick = (e) => {
        e.preventDefault();
        document.getElementById('loginCard').style.display = 'none';
        document.getElementById('resetCard').style.display = 'block';
    };
    document.getElementById('backToLogin').onclick = (e) => {
        e.preventDefault();
        document.getElementById('resetCard').style.display = 'none';
        document.getElementById('loginCard').style.display = 'block';
    };
    document.getElementById('submitReset').onclick = async () => {
        const u = document.getElementById('resetUser').value.trim();
        const op = document.getElementById('oldPassword').value;
        const np = document.getElementById('newPassword').value;
        if(!u || !op || !np) return;
        toggleLoader(true);
        const res = await fetch(WEB_APP_URL, {method: 'POST', body: JSON.stringify({action: 'changePassword', username: u, oldPassword: op, newPassword: np})});
        const json = await res.json();
        toggleLoader(false);
        if(json.success) { alert("Password Changed Successfully!"); location.reload(); }
        else { document.getElementById('resetMsg').innerText = json.msg; }
    };
});
