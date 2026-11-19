const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbxREId4_macnQe4KOCi5i_zD9L5cmzu2EjwdXRilBZri26_Y3H59S00_a_Pm80NS6QhOA/exec";

const SHIFTS = {
    "09:15-19:00": {
        id: "09:15-19:00",
        start: "09:15",
        end: "19:00",
        graceMins: 15,
        label: "Shift: 09:15 AM – 07:00 PM (15m Grace)"
    },
    "09:30-18:30": {
        id: "09:30-18:30",
        start: "09:30",
        end: "18:30",
        graceMins: 0, // Hardcore: no grace period
        label: "Shift: 09:30 AM – 06:30 PM (No Grace)"
    }
};

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
    }, 3000);
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
    if (localStorage.getItem("shiftEnd") === "18:30") return SHIFTS["09:30-18:30"];
    return SHIFTS["09:15-19:00"];
}

function formatDailyMinutes(m) {
    const num = parseInt(m || 0, 10);
    if (num > 0) return `+${num} min`;
    if (num < 0) return `${num} min`;
    return "0 min";
}

function formatHoursMins(m) {
    const num = parseInt(m || 0, 10);
    const h = Math.floor(Math.abs(num) / 60);
    const mi = Math.abs(num) % 60;
    const sign = num < 0 ? "-" : (num > 0 ? "+" : "");
    return `${sign}${h}h ${String(mi).padStart(2, "0")}m`;
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

    // Show/hide password
    document.querySelectorAll(".eye-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const input = document.getElementById(btn.dataset.target);
            if (!input) return;
            const hidden = input.type === "password";
            input.type = hidden ? "text" : "password";
            btn.innerHTML = `<i class="fas ${hidden ? "fa-eye-slash" : "fa-eye"}"></i>`;
        });
    });

    // Shift selector
    document.querySelectorAll(".seg-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            applyShift(btn.dataset.shift, !isEditing);
            updateLivePreview();
        });
    });

    // Live preview updates
    ["morningPunch", "eveningPunch", "isLeave"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener("input", updateLivePreview);
    });

    // Leave switch collapses time inputs for simplicity
    document.getElementById("isLeave").addEventListener("change", (e) => {
        document.getElementById("timeInputGroup").classList.toggle("collapsed", e.target.checked);
        updateLivePreview();
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
            errEl.textContent = "Please enter username and password.";
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
                localStorage.setItem("activeShift", json.shiftEnd === "18:30" ? "09:30-18:30" : "09:15-19:00");

                showToast(`Welcome, ${json.name || u}!`, "success");
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
                msgEl.textContent = json.msg || "Update failed.";
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
            showToast("Please choose a date.", "error");
            return;
        }

        const leave = document.getElementById("isLeave").checked;
        const morning = document.getElementById("morningPunch").value;
        const evening = document.getElementById("eveningPunch").value;

        if (!leave && (!morning || !evening)) {
            showToast("Please enter In and Out times.", "error");
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
            showToast("Entry saved!", "success");
        } catch (err) {
            showToast("Failed to save. Check connection.", "error");
        } finally {
            toggleLoader(false);
        }
    });

    // --- NAVIGATION & MODAL ---
    document.getElementById("gotoReset").addEventListener("click", () => {
        document.getElementById("errorMsg").textContent = "";
        document.getElementById("loginCard").style.display = "none";
        document.getElementById("resetCard").style.display = "block";
    });

    document.getElementById("backToLogin").addEventListener("click", () => {
        document.getElementById("resetMsg").textContent = "";
        document.getElementById("resetCard").style.display = "none";
        document.getElementById("loginCard").style.display = "block";
    });

    document.getElementById("cancelEditBtn").addEventListener("click", () => {
        exitEditMode();
    });

    monthFilter.addEventListener("change", loadData);

    document.getElementById("logoutBtn").addEventListener("click", () => {
        localStorage.clear();
        location.reload();
    });

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
            showToast("Entry deleted.", "success");
        } catch (err) {
            showToast("Could not delete entry.", "error");
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

        document.querySelectorAll(".seg-btn").forEach((b) => {
            b.classList.toggle("active", b.dataset.shift === shift.id);
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

        applyShift(getActiveShift().id, true);
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
            renderTable(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error(err);
            showToast("Failed to load records.", "error");
        } finally {
            toggleLoader(false);
        }
    }

    function renderTable(data) {
        const tbody = document.querySelector("#timeTable tbody");
        const totalEl = document.getElementById("totalTime");
        tbody.innerHTML = "";

        let total = 0;

        if (!data || data.length === 0) {
            tbody.innerHTML = `
                <tr class="empty-row">
                    <td colspan="6" class="empty-cell">No records for ${monthFilter.value} yet.</td>
                </tr>`;
            totalEl.textContent = "0h 00m";
            totalEl.className = "neutral";
            return;
        }

        const sorted = [...data].sort((a, b) => new Date(b.date) - new Date(a.date));

        sorted.forEach((row, index) => {
            const diffNum = parseInt(row.diff || 0, 10);
            total += diffNum;

            const tr = tbody.insertRow();
            tr.className = "row-anim";
            tr.style.animationDelay = `${Math.min(index * 0.03, 0.25)}s`;

            const d = row.date ? row.date.split("-").reverse().join("/") : "--";
            const isLeave = Boolean(row.isLeave);
            const mVal = isLeave ? "--" : (row.morning || "--");
            const eVal = isLeave ? "--" : (row.evening || "--");
            const statusText = row.status || (isLeave ? "Leave" : "On-Time");
            const badgeClass = statusText.toLowerCase().replace(/\s+/g, "-");

            const dailyText = isLeave ? "--" : formatDailyMinutes(diffNum);
            const dailyClass = isLeave || diffNum === 0 ? "neutral" : (diffNum < 0 ? "neg" : "pos");

            tr.innerHTML = `
                <td data-label="Date" style="font-weight:600;">${d}</td>
                <td data-label="In">${mVal}</td>
                <td data-label="Out">${eVal}</td>
                <td data-label="Status"><span class="badge ${badgeClass}">${statusText}</span></td>
                <td data-label="Daily +/-"><span class="daily-val ${dailyClass}">${dailyText}</span></td>
                <td data-label="Actions" class="col-actions">
                    <div class="actions-cell">
                        <button type="button" class="icon-btn edit" title="Edit"
                            onclick="editRow('${row.date}','${row.morning || ""}','${row.evening || ""}',${isLeave})">
                            <i class="fas fa-pen"></i>
                        </button>
                        <button type="button" class="icon-btn delete" title="Delete"
                            onclick="deleteRow('${row.date}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            `;
        });

        totalEl.textContent = formatHoursMins(total);
        totalEl.className = total < 0 ? "neg" : (total > 0 ? "pos" : "neutral");
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
        diffEl.textContent = leave ? "Leave Day" : formatDailyMinutes(stats.diff);
        diffEl.className = `preview-mins ${leave || stats.diff === 0 ? "neutral" : (stats.diff < 0 ? "neg" : "pos")}`;
    }

    function closeDeleteModal() {
        pendingDeleteDate = null;
        document.getElementById("confirmModal").style.display = "none";
    }

    function exitEditMode() {
        isEditing = false;
        document.getElementById("entryFormCard").classList.remove("editing");
        document.getElementById("cancelEditBtn").style.display = "none";
        document.getElementById("saveBtnText").textContent = "Save Entry";
        document.getElementById("punchDate").value = getTodayLocalISO();
        document.getElementById("isLeave").checked = false;
        document.getElementById("isLeave").dispatchEvent(new Event("change"));

        const shift = getActiveShift();
        document.getElementById("morningPunch").value = shift.start;
        document.getElementById("eveningPunch").value = shift.end;
        updateLivePreview();
    }

    window.deleteRow = (date) => {
        pendingDeleteDate = date;
        const formatted = date ? date.split("-").reverse().join("/") : date;
        document.getElementById("confirmModalText").textContent =
            `Delete the attendance entry for ${formatted}?`;
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

        document.getElementById("entryFormCard").classList.add("editing");
        document.getElementById("cancelEditBtn").style.display = "inline-block";
        document.getElementById("saveBtnText").textContent = "Update Entry";

        updateLivePreview();
        document.getElementById("entryFormCard").scrollIntoView({ behavior: "smooth", block: "nearest" });
    };
});