const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbxREId4_macnQe4KOCi5i_zD9L5cmzu2EjwdXRilBZri26_Y3H59S00_a_Pm80NS6QhOA/exec";

document.addEventListener('DOMContentLoaded', () => {
    const monthFilter = document.getElementById('monthFilter');
    const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const now = new Date();

    // Setup Month Filter
    monthFilter.innerHTML = '';
    months.forEach((m, i) => {
        let opt = document.createElement('option');
        opt.value = `${m}-${now.getFullYear()}`;
        opt.innerHTML = opt.value;
        if(i === now.getMonth()) opt.selected = true;
        monthFilter.appendChild(opt);
    });

    if(localStorage.getItem('user')) showApp(localStorage.getItem('name'));

    // Authentication
    document.getElementById('loginBtn').onclick = async () => {
        const u = document.getElementById('username').value.trim();
        const p = document.getElementById('password').value;
        if(!u || !p) return alert("Please enter credentials");
        
        toggleLoader(true);
        try {
            const res = await fetch(WEB_APP_URL, {method: 'POST', body: JSON.stringify({action: 'login', username: u, password: p})});
            const json = await res.json();
            if(json.success) {
                localStorage.setItem('user', u);
                localStorage.setItem('name', json.name);
                showApp(json.name);
            } else {
                alert("Login Failed. Check Username/Password.");
            }
        } catch (e) { alert("Server error. Check your Internet."); }
        toggleLoader(false);
    };

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
        try {
            const res = await fetch(WEB_APP_URL, {
                method: 'POST', 
                body: JSON.stringify({ action: 'getEntries', username: localStorage.getItem('user'), month: monthFilter.value })
            });
            const data = await res.json();
            renderTable(data);
        } catch (e) { console.error("Error loading data", e); }
        toggleLoader(false);
    }

    document.getElementById('saveBtn').onclick = async () => {
        const date = document.getElementById('punchDate').value;
        if(!date) return alert("Select Date");
        const leave = document.getElementById('isLeave').checked;
        const mInput = document.getElementById('morningPunch').value;
        const eInput = document.getElementById('eveningPunch').value;
        const stats = calculateShift(mInput, eInput, leave);

        toggleLoader(true);
        try {
            await fetch(WEB_APP_URL, {
                method: 'POST', 
                body: JSON.stringify({
                    action: 'saveEntry', 
                    username: localStorage.getItem('user'), 
                    date: date, 
                    month: monthFilter.value,
                    morning: mInput, evening: eInput, isLeave: leave, 
                    diff: stats.diff, status: stats.status
                })
            });
            await loadData(); // Reload table
            alert("Sheet Synced successfully!");
        } catch (err) { alert("Save Failed. Try again."); }
        toggleLoader(false);
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
    
    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;">No records found for this month.</td></tr>';
        document.getElementById('totalTime').innerText = "0h 00m";
        return;
    }

    data.sort((a,b) => new Date(a.date) - new Date(b.date)).forEach(row => {
        total += parseInt(row.diff || 0);
        const r = tbody.insertRow();
        
        // Clean formatting for the date
        const displayDate = row.date.includes('-') ? row.date.split('-').reverse().join('/') : row.date;

        r.innerHTML = `
            <td>${displayDate}</td>
            <td>${row.isLeave ? '-' : row.morning}</td>
            <td>${row.isLeave ? '-' : row.evening}</td>
            <td><span class="badge ${row.status.toLowerCase().replace(' ', '-')}">${row.status}</span></td>
            <td class="${row.diff < 0 ? 'neg' : 'pos'}">${formatMins(row.diff)}</td>
            <td>
                <button class="edit-btn" onclick="editRow('${row.date}','${row.morning}','${row.evening}',${row.isLeave})" title="Edit Entry">
                    <i class="fa-solid fa-pen-to-square"></i>
                </button>
            </td>
        `;
    });
    document.getElementById('totalTime').innerText = formatMins(total);
    document.getElementById('totalTime').className = total < 0 ? 'neg' : 'pos';
}

    window.editRow = (date, m, e, leave) => {
        document.getElementById('punchDate').value = date;
        document.getElementById('morningPunch').value = m;
        document.getElementById('eveningPunch').value = e;
        document.getElementById('isLeave').checked = leave;
        document.getElementById('isLeave').dispatchEvent(new Event('change'));
        window.scrollTo({top: 0, behavior: 'smooth'});
    };

    function formatMins(m) {
        const h = Math.floor(Math.abs(m)/60), mi = Math.abs(m)%60;
        return `${m < 0 ? '-' : ''}${h}h ${String(mi).padStart(2, '0')}m`;
    }

    function toggleLoader(s) { document.getElementById('loader').style.display = s ? 'flex' : 'none'; }
    
    document.getElementById('isLeave').onchange = (e) => {
        const g = document.getElementById('timeInputGroup');
        g.style.opacity = e.target.checked ? "0.3" : "1";
        g.style.pointerEvents = e.target.checked ? "none" : "auto";
    };

    monthFilter.onchange = loadData;
    document.getElementById('logoutBtn').onclick = () => { localStorage.clear(); location.reload(); };

    // Password Reset
    document.getElementById('gotoReset').onclick = () => { document.getElementById('loginCard').style.display='none'; document.getElementById('resetCard').style.display='block'; };
    document.getElementById('backToLogin').onclick = () => { document.getElementById('resetCard').style.display='none'; document.getElementById('loginCard').style.display='block'; };
    document.getElementById('submitReset').onclick = async () => {
        const u = document.getElementById('resetUser').value.trim();
        const op = document.getElementById('oldPassword').value;
        const np = document.getElementById('newPassword').value;
        toggleLoader(true);
        const res = await fetch(WEB_APP_URL, {method: 'POST', body: JSON.stringify({action: 'changePassword', username: u, oldPassword: op, newPassword: np})});
        const json = await res.json();
        toggleLoader(false);
        if(json.success) { alert("Password Updated Successfully!"); location.reload(); } else { alert(json.msg); }
    };
});

