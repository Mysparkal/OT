const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbxREId4_macnQe4KOCi5i_zD9L5cmzu2EjwdXRilBZri26_Y3H59S00_a_Pm80NS6QhOA/exec";

// Supported Shift Presets
const SHIFTS = {
    "09:15-19:00": {
        id: "09:15-19:00",
        start: "09:15",
        end: "19:00",
        graceMins: 15,
        label: "Shift 1: 09:15 AM – 07:00 PM (15m Grace)"
    },
    "09:30-18:30": {
        id: "09:30-18:30",
        start: "09:30",
        end: "18:30",
        graceMins: 0, // Hardcore: no grace period
        label: "Shift 2: 09:30 AM – 06:30 PM (No Grace)"
    }
};

let allRecords = [];
let activeFilter = "all";
let pendingDeleteDate = null;
let isEditing = false;

function toggleLoader(show) {
    const loader = document.getElementById("loader");
    if (loader) loader.style.display = show ? "flex" : "none";
}

function showToast(message, type = "info") {
    const container = document.getElementById("toastContainer");
    if (!container) return;

    const icons = {
        success: "fa-check-circle",
        error: "fa-exclamation-circle",
        info: "fa-info-circle"
    };

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add("toast-out");
        toast.addEventListener("animationend", () => toast.remove(), { once: true });
    }, 3200);
}

function getTodayLocalISO() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function getActiveShift() {
    const savedId = localStorage.getItem("activeShift");
    if (savedId && SHIFTS[savedId]) return SHIFTS[savedId];

    const backendShiftEnd = localStorage.getItem("shiftEnd");
    if (backendShiftEnd === "18:30") return SHIFTS["09:30-18:30"];
    return SHIFTS["09:15-19:00"];
}

function formatDailyMinutes(m) {
    const num = parseInt(m || 0, 10);
    if (num > 0) return `+${num} min`;
    if (num < 0) return `${num} min`;
    return "0 min";
}

document.addEventListener("DOMContentLoaded", () => {
    const monthFilter = document.getElementById("monthFilter");
    const months = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];
    const now = new Date();

    if (monthFilter) {
        monthFilter.innerHTML = "";
        months.forEach((m, i) => {
            const opt = document.createElement("option");
            opt.value = `${m}-${now.getFullYear()}`;
            opt.textContent = opt.value;
            if (i === now.getMonth()) opt.selected = true;
            monthFilter.appendChild(opt);
        });
    }

    // Password visibility toggles
    document.querySelectorAll(".toggle-pass").forEach((btn) => {
        btn.addEventListener("click", () => {
            const input = document.getElementById(btn.dataset.target);
            if (!input) return;
            const isHidden = input.type === "password";
            input.type = isHidden ? "text" : "password";
            btn.innerHTML = `<i class="fas ${isHidden ? "fa-eye-slash" : "fa-eye"}"></i>`;
        });
    });

    // Shift switcher events
    document.querySelectorAll(".shift-pill").forEach((pill) => {
        pill.addEventListener("click", () => {
            const shiftId = pill.dataset.shift;
            if (!SHIFTS[shiftId]) return;
            applyShift(shiftId, !isEditing);
            updateLivePreview();
            showToast(`Switched to ${SHIFTS[shiftId].label}`, "info");
        });
    });

    // Status filter chips
    document.querySelectorAll(".filter-chip").forEach((chip) => {
        chip.addEventListener("click", () => {
            document.querySelectorAll(".filter-chip").forEach((c) => c.classList.remove("active"));
            chip.classList.add("active");
            activeFilter = chip.dataset.filter;
            renderTable(allRecords);
        });
    });

    // Live preview listeners
    ["morningPunch", "eveningPunch", "isLeave"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener("input", updateLivePreview);
    });

    if (localStorage.getItem("user")) {
        showApp(localStorage.getItem("name") || localStorage.getItem("user"));
    }

    // --- LOGIN ---
    document.getElementById("loginForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const u = document.getElementById("username").value.trim();
        const p = document.getElementById("password").value;
        const errEl = document.getElementById("errorMsg");
        const card = document.getElementById("loginCard");

        errEl.textContent = "";
        if (!u || !p) {
            errEl.textContent = "Please enter both username and password.";
            triggerShake(card);
            return;
        }

        toggleLoader(true);
        try {
            const res = await fetch(WEB_APP_URL, {
                method: "POST",
                body: JSON.stringify({ action: "login", username: u, password: p })
            });
            const json = await res.json();
            if (json.success) {
                localStorage.setItem("user", u);
                localStorage.setItem("name", json.name || u);
                localStorage.setItem("shiftEnd", json.shiftEnd || "19:00");

                const defaultShift = json.shiftEnd === "18:30" ? "09:30-18:30" : "09:15-19:00";
                localStorage.setItem("activeShift", defaultShift);

                showToast(`Welcome back, ${json.name || u}!`, "success");
                showApp(json.name || u);
            } else {
                errEl.textContent = json.msg || "Invalid username or password.";
                triggerShake(card);
                toggleLoader(false);
            }
        } catch (err) {
            errEl.textContent = "Network error. Please try again.";
            triggerShake(card);
            toggleLoader(false);
        }
    });

    // --- RESET PASSWORD ---
    document.getElementById("resetForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const u = document.getElementById("resetUser").value.trim();
        const op = document.getElementById("oldPassword").value;
        const np = document.getElementById("newPassword").value;
        const msgEl = document.getElementById("resetMsg");
        const card = document.getElementById("resetCard");

        msgEl.textContent = "";
        if (!u || !op || !np) {
            msgEl.textContent = "Please fill in all fields.";
            triggerShake(card);
            return;
        }

        toggleLoader(true);
        try {
            const res = await fetch(WEB_APP_URL, {
                method: "POST",
                body: JSON.stringify({ action: "changePassword", username: u, oldPassword: op, newPassword: np })
            });
            const json = await res.json();
            if (json.success) {
                showToast("Password updated! Please sign in.", "success");
                document.getElementById("resetForm").reset();
                document.getElementById("resetCard").style.display = "none";
                document.getElementById("loginCard").style.display = "block";
            } else {
                msgEl.textContent = json.msg || "Password update failed.";
                triggerShake(card);
            }
        } catch (err) {
            msgEl.textContent = "Network error. Please try again.";
            triggerShake(card);
        } finally {
            toggleLoader(false);
        }
    });

    // --- SAVE ENTRY ---
    document.getElementById("saveBtn").addEventListener("click", async () => {
        const date = document.getElementById("punchDate").value;
        if (!date) {
            showToast("Please select a date first.", "error");
            return;
        }

        const leave = document.getElementById("isLeave").checked;
        const morning = document.getElementById("morningPunch").value;
        const evening = document.getElementById("eveningPunch").value;

        if (!leave && (!morning || !evening)) {
            showToast("Please enter both Morning In and Evening Out times.", "error");
            return;
        }

        const stats = calculateShift(morning, evening, leave);

        toggleLoader(true);
        try {
            await fetch(WEB_APP_URL, {
                method: "POST",
                body: JSON.stringify({
                    action: "saveEntry",
                    username: localStorage.getItem("user"),
                    date: date,
                    month: monthFilter.value,
                    morning: morning,
                    evening: evening,
                    isLeave: leave,
                    diff: stats.diff,
                    status: stats.status
                })
            });
            exitEditMode();
            await loadData();
            showToast("Attendance synced to cloud!", "success");
        } catch (err) {
            showToast("Failed to sync entry. Check connection.", "error");
        } finally {
            toggleLoader(false);
        }
    });

    // --- UI SWITCHES ---
    document.getElementById("gotoReset").addEventListener("click", (e) => {
        e.preventDefault();
        document.getElementById("errorMsg").textContent = "";
        document.getElementById("loginCard").style.display = "none";
        document.getElementById("resetCard").style.display = "block";
    });

    document.getElementById("backToLogin").addEventListener("click", (e) => {
        e.preventDefault();
        document.getElementById("resetMsg").textContent = "";
        document.getElementById("resetCard").style.display = "none";
        document.getElementById("loginCard").style.display = "block";
    });

    document.getElementById("isLeave").addEventListener("change", (e) => {
        const group = document.getElementById("timeInputGroup");
        group.style.opacity = e.target.checked ? "0.3" : "1";
        group.style.pointerEvents = e.target.checked ? "none" : "auto";
        updateLivePreview();
    });

    document.getElementById("cancelEditBtn").addEventListener("click", () => {
        exitEditMode();
        showToast("Edit cancelled.", "info");
    });

    monthFilter.addEventListener("change", loadData);

    document.getElementById("logoutBtn").addEventListener("click", () => {
        localStorage.clear();
        location.reload();
    });

    // Modal Delete Handlers
    document.getElementById("cancelDeleteBtn").addEventListener("click", closeDeleteModal);
    document.getElementById("confirmModal").addEventListener("click", (e) => {
        if (e.target.id === "confirmModal") closeDeleteModal();
    });

    document.getElementById("confirmDeleteBtn").addEventListener("click", async () => {
        if (!pendingDeleteDate) return;
        const targetDate = pendingDeleteDate;
        closeDeleteModal();
        toggleLoader(true);
        try {
            await fetch(WEB_APP_URL, {
                method: "POST",
                body: JSON.stringify({
                    action: "deleteEntry",
                    username: localStorage.getItem("user"),
                    date: targetDate
                })
            });
            await loadData();
            showToast("Record deleted.", "success");
        } catch (err) {
            showToast("Failed to delete record.", "error");
        } finally {
            toggleLoader(false);
        }
    });

    function triggerShake(el) {
        el.classList.remove("shake");
        void el.offsetWidth;
        el.classList.add("shake");
    }

    function applyShift(shiftId, resetInputs = true) {
        const shift = SHIFTS[shiftId] || SHIFTS["09:15-19:00"];
        localStorage.setItem("activeShift", shift.id);
        localStorage.setItem("shiftEnd", shift.end);

        document.querySelectorAll(".shift-pill").forEach((pill) => {
            pill.classList.toggle("active", pill.dataset.shift === shift.id);
        });

        document.getElementById("shiftDisplay").textContent = shift.label;

        if (resetInputs) {
            document.getElementById("morningPunch").value = shift.start;
            document.getElementById("eveningPunch").value = shift.end;
        }
    }

    function showApp(name) {
        document.getElementById("loginSection").style.display = "none";
        document.getElementById("appSection").style.display = "block";
        document.getElementById("welcomeName").textContent = `Hi ${name}`;
        document.getElementById("userInitial").textContent = name.charAt(0).toUpperCase();
        document.getElementById("punchDate").value = getTodayLocalISO();

        const currentShift = getActiveShift();
        applyShift(currentShift.id, true);
        updateLivePreview();
        loadData();
    }

    async function loadData() {
        toggleLoader(true);
        try {
            const res = await fetch(WEB_APP_URL, {
                method: "POST",
                body: JSON.stringify({
                    action: "getEntries",
                    username: localStorage.getItem("user"),
                    month: monthFilter.value
                })
            });
            const data = await res.json();
            allRecords = Array.isArray(data) ? data : [];
            updateKPIs(allRecords);
            renderTable(allRecords);
        } catch (err) {
            console.error(err);
            showToast("Could not load attendance logs.", "error");
        } finally {
            toggleLoader(false);
        }
    }

    function updateKPIs(data) {
        let days = data.length;
        let onTimeCount = 0;
        let lateCount = 0;
        let leaveCount = 0;
        let totalDiff = 0;

        data.forEach((row) => {
            totalDiff += parseInt(row.diff || 0, 10);
            const st = (row.status || "").toLowerCase();
            if (row.isLeave || st === "leave") {
                leaveCount++;
            } else if (st === "on-time" || st === "overtime" || st === "balanced") {
                onTimeCount++;
            } else {
                lateCount++;
            }
        });

        document.getElementById("kpiDays").textContent = days;
        document.getElementById("kpiOnTime").textContent = onTimeCount;
        document.getElementById("kpiLate").textContent = lateCount;
        document.getElementById("kpiLeaves").textContent = leaveCount;

        // Monthly Accumulation & Progress Bar
        const totalEl = document.getElementById("totalTime");
        const bar = document.getElementById("progressBar");
        const statusText = document.getElementById("progressStatus");
        const percentText = document.getElementById("progressPercent");

        totalEl.textContent = formatMins(totalDiff);
        totalEl.className = totalDiff < 0 ? "total-amount neg" : "total-amount pos";

        const pct = Math.max(8, Math.min(100, Math.round(50 + (totalDiff / 6))));
        bar.style.width = `${pct}%`;

        if (totalDiff > 0) {
            bar.style.background = "linear-gradient(90deg, var(--primary), var(--success))";
            statusText.textContent = "Surplus hours banked";
        } else if (totalDiff < 0) {
            bar.style.background = "linear-gradient(90deg, var(--danger), var(--warning))";
            statusText.textContent = "Deficit to recover";
        } else {
            bar.style.background = "linear-gradient(90deg, var(--primary), var(--cyan))";
            statusText.textContent = "Balanced schedule";
        }
        percentText.textContent = formatDailyMinutes(totalDiff);
    }

    function renderTable(data) {
        const tbody = document.querySelector("#timeTable tbody");
        tbody.innerHTML = "";

        const filtered = data.filter((row) => {
            if (activeFilter === "all") return true;
            const st = (row.status || "").toLowerCase().replace(/\s+/g, "-");
            if (activeFilter === "leave") return row.isLeave || st === "leave";
            return st === activeFilter;
        });

        document.getElementById("tableCountText").textContent =
            `${filtered.length} ${filtered.length === 1 ? "record" : "records"} in ${monthFilter.value}`;

        if (!filtered || filtered.length === 0) {
            tbody.innerHTML = `
                <tr class="empty-row">
                    <td colspan="7" class="empty-state">
                        <i class="fas fa-calendar-times"></i>
                        No attendance records found for this view.
                    </td>
                </tr>`;
            return;
        }

        const sorted = [...filtered].sort((a, b) => new Date(b.date) - new Date(a.date));

        sorted.forEach((row, index) => {
            const tr = tbody.insertRow();
            tr.className = "fade-in-row";
            tr.style.animationDelay = `${Math.min(index * 0.04, 0.35)}s`;

            const d = row.date ? row.date.split("-").reverse().join("/") : "--";
            const isLeave = Boolean(row.isLeave);
            const mVal = isLeave ? "--" : (row.morning || "--");
            const eVal = isLeave ? "--" : (row.evening || "--");
            const statusText = row.status || (isLeave ? "Leave" : "On-Time");
            const badgeClass = statusText.toLowerCase().replace(/\s+/g, "-");
            const diffNum = parseInt(row.diff || 0, 10);

            const dailyText = isLeave ? "--" : formatDailyMinutes(diffNum);
            const dailyClass = isLeave || diffNum === 0 ? "neutral" : (diffNum < 0 ? "neg" : "pos");
            const diffDisplay = isLeave ? "0h 00m" : formatMins(diffNum);

            tr.innerHTML = `
                <td data-label="Date" style="font-weight:600;">${d}</td>
                <td data-label="In" style="font-weight:600;">${mVal}</td>
                <td data-label="Out" style="font-weight:600;">${eVal}</td>
                <td data-label="Status"><span class="badge ${badgeClass}">${statusText}</span></td>
                <td data-label="Daily +/-"><span class="daily-pill ${dailyClass}">${dailyText}</span></td>
                <td data-label="Diff" class="${diffNum < 0 ? "neg" : (diffNum > 0 ? "pos" : "neutral")}" style="font-weight:700;">${diffDisplay}</td>
                <td data-label="Actions">
                    <div class="action-cell">
                        <button type="button" class="btn-action edit" title="Edit Entry"
                            onclick="editRow('${row.date}','${row.morning || ""}','${row.evening || ""}',${isLeave})">
                            <i class="fas fa-pen"></i>
                        </button>
                        <button type="button" class="btn-action delete" title="Delete Entry"
                            onclick="deleteRow('${row.date}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            `;
        });
    }

    function calculateShift(m, e, leave) {
        if (leave) return { diff: 0, status: "Leave" };
        if (!m || !e) return { diff: 0, status: "On-Time" };

        const toM = (t) => {
            const [h, mi] = t.split(":").map(Number);
            return h * 60 + mi;
        };

        const shift = getActiveShift();
        const inM = toM(m);
        const outM = toM(e);
        const shiftStart = toM(shift.start);
        const graceLimit = shiftStart + shift.graceMins;
        const shiftEnd = toM(shift.end);

        let diff = 0;
        let status = "On-Time";

        if (inM > graceLimit) {
            diff -= (inM - shiftStart);
            status = "Late";
        }

        diff += (outM - shiftEnd);

        if (diff > 0 && status !== "Late") status = "Overtime";
        if (diff < 0 && status === "On-Time") status = "Early-Exit";
        if (diff >= 0 && status === "Late") status = "Balanced";

        return { diff, status };
    }

    function updateLivePreview() {
        const leave = document.getElementById("isLeave").checked;
        const m = document.getElementById("morningPunch").value;
        const e = document.getElementById("eveningPunch").value;
        const stats = calculateShift(m, e, leave);

        const badge = document.getElementById("previewBadge");
        const diffEl = document.getElementById("previewDiff");

        badge.textContent = stats.status;
        badge.className = `badge ${stats.status.toLowerCase().replace(/\s+/g, "-")}`;
        diffEl.textContent = leave ? "--" : formatDailyMinutes(stats.diff);
        diffEl.className = leave || stats.diff === 0 ? "neutral" : (stats.diff < 0 ? "neg" : "pos");
    }

    function formatMins(m) {
        const num = parseInt(m || 0, 10);
        const h = Math.floor(Math.abs(num) / 60);
        const mi = Math.abs(num) % 60;
        const sign = num < 0 ? "-" : (num > 0 ? "+" : "");
        return `${sign}${h}h ${String(mi).padStart(2, "0")}m`;
    }

    function closeDeleteModal() {
        pendingDeleteDate = null;
        document.getElementById("confirmModal").style.display = "none";
    }

    function exitEditMode() {
        isEditing = false;
        document.getElementById("entryFormCard").classList.remove("editing-active");
        document.getElementById("cancelEditBtn").style.display = "none";
        document.getElementById("saveBtnText").textContent = "Sync to Cloud";
        document.getElementById("punchDate").value = getTodayLocalISO();
        document.getElementById("isLeave").checked = false;
        document.getElementById("isLeave").dispatchEvent(new Event("change"));

        const currentShift = getActiveShift();
        document.getElementById("morningPunch").value = currentShift.start;
        document.getElementById("eveningPunch").value = currentShift.end;
        updateLivePreview();
    }

    window.deleteRow = (date) => {
        pendingDeleteDate = date;
        const formatted = date ? date.split("-").reverse().join("/") : date;
        document.getElementById("confirmModalText").textContent =
            `Are you sure you want to delete the attendance record for ${formatted}?`;
        document.getElementById("confirmModal").style.display = "flex";
    };

    window.editRow = (date, m, e, leave) => {
        isEditing = true;
        const shift = getActiveShift();
        document.getElementById("punchDate").value = date;
        document.getElementById("morningPunch").value = (m && m !== "--") ? m : shift.start;
        document.getElementById("eveningPunch").value = (e && e !== "--") ? e : shift.end;
        document.getElementById("isLeave").checked = Boolean(leave);
        document.getElementById("isLeave").dispatchEvent(new Event("change"));

        document.getElementById("entryFormCard").classList.add("editing-active");
        document.getElementById("cancelEditBtn").style.display = "inline-flex";
        document.getElementById("saveBtnText").textContent = "Update Entry";

        updateLivePreview();
        document.getElementById("entryFormCard").scrollIntoView({ behavior: "smooth", block: "nearest" });
    };
});