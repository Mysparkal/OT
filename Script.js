// REPLACE THIS URL WITH YOUR DEPLOYED WEB APP URL
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

    // --- AUTH LOGIC ---
    if(localStorage.getItem('user')) showApp(localStorage.getItem('name'));

    document.getElementById('loginBtn').onclick = async () => {
        const u = document.getElementById('username').value;
        const p = document.getElementById('password').value;
        if(!u || !p) return;
        loader.style.display = 'flex';
        const res = await fetch(WEB_APP_URL, {method: 'POST', body: JSON.stringify({action: 'login', username: u, password: p})});
        const json = await res.json();
        loader.style.display = 'none';
        if(json.success) {
            localStorage.setItem('user', u);
            localStorage.setItem('name', json.name);
            showApp(json.name);
        } else {
            document.getElementById('errorMsg').innerText = "Invalid Credentials";
        }
    };

    document.getElementById('gotoReset').onclick = () => {
        document.getElementById('loginCard').style.display = 'none';
        document.getElementById('resetCard').style.display = 'block';
    };

    document.getElementById('backToLogin').onclick = () => {
        document.getElementById('resetCard').style.display = 'none';
        document.getElementById('loginCard').style.display = 'block';
    };

    document.getElementById('submitReset').onclick = async () => {
        const u = document.getElementById('resetUser').value;
        const oldP = document.getElementById('oldPassword').value;
        const newP = document.getElementById('newPassword').value;
        loader.style.display = 'flex';
        const res = await fetch(WEB_APP_URL, {method: 'POST', body: JSON.stringify({action: 'changePassword', username: u, oldPassword: oldP, newPassword: newP})});
        const json = await res.json();
        loader.style.display = 'none';
        if(json.success) {
            alert("Password Updated!");
            location.reload();
        } else {
            document.getElementById('resetMsg').innerText = json.msg;
        }
    };

    // --- APP LOGIC ---
    function showApp(name) {
        loginSection.style.display = 'none';
        appSection.style.display = 'block';
        document.getElementById('welcomeName').innerText = name;
        document.getElementById('userInitial').innerText = name.charAt(0);
        document.getElementById('punchDate').valueAsDate = new Date();
        loadData();
    }

    async function loadData() {
        loader.style.display = 'flex';
        const res = await fetch(WEB_APP_URL, {method: 'POST', body: JSON.stringify({action: 'getEntries', username: localStorage.getItem('user'), month: monthFilter.value})});
        renderTable(await res.json());
        loader.style.display = 'none';
    }

    isLeave.onchange = () => {
        timeGroup.style.opacity = isLeave.checked ? "0.2" : "1";
        timeGroup.style.pointerEvents = isLeave.checked ? "none" : "auto";
    };

    document.getElementById('saveBtn').onclick = async () => {
        const date = document.getElementById('punchDate').value;
        const m = document.getElementById('morningPunch').value;
        const e = document.getElementById('eveningPunch').value;
        if(!date) return alert("Select Date");

        const stats = calculateShift(m, e, isLeave.checked);
        loader.style.display = 'flex';
        await fetch(WEB_APP_URL, {method: 'POST', body: JSON.stringify({
            action: 'saveEntry', username: localStorage.getItem('user'),
            date, month: monthFilter.value, morning: m, evening: e, isLeave: isLeave.checked,
            diff: stats.diff, status: stats.status
        })});
        loadData();
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
        data.sort((a,b) => new Date(a.date) - new Date(b.date)).forEach(row => {
            total += parseInt(row.diff);
            const r = tbody.insertRow();
            r.innerHTML = `<td>${row.date.split('-').reverse().join('/')}</td>
                           <td>${row.isLeave ? '-' : row.morning}</td>
                           <td>${row.isLeave ? '-' : row.evening}</td>
                           <td><span class="badge ${row.status.toLowerCase()}">${row.status}</span></td>
                           <td class="${row.diff < 0 ? 'neg' : 'pos'}">${formatMins(row.diff)}</td>`;
        });
        document.getElementById('totalTime').innerText = formatMins(total);
        document.getElementById('totalTime').className = total < 0 ? 'neg' : 'pos';
    }

    function formatMins(m) {
        const h = Math.floor(Math.abs(m)/60), mi = Math.abs(m)%60;
        return `${m < 0 ? '-' : ''}${h}h ${mi}m`;
    }

    monthFilter.onchange = loadData;
    document.getElementById('logoutBtn').onclick = () => { localStorage.clear(); location.reload(); };
});