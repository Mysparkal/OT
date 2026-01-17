const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbxREId4_macnQe4KOCi5i_zD9L5cmzu2EjwdXRilBZri26_Y3H59S00_a_Pm80NS6QhOA/exec";

function toggleLoader(show) {
    const loader = document.getElementById('loader');
    if (loader) loader.style.display = show ? 'flex' : 'none';
}

document.addEventListener('DOMContentLoaded', () => {
    const monthFilter = document.getElementById('monthFilter');
    const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const now = new Date();

    if (monthFilter) {
        monthFilter.innerHTML = '';
        months.forEach((m, i) => {
            let opt = document.createElement('option');
            opt.value = `${m}-${now.getFullYear()}`;
            opt.innerHTML = opt.value;
            if (i === now.getMonth()) opt.selected = true;
            monthFilter.appendChild(opt);
        });
    }

    if(localStorage.getItem('user')) showApp(localStorage.getItem('name'));

    document.getElementById('loginBtn').onclick = async () => {
        const u = document.getElementById('username').value.trim();
        const p = document.getElementById('password').value;
        if (!u || !p) return alert("Please enter Username and Password");

        toggleLoader(true);
        try {
            const res = await fetch(WEB_APP_URL, {
                method: 'POST',
                body: JSON.stringify({ action: 'login', username: u, password: p })
            });
            const json = await res.json();
            if (json.success) {
                localStorage.setItem('user', u);
                localStorage.setItem('name', json.name);
                localStorage.setItem('userShift', json.shiftEnd); // Store 18:00 or 19:00
                showApp(json.name);
            } else {
                alert("Incorrect Login Details");
                toggleLoader(false);
            }
        } catch (e) {
            alert("Network Error");
            toggleLoader(false);
        }
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
        } catch (e) { console.error(e); } finally { toggleLoader(false); }
    }

    document.getElementById('saveBtn').onclick = async () => {
        const date = document.getElementById('punchDate').value;
        if (!date) return alert("Select Date");
        const leave = document.getElementById('isLeave').checked;
        const mIn = document.getElementById('morningPunch').value;
        const eOut = document.getElementById('eveningPunch').value;
        
        // Get shift from storage
        const shiftEnd = localStorage.getItem('userShift') || "19:00";
        const stats = calculateShift(mIn, eOut, leave, shiftEnd);

        toggleLoader(true);
        try {
            await fetch(WEB_APP_URL, {
                method: 'POST',
                body: JSON.stringify({
                    action: 'saveEntry', username: localStorage.getItem('user'),
                    date, month: monthFilter.value, morning: mIn, evening: eOut, 
                    isLeave: leave, diff: stats.diff, status: stats.status
                })
            });
            loadData();
        } catch (err) { toggleLoader(false); }
    };

    function renderTable(data) {
        const tbody = document.querySelector('#timeTable tbody');
        const totalEl = document.getElementById('totalTime');
        tbody.innerHTML = '';
        let total = 0;

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 30px;">No records found.</td></tr>';
            totalEl.innerText = "0h 00m";
            return;
        }

        data.sort((a, b) => new Date(a.date) - new Date(b.date)).forEach((row, i) => {
            total += parseInt(row.diff || 0);
            const r = tbody.insertRow();
            r.className = 'fade-in-row';
            r.style.animationDelay = `${i * 0.05}s`;
            
            const d = row.date.split('-').reverse().join('/');

            // Updated logic for "--" on leave
            r.innerHTML = `
                <td>${d}</td>
                <td>${row.isLeave === true || row.isLeave === "true" ? '--' : row.morning}</td>
                <td>${row.isLeave === true || row.isLeave === "true" ? '--' : row.evening}</td>
                <td><span class="badge-status ${row.status.toLowerCase().replace(' ', '-')}">${row.status}</span></td>
                <td class="${row.diff < 0 ? 'neg' : 'pos'}">${formatMins(row.diff)}</td>
                <td style="text-align: right;">
                    <div class="action-btns">
                        <button class="icon-btn edit" onclick="editRow('${row.date}','${row.morning}','${row.evening}',${row.isLeave})"><i class="fas fa-edit"></i></button>
                        <button class="icon-btn delete" onclick="deleteRow('${row.date}')"><i class="fas fa-trash-alt"></i></button>
                    </div>
                </td>
            `;
        });

        totalEl.innerText = formatMins(total);
        totalEl.className = total < 0 ? "total-amount neg" : "total-amount pos";
    }

    function calculateShift(m, e, leave, stdEndStr) {
        if (leave) return { diff: 0, status: 'Leave' };
        const toM = t => { const [h, mi] = t.split(':').map(Number); return h * 60 + mi; };
        const inM = toM(m), outM = toM(e), lateL = toM('09:30'), baseS = toM('09:15'), stdE = toM(stdEndStr);
        let diff = 0, status = "On-Time";
        if (inM > lateL) { diff -= (inM - baseS); status = "Late"; }
        diff += (outM - stdE);
        if (diff > 0 && status !== "Late") status = "Overtime";
        if (diff < 0 && status === "On-Time") status = "Early-Exit";
        if (diff >= 0 && status === "Late") status = "Balanced";
        return { diff, status };
    }

    window.deleteRow = async (date) => {
        if (!confirm(`Delete entry for ${date}?`)) return;
        toggleLoader(true);
        try {
            await fetch(WEB_APP_URL, {
                method: 'POST',
                body: JSON.stringify({ action: 'deleteEntry', username: localStorage.getItem('user'), date: date })
            });
            loadData();
        } catch (e) { toggleLoader(false); }
    };

    window.editRow = (date, m, e, leave) => {
        document.getElementById('punchDate').value = date;
        document.getElementById('morningPunch').value = m;
        document.getElementById('eveningPunch').value = e;
        document.getElementById('isLeave').checked = leave;
        document.getElementById('isLeave').dispatchEvent(new Event('change'));
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    function formatMins(m) {
        const h = Math.floor(Math.abs(m) / 60), mi = Math.abs(m) % 60;
        return `${m < 0 ? '-' : ''}${h}h ${String(mi).padStart(2, '0')}m`;
    }

    document.getElementById('isLeave').onchange = (e) => {
        const group = document.getElementById('timeInputGroup');
        group.style.opacity = e.target.checked ? "0.2" : "1";
        group.style.pointerEvents = e.target.checked ? "none" : "auto";
    };

    monthFilter.onchange = loadData;
    document.getElementById('logoutBtn').onclick = () => { localStorage.clear(); location.reload(); };
    document.getElementById('gotoReset').onclick = () => { document.getElementById('loginCard').style.display = 'none'; document.getElementById('resetCard').style.display = 'block'; };
    document.getElementById('backToLogin').onclick = () => { document.getElementById('resetCard').style.display = 'none'; document.getElementById('loginCard').style.display = 'block'; };
    document.getElementById('submitReset').onclick = async () => {
        const u = document.getElementById('resetUser').value.trim();
        const op = document.getElementById('oldPassword').value;
        const np = document.getElementById('newPassword').value;
        if (!u || !op || !np) return;
        toggleLoader(true);
        const res = await fetch(WEB_APP_URL, { method: 'POST', body: JSON.stringify({ action: 'changePassword', username: u, oldPassword: op, newPassword: np }) });
        const json = await res.json();
        if (json.success) { alert("Password Changed!"); location.reload(); } else { alert(json.msg); toggleLoader(false); }
    };
});
