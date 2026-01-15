const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbxREId4_macnQe4KOCi5i_zD9L5cmzu2EjwdXRilBZri26_Y3H59S00_a_Pm80NS6QhOA/exec";

document.addEventListener('DOMContentLoaded', () => {
    // Select Elements
    const loginSection = document.getElementById('loginSection');
    const appSection = document.getElementById('appSection');
    const welcomeName = document.getElementById('welcomeName');
    const userInitial = document.getElementById('userInitial');
    const monthFilter = document.getElementById('monthFilter');
    const loader = document.getElementById('loader');

    // Init Month Dropdown
    const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const now = new Date();
    months.forEach((m, i) => {
        let opt = document.createElement('option');
        opt.value = `${m}-${now.getFullYear()}`;
        opt.innerHTML = opt.value;
        if(i === now.getMonth()) opt.selected = true;
        monthFilter.appendChild(opt);
    });

    // --- CHECK SESSION ---
    const savedName = localStorage.getItem('name');
    const savedUser = localStorage.getItem('user');
    if(savedUser) showApp(savedName);

    // --- LOGIN ---
    document.getElementById('loginBtn').onclick = async () => {
        const u = document.getElementById('username').value.trim();
        const p = document.getElementById('password').value;
        if(!u || !p) return alert("Enter credentials");
        
        toggleLoader(true);
        const res = await fetch(WEB_APP_URL, {method: 'POST', body: JSON.stringify({action: 'login', username: u, password: p})});
        const json = await res.json();
        toggleLoader(false);

        if(json.success) {
            localStorage.setItem('user', u);
            localStorage.setItem('name', json.name);
            showApp(json.name);
        } else {
            document.getElementById('errorMsg').innerText = "Invalid Login";
        }
    };

    function showApp(name) {
        loginSection.style.display = 'none';
        appSection.style.display = 'block';
        welcomeName.innerText = `Hi ${name}`;
        userInitial.innerText = name.charAt(0).toUpperCase();
        document.getElementById('punchDate').valueAsDate = new Date();
        loadData();
    }

    // --- DATA HANDLING ---
    async function loadData() {
        toggleLoader(true);
        const res = await fetch(WEB_APP_URL, {
            method: 'POST', 
            body: JSON.stringify({
                action: 'getEntries', 
                username: localStorage.getItem('user'), 
                month: monthFilter.value
            })
        });
        const data = await res.json();
        renderTable(data);
        toggleLoader(false);
    }

    document.getElementById('saveBtn').onclick = async () => {
        const date = document.getElementById('punchDate').value;
        if(!date) return alert("Select Date");
        
        const isLeave = document.getElementById('isLeave').checked;
        const morning = document.getElementById('morningPunch').value;
        const evening = document.getElementById('eveningPunch').value;
        
        const stats = calculateShift(morning, evening, isLeave);
        
        toggleLoader(true);
        await fetch(WEB_APP_URL, {
            method: 'POST', 
            body: JSON.stringify({
                action: 'saveEntry', 
                username: localStorage.getItem('user'),
                date: date, 
                month: monthFilter.value,
                morning: morning, 
                evening: evening, 
                isLeave: isLeave,
                diff: stats.diff, 
                status: stats.status
            })
        });
        await loadData();
        alert("Synced successfully!");
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
        const totalEl = document.getElementById('totalTime');
            totalEl.innerText = formatMins(total);

        // Dynamic styling for Monthly Balance
            if (total < 0) {
                totalEl.classList.add('neg');
                totalEl.classList.remove('pos');
            } else if (total > 0) {
                totalEl.classList.add('pos');
                totalEl.classList.remove('neg');
            } else {
                totalEl.classList.remove('pos', 'neg');
            }
        const tbody = document.querySelector('#timeTable tbody');
        tbody.innerHTML = '';
        let total = 0;
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
        document.getElementById('totalTime').innerText = formatMins(total);
        document.getElementById('totalTime').className = total < 0 ? 'total-value neg' : 'total-value pos';
    }

    // Helpers
    function formatMins(m) {
        const h = Math.floor(Math.abs(m)/60), mi = Math.abs(m)%60;
        return `${m < 0 ? '-' : ''}${h}h ${String(mi).padStart(2, '0')}m`;
    }

    function toggleLoader(s) { loader.style.display = s ? 'flex' : 'none'; }
    
    // UI Effects
    document.getElementById('isLeave').onchange = (e) => {
        const inputs = document.getElementById('timeInputGroup');
        inputs.style.opacity = e.target.checked ? "0.3" : "1";
        inputs.style.pointerEvents = e.target.checked ? "none" : "auto";
    };

    window.editRow = (date, m, e, leave) => {
        document.getElementById('punchDate').value = date;
        document.getElementById('morningPunch').value = m;
        document.getElementById('eveningPunch').value = e;
        document.getElementById('isLeave').checked = leave;
        document.getElementById('isLeave').dispatchEvent(new Event('change'));
        window.scrollTo({top: 0, behavior: 'smooth'});
    };

    // Auth Card Toggles
    document.getElementById('gotoReset').onclick = () => { document.getElementById('loginCard').style.display='none'; document.getElementById('resetCard').style.display='block'; };
    document.getElementById('backToLogin').onclick = () => { document.getElementById('resetCard').style.display='none'; document.getElementById('loginCard').style.display='block'; };
    
    document.getElementById('logoutBtn').onclick = () => { localStorage.clear(); location.reload(); };
    monthFilter.onchange = loadData;
});

