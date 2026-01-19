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

    if (localStorage.getItem('user')) showApp(localStorage.getItem('name'));

    // --- LOGIN ---
    document.getElementById('loginBtn').onclick = async () => {
        const u = document.getElementById('username').value.trim();
        const p = document.getElementById('password').value;
        if (!u || !p) return alert("Enter credentials");

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
                localStorage.setItem('shiftEnd', json.shiftEnd || "19:00");
                showApp(json.name);
            } else {
                alert("Login Failed");
                toggleLoader(false);
            }
        } catch (e) { alert("Network Error"); toggleLoader(false); }
    };

    function showApp(name) {
        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('appSection').style.display = 'block';
        document.getElementById('welcomeName').innerText = `Hi ${name}`;
        const sEnd = localStorage.getItem('shiftEnd') || "19:00";
        document.getElementById('shiftDisplay').innerText = `Shift: 09:15 to ${sEnd}`;
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
        } catch (e) { console.error(e); }
        finally { toggleLoader(false); }
    }

    // --- SAVE ---
    document.getElementById('saveBtn').onclick = async () => {
        const date = document.getElementById('punchDate').value;
        if (!date) return alert("Select Date");
        const leave = document.getElementById('isLeave').checked;
        const stats = calculateShift(document.getElementById('morningPunch').value, document.getElementById('eveningPunch').value, leave);

        toggleLoader(true);
        try {
            await fetch(WEB_APP_URL, {
                method: 'POST',
                body: JSON.stringify({
                    action: 'saveEntry',
                    username: localStorage.getItem('user'),
                    date: date,
                    month: monthFilter.value,
                    morning: document.getElementById('morningPunch').value,
                    evening: document.getElementById('eveningPunch').value,
                    isLeave: leave,
                    diff: stats.diff,
                    status: stats.status
                })
            });
            await loadData();
            alert("Synced!");
        } catch (err) { alert("Failed"); }
        finally { toggleLoader(false); }
    };

    function renderTable(data) {
        const tbody = document.querySelector('#timeTable tbody');
        const totalEl = document.getElementById('totalTime');
        tbody.innerHTML = '';
        let total = 0;

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No records.</td></tr>';
            totalEl.innerText = "0h 00m";
            return;
        }

        data.sort((a, b) => new Date(a.date) - new Date(b.date)).forEach((row) => {
            total += parseInt(row.diff || 0);
            const r = tbody.insertRow();
            const d = row.date.split('-').reverse().join('/');

            // Force "--" if Leave is true
            const mVal = row.isLeave ? '--' : row.morning;
            const eVal = row.isLeave ? '--' : row.evening;
            const diffDisplay = row.isLeave ? '0h 00m' : formatMins(row.diff);

            r.innerHTML = `
                <td>${d}</td>
                <td style="font-weight:600;">${mVal}</td>
                <td style="font-weight:600;">${eVal}</td>
                <td><span class="badge ${row.status.toLowerCase().replace(' ', '-')}">${row.status}</span></td>
                <td class="${row.diff < 0 ? 'neg' : 'pos'}">${diffDisplay}</td>
                <td>
                    <button class="btn-action edit" onclick="editRow('${row.date}','${row.morning}','${row.evening}',${row.isLeave})"><i class="fas fa-pen"></i></button>
                    <button class="btn-action delete" onclick="deleteRow('${row.date}')"><i class="fas fa-trash"></i></button>
                </td>
            `;
        });
        totalEl.innerText = formatMins(total);
        totalEl.className = total < 0 ? "total-amount neg" : "total-amount pos";
    }

    function calculateShift(m, e, leave) {
        if (leave) return { diff: 0, status: 'Leave' };
        const toM = t => { const [h, mi] = t.split(':').map(Number); return h * 60 + mi; };
        const inM = toM(m), outM = toM(e);
        const graceLimit = toM('09:30'), shiftStart = toM('09:15');
        const shiftEnd = toM(localStorage.getItem('shiftEnd') || "19:00");
        let diff = 0, status = "On-Time";
        if (inM > graceLimit) { diff -= (inM - shiftStart); status = "Late"; }
        diff += (outM - shiftEnd);
        if (diff > 0 && status !== "Late") status = "Overtime";
        if (diff < 0 && status === "On-Time") status = "Early-Exit";
        if (diff >= 0 && status === "Late") status = "Balanced";
        return { diff, status };
    }

    function formatMins(m) {
        const h = Math.floor(Math.abs(m) / 60), mi = Math.abs(m) % 60;
        return `${m < 0 ? '-' : ''}${h}h ${String(mi).padStart(2, '0')}m`;
    }

    // --- RESET PASSWORD LOGIC ---
    document.getElementById('submitReset').onclick = async () => {
        const u = document.getElementById('resetUser').value.trim();
        const op = document.getElementById('oldPassword').value;
        const np = document.getElementById('newPassword').value;
        if (!u || !op || !np) return alert("Fill all fields");

        toggleLoader(true);
        try {
            const res = await fetch(WEB_APP_URL, {
                method: 'POST',
                body: JSON.stringify({ action: 'changePassword', username: u, oldPassword: op, newPassword: np })
            });
            const json = await res.json();
            if (json.success) {
                alert("Password Updated!");
                location.reload();
            } else {
                alert(json.msg || "Update failed");
                toggleLoader(false);
            }
        } catch (e) { alert("Error"); toggleLoader(false); }
    };

    // UI Helpers
    document.getElementById('gotoReset').onclick = () => { document.getElementById('loginCard').style.display='none'; document.getElementById('resetCard').style.display='block'; };
    document.getElementById('backToLogin').onclick = () => { document.getElementById('resetCard').style.display='none'; document.getElementById('loginCard').style.display='block'; };
    document.getElementById('isLeave').onchange = (e) => {
        const group = document.getElementById('timeInputGroup');
        group.style.opacity = e.target.checked ? "0.3" : "1";
        group.style.pointerEvents = e.target.checked ? "none" : "auto";
    };
    monthFilter.onchange = loadData;
    document.getElementById('logoutBtn').onclick = () => { localStorage.clear(); location.reload(); };

    window.deleteRow = async (date) => {
        if(!confirm("Delete?")) return;
        toggleLoader(true);
        await fetch(WEB_APP_URL, { method: 'POST', body: JSON.stringify({ action: 'deleteEntry', username: localStorage.getItem('user'), date: date }) });
        loadData();
    };

    window.editRow = (date, m, e, leave) => {
        document.getElementById('punchDate').value = date;
        document.getElementById('morningPunch').value = m;
        document.getElementById('eveningPunch').value = e;
        document.getElementById('isLeave').checked = leave;
        document.getElementById('isLeave').dispatchEvent(new Event('change'));
    };
});
