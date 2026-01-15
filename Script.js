const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbxREId4_macnQe4KOCi5i_zD9L5cmzu2EjwdXRilBZri26_Y3H59S00_a_Pm80NS6QhOA/exec";

// Global Loader Function (Defined outside to be accessible everywhere)
function toggleLoader(show) {
    const loader = document.getElementById('loader');
    if (loader) loader.style.display = show ? 'flex' : 'none';
}

document.addEventListener('DOMContentLoaded', () => {
    const monthFilter = document.getElementById('monthFilter');
    const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const now = new Date();

    // 1. Initialize Month Filter
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

    // 2. Check Session
    if (localStorage.getItem('user')) {
        showApp(localStorage.getItem('name'));
    }

    // 3. Login Logic
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
                showApp(json.name);
            } else {
                alert("Incorrect Login Details");
                toggleLoader(false);
            }
        } catch (e) {
            alert("Network Error: Could not connect to Google Script.");
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

    // 4. Data Loading
    async function loadData() {
        toggleLoader(true);
        const user = localStorage.getItem('user');
        const month = monthFilter.value;
        try {
            const res = await fetch(WEB_APP_URL, {
                method: 'POST',
                body: JSON.stringify({ action: 'getEntries', username: user, month: month })
            });
            const data = await res.json();
            renderTable(data);
        } catch (e) {
            console.error("Error loading data:", e);
        } finally {
            toggleLoader(false);
        }
    }

    // 5. Save/Sync Logic
    document.getElementById('saveBtn').onclick = async () => {
        const date = document.getElementById('punchDate').value;
        if (!date) return alert("Select Date");
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
                    morning: mInput,
                    evening: eInput,
                    isLeave: leave,
                    diff: stats.diff,
                    status: stats.status
                })
            });
            await loadData();
            alert("Attendance Synced Successfully!");
        } catch (err) {
            alert("Save Failed");
            toggleLoader(false);
        }
    };

    // 6. Table Rendering
    function renderTable(data) {
        const tbody = document.querySelector('#timeTable tbody');
        const totalEl = document.getElementById('totalTime');
        tbody.innerHTML = '';
        let total = 0;

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 30px;">No records found.</td></tr>';
            totalEl.innerText = "0h 00m";
            totalEl.className = "total-amount";
            return;
        }

        data.sort((a, b) => new Date(a.date) - new Date(b.date)).forEach((row, index) => {
            total += parseInt(row.diff || 0);
            const r = tbody.insertRow();
            r.className = 'fade-in-row';
            r.style.animationDelay = `${index * 0.05}s`;

            const d = row.date.split('-').reverse().join('/');

            r.innerHTML = `
                <td>${d}</td>
                <td>${row.isLeave ? '<span class="dash">-</span>' : row.morning}</td>
                <td>${row.isLeave ? '<span class="dash">-</span>' : row.evening}</td>
                <td><span class="badge ${row.status.toLowerCase().replace(' ', '-')}">${row.status}</span></td>
                <td class="${row.diff < 0 ? 'neg' : 'pos'}">${formatMins(row.diff)}</td>
                <td class="action-cell">
                    <button class="btn-action edit" onclick="editRow('${row.date}','${row.morning}','${row.evening}',${row.isLeave})" title="Edit"><i class="fas fa-pen"></i></button>
                    <button class="btn-action delete" onclick="deleteRow('${row.date}')" title="Delete"><i class="fas fa-trash"></i></button>
                </td>
            `;
        });

        totalEl.innerText = formatMins(total);
        totalEl.className = total < 0 ? "total-amount neg" : "total-amount pos";
    }

    // 7. Global Actions (Window Scope)
    window.deleteRow = async (date) => {
        if (!confirm(`Are you sure you want to delete the entry for ${date}?`)) return;
        toggleLoader(true);
        try {
            const res = await fetch(WEB_APP_URL, {
                method: 'POST',
                body: JSON.stringify({
                    action: 'deleteEntry',
                    username: localStorage.getItem('user'),
                    date: date
                })
            });
            await loadData();
        } catch (e) {
            alert("Delete failed");
            toggleLoader(false);
        }
    };

    window.editRow = (date, m, e, leave) => {
        document.getElementById('punchDate').value = date;
        document.getElementById('morningPunch').value = m;
        document.getElementById('eveningPunch').value = e;
        document.getElementById('isLeave').checked = leave;
        document.getElementById('isLeave').dispatchEvent(new Event('change'));
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // 8. Calculation Helpers
    function calculateShift(m, e, leave) {
        if (leave) return { diff: 0, status: 'Leave' };
        const toM = t => { const [h, mi] = t.split(':').map(Number); return h * 60 + mi; };
        const inM = toM(m), outM = toM(e), lateL = toM('09:30'), baseS = toM('09:15'), stdE = toM('19:00');
        let diff = 0, status = "On-Time";
        if (inM > lateL) { diff -= (inM - baseS); status = "Late"; }
        diff += (outM - stdE);
        if (diff > 0 && status !== "Late") status = "Overtime";
        if (diff < 0 && status === "On-Time") status = "Early-Exit";
        if (diff >= 0 && status === "Late") status = "Balanced";
        return { diff, status };
    }

    function formatMins(m) {
        const h = Math.floor(Math.abs(m) / 60), mi = Math.abs(m) % 60;
        return `${m < 0 ? '-' : ''}${h}h ${String(mi).padStart(2, '0')}m`;
    }

    // 9. UI Events
    document.getElementById('isLeave').onchange = (e) => {
        const group = document.getElementById('timeInputGroup');
        group.style.opacity = e.target.checked ? "0.3" : "1";
        group.style.filter = e.target.checked ? "grayscale(1)" : "none";
        group.style.pointerEvents = e.target.checked ? "none" : "auto";
    };

    monthFilter.onchange = loadData;

    document.getElementById('logoutBtn').onclick = () => {
        if (confirm("Logout from TimeFlow Pro?")) {
            localStorage.clear();
            location.reload();
        }
    };

    // 10. Password Reset
    document.getElementById('gotoReset').onclick = () => {
        document.getElementById('loginCard').style.display = 'none';
        document.getElementById('resetCard').style.display = 'block';
    };

    document.getElementById('backToLogin').onclick = () => {
        document.getElementById('resetCard').style.display = 'none';
        document.getElementById('loginCard').style.display = 'block';
    };

    document.getElementById('submitReset').onclick = async () => {
        const u = document.getElementById('resetUser').value.trim();
        const op = document.getElementById('oldPassword').value;
        const np = document.getElementById('newPassword').value;

        if (!u || !op || !np) return alert("Please fill all fields");

        toggleLoader(true);
        try {
            const res = await fetch(WEB_APP_URL, {
                method: 'POST',
                body: JSON.stringify({
                    action: 'changePassword',
                    username: u,
                    oldPassword: op,
                    newPassword: np
                })
            });
            const json = await res.json();
            if (json.success) {
                alert("Password Changed Successfully!");
                location.reload();
            } else {
                alert(json.msg || "Reset failed");
                toggleLoader(false);
            }
        } catch (e) {
            alert("Error connecting to server");
            toggleLoader(false);
        }
    };
});
