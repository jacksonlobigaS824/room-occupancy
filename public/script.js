// ==========================================
// SUPABASE FRONTEND CONFIGURATION
// ==========================================
const SUPABASE_URL = "https://onaisgndygjgydioaeej.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9uYWlzZ25keWdqZ3lkaW9hZWVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4NDMxNzAsImV4cCI6MjEwODQxOTE3MH0.roIKdNM2B0KKSWn4sexSE5fslHTJ0uwA0bw_kDZUUco";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let room = {
    id: 1,
    name: "Room 101",
    occupants: 0,
    capacity: 30,
    device: "ESP32-ROOM-101",
    lastUpdated: new Date()
};

let currentHistoryRoomId = 1; 
const occupancyHistory = [];
const MAX_GRAPH_POINTS = 12;

// ==========================================
// FETCH ROOM & HISTORY DATA
// ==========================================
async function fetchRoomData() {
    try {
        const { data, error } = await supabaseClient
            .from('room_occupancy')
            .select('*')
            .eq('room_id', room.id)
            .single();

        if (error) {
            console.error("Error fetching room:", error.message);
            return;
        }

        if (data) {
            room = {
                id: data.room_id,
                name: data.room_name,
                occupants: data.occupants,
                capacity: data.capacity,
                device: data.device,
                lastUpdated: new Date(data.last_updated)
            };

            addOccupancyReading(room.occupants);
            updateRoomDisplay();
        }

        await fetchHistoryLogs(currentHistoryRoomId);

    } catch (err) {
        console.error("Fetch exception:", err);
    }
}

async function fetchHistoryLogs(roomId) {
    const { data, error } = await supabaseClient
        .from('room_history')
        .select('*')
        .eq('room_id', roomId)
        .order('recorded_at', { ascending: false })
        .limit(25);

    if (error) {
        console.error("Error fetching history:", error.message);
        return;
    }

    const table = document.getElementById("history-table");
    if (!table) return;

    if (!data || data.length === 0) {
        table.innerHTML = `<tr><td colspan="5" style="text-align:center; color: #6b7280;">No history records for this room yet.</td></tr>`;
        return;
    }

    table.innerHTML = data.map(item => {
        const dateObj = new Date(item.recorded_at);
        const dateStr = dateObj.toLocaleDateString();
        const timeStr = dateObj.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
        const isFull = item.status === 'FULL';

        return `
            <tr>
                <td>${dateStr} ${timeStr}</td>
                <td>${item.room_name}</td>
                <td>${item.occupants}</td>
                <td>${item.capacity}</td>
                <td>
                    <span class="table-status" style="${isFull ? 'background: #fee2e2; color: #dc2626;' : 'background: #dcfce7; color: #16a34a;'} padding: 4px 10px; border-radius: 6px; font-weight: 600;">
                        ${item.status}
                    </span>
                </td>
            </tr>
        `;
    }).join("");
}

function switchHistoryRoom(roomId, buttonElement) {
    currentHistoryRoomId = roomId;
    document.querySelectorAll(".room-tab-btn").forEach(btn => {
        btn.style.background = "transparent";
        btn.style.color = "#3b82f6";
    });
    buttonElement.style.background = "#3b82f6";
    buttonElement.style.color = "white";
    fetchHistoryLogs(roomId);
}

function switchHistorySubTab(viewName, buttonElement) {
    document.querySelectorAll(".sub-tab-btn").forEach(btn => {
        btn.style.background = "transparent";
        btn.style.color = "#3b82f6";
        btn.classList.remove("active");
    });
    buttonElement.style.background = "#3b82f6";
    buttonElement.style.color = "white";
    buttonElement.classList.add("active");

    const summaryView = document.getElementById("room-summary-view");
    const detailedView = document.getElementById("detailed-history-view");

    if (viewName === 'summary') {
        summaryView.style.display = "block";
        detailedView.style.display = "none";
        updateRoomSummaryTable();
    } else {
        summaryView.style.display = "none";
        detailedView.style.display = "block";
        fetchHistoryLogs(currentHistoryRoomId);
    }
}

function updateRoomSummaryTable() {
    const summaryTable = document.getElementById("room-summary-table");
    if (!summaryTable) return;

    const isFull = room.occupants >= room.capacity;
    const statusText = isFull ? "FULL" : (room.occupants === 0 ? "READY" : "AVAILABLE");
    const statusColor = isFull ? "background: #fee2e2; color: #dc2626;" : "background: #dcfce7; color: #16a34a;";

    summaryTable.innerHTML = `
        <tr>
            <td><strong>${room.name}</strong></td>
            <td>${room.occupants}</td>
            <td>${room.capacity}</td>
            <td>
                <span class="table-status" style="${statusColor} padding: 4px 10px; border-radius: 6px; font-weight: 600;">
                    ${statusText}
                </span>
            </td>
        </tr>
    `;
}

function setupRealtimeListener() {
    supabaseClient
        .channel('room_occupancy_changes')
        .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'room_occupancy', filter: `room_id=eq.${room.id}` },
            (payload) => {
                const newData = payload.new;
                room.occupants = newData.occupants;
                room.capacity = newData.capacity;
                room.lastUpdated = new Date(newData.last_updated);

                addOccupancyReading(room.occupants);
                updateRoomDisplay();
                fetchHistoryLogs(currentHistoryRoomId); 
            }
        )
        .subscribe();
}

function createLiveGraph() {
    if (document.getElementById("live-occupancy-graph")) return;

    const overviewSection = document.querySelector(".overview-section");
    if (!overviewSection) return;

    const graphPanel = document.createElement("div");
    graphPanel.id = "live-graph-panel";
    graphPanel.innerHTML = `
        <div class="live-graph-header">
            <div>
                <h2>Live Occupancy Graph</h2>
                <p>Real-time occupancy tracking for ${room.name}.</p>
            </div>
            <div class="graph-live-badge"><span></span> LIVE</div>
        </div>
        <div class="live-graph-wrapper">
            <canvas id="live-occupancy-graph"></canvas>
        </div>
        <div class="graph-footer">
            <span>Current: <strong id="graph-current-value">0</strong> people</span>
            <span>Capacity: <strong>${room.capacity}</strong> people</span>
        </div>
    `;
    overviewSection.appendChild(graphPanel);

    const style = document.createElement("style");
    style.id = "live-graph-style";
    style.textContent = `
        #live-graph-panel { margin-top: 20px; padding: 22px; background: #ffffff; border-radius: 16px; border: 1px solid #e5e7eb; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06); }
        .live-graph-header { display: flex; align-items: center; justify-content: space-between; gap: 15px; margin-bottom: 18px; }
        .live-graph-header h2 { margin: 0 0 5px; font-size: 20px; }
        .live-graph-header p { margin: 0; color: #6b7280; font-size: 13px; }
        .graph-live-badge { display: flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 700; letter-spacing: 0.5px; }
        .graph-live-badge span { width: 9px; height: 9px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.12); }
        .live-graph-wrapper { position: relative; width: 100%; height: 280px; }
        #live-occupancy-graph { display: block; width: 100%; height: 100%; }
        .graph-footer { display: flex; justify-content: space-between; margin-top: 12px; padding-top: 12px; border-top: 1px solid #eeeeee; color: #6b7280; font-size: 13px; }
        .graph-footer strong { color: #111827; }
    `;
    document.head.appendChild(style);
    drawLiveGraph();
}

function addOccupancyReading(value) {
    occupancyHistory.push({
        time: new Date(),
        occupants: Number(value) || 0
    });
    while (occupancyHistory.length > MAX_GRAPH_POINTS) {
        occupancyHistory.shift();
    }
    drawLiveGraph();
}

function drawLiveGraph() {
    const canvas = document.getElementById("live-occupancy-graph");
    if (!canvas) return;
    const wrapper = canvas.parentElement;
    const width = wrapper.clientWidth;
    const height = wrapper.clientHeight;
    if (width <= 0 || height <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";

    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const padding = { top: 20, right: 25, bottom: 40, left: 45 };
    const graphWidth = width - padding.left - padding.right;
    const graphHeight = height - padding.top - padding.bottom;
    const maxValue = Math.max(room.capacity || 30, 10);

    ctx.lineWidth = 1;
    ctx.strokeStyle = "#e5e7eb";
    ctx.fillStyle = "#6b7280";
    ctx.font = "11px Arial";

    const gridSteps = 5;
    for (let i = 0; i <= gridSteps; i++) {
        const value = Math.round((maxValue / gridSteps) * i);
        const y = padding.top + graphHeight - (value / maxValue) * graphHeight;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();
        ctx.fillText(value, 8, y + 4);
    }

    if (occupancyHistory.length === 0) return;

    const points = occupancyHistory.map((reading, index) => {
        const x = occupancyHistory.length === 1
            ? padding.left + graphWidth / 2
            : padding.left + (index / (occupancyHistory.length - 1)) * graphWidth;
        const y = padding.top + graphHeight - (reading.occupants / maxValue) * graphHeight;
        return { x, y, value: reading.occupants, time: reading.time };
    });

    if (points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(points[0].x, padding.top + graphHeight);
        points.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.lineTo(points[points.length - 1].x, padding.top + graphHeight);
        ctx.closePath();
        ctx.fillStyle = "rgba(59, 130, 246, 0.10)";
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.strokeStyle = "#3b82f6";
        ctx.lineWidth = 3;
        ctx.stroke();
    }

    points.forEach(point => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.strokeStyle = "#3b82f6";
        ctx.lineWidth = 3;
        ctx.stroke();
    });

    const currentValue = occupancyHistory[occupancyHistory.length - 1].occupants;
    setText("graph-current-value", currentValue);
}

function createRoomCard(roomData) {
    const availableSeats = Math.max(0, roomData.capacity - roomData.occupants);
    const percentage = roomData.capacity > 0 ? Math.min(100, Math.round((roomData.occupants / roomData.capacity) * 100)) : 0;
    const isFull = roomData.occupants >= roomData.capacity;

    return `
        <div class="room-card">
            <div class="room-header">
                <div class="room-name">🏫 ${roomData.name}</div>
                <div class="room-status ${isFull ? 'status-occupied' : 'status-available'}" style="${isFull ? 'background: #fee2e2; color: #dc2626;' : ''}">
                    ${isFull ? 'FULL' : 'AVAILABLE'}
                </div>
            </div>
            <div class="occupancy">
                <div class="occupancy-number">${roomData.occupants}</div>
                <div class="occupancy-label">Current Occupants</div>
            </div>
            <div class="capacity-bar">
                <div class="capacity-fill fill-blue" style="width: ${percentage}%; ${isFull ? 'background: #dc2626;' : ''}"></div>
            </div>
            <div class="room-footer">
                <span>Available Seats</span>
                <strong>${availableSeats}</strong>
            </div>
            <div class="room-footer">
                <span>Capacity</span>
                <strong>${roomData.capacity} seats</strong>
            </div>
            <div class="room-footer">
                <span>Occupancy Rate</span>
                <strong>${percentage}%</strong>
            </div>
        </div>
    `;
}

function updateRoomDisplay() {
    const availableSeats = Math.max(0, room.capacity - room.occupants);
    const percentage = room.capacity > 0 ? Math.min(100, Math.round((room.occupants / room.capacity) * 100)) : 0;
    const roomHTML = createRoomCard(room);

    const dashboardGrid = document.getElementById("room-grid");
    const allRoomsGrid = document.getElementById("all-room-grid");

    if (dashboardGrid) dashboardGrid.innerHTML = roomHTML;
    if (allRoomsGrid) allRoomsGrid.innerHTML = roomHTML;

    setText("total-occupants", room.occupants);
    setText("occupancy-percentage", percentage + "%");

    const progress = document.getElementById("progress-fill");
    if (progress) progress.style.width = percentage + "%";

    setText("occupancy-seats-text", `${room.occupants} of ${room.capacity} seats occupied`);
    setText("device-name", room.device);

    setText("overview-occupants", room.occupants);
    setText("overview-available", availableSeats);
    setText("overview-capacity", room.capacity);
    setText("overview-percentage", percentage + "%");
    setText("graph-current-value", room.occupants);

    updateRoomSummaryTable();
    drawLiveGraph();
    updateTime();
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
}

function showPage(pageName, element) {
    document.querySelectorAll(".page").forEach(page => page.classList.remove("active-page"));
    const selectedPage = document.getElementById(pageName + "-page");
    if (selectedPage) selectedPage.classList.add("active-page");

    document.querySelectorAll(".nav-item").forEach(item => item.classList.remove("active"));
    if (element) element.classList.add("active");

    const titles = {
        dashboard: "Dashboard",
        rooms: "Classroom Rooms",
        history: "Occupancy History",
        settings: "System Settings"
    };
    setText("page-title", titles[pageName]);

    if (pageName === 'history') {
        updateRoomSummaryTable();
        fetchHistoryLogs(currentHistoryRoomId);
    }
}

function updateTime() {
    const time = room.lastUpdated.toLocaleTimeString();
    setText("last-update", time);
    setText("overview-last-update", time);
}

// ==========================================
// INITIALIZATION
// ==========================================
createLiveGraph();
fetchRoomData();
setupRealtimeListener();

window.addEventListener("resize", drawLiveGraph);


/* ==========================================
   DEVICE MONITORING + DASHBOARD CONTROLS
   Requires the SQL columns you already added.
========================================== */

const deviceState = {
    leds: [false, false, false, false, false, false],
    fan: false,
    mode: "AUTO",
    manualLeds: [false, false, false, false, false, false],
    manualFan: false,
    lastSeen: null
};

function createDeviceMonitor() {
    if (document.getElementById("device-monitor")) return;

    const section = document.querySelector(".overview-section");
    if (!section) {
        console.error("Device monitor: .overview-section not found.");
        return;
    }

    const panel = document.createElement("section");
    panel.id = "device-monitor";
    panel.style.cssText =
        "margin-top:20px;padding:22px;background:white;" +
        "border:1px solid #e5e7eb;border-radius:16px;";

    panel.innerHTML = `
      <h2 style="margin-top:0">Live Device Monitoring</h2>
      <p style="color:#6b7280">
        Room 101 · Maximum occupancy: 18 students
      </p>

      <div id="device-connection-status"
           style="margin-bottom:16px;color:#6b7280">
        Waiting for ESP32 status...
      </div>

      <div style="display:grid;grid-template-columns:
           repeat(auto-fit,minmax(130px,1fr));gap:12px">

        ${[1,2,3,4,5,6].map(n => `
          <div style="padding:14px;border:1px solid #e5e7eb;
               border-radius:12px">
            <strong>LED ${n}</strong>
            <div id="monitor-led-${n}"
                 style="margin:10px 0;font-weight:700">UNKNOWN</div>
            <button type="button" id="manual-led-${n}"
                    style="padding:7px 10px;cursor:pointer">
              Toggle LED ${n}
            </button>
          </div>
        `).join("")}

        <div style="padding:14px;border:1px solid #e5e7eb;
             border-radius:12px">
          <strong>Fan / Relay</strong>
          <div id="monitor-fan"
               style="margin:10px 0;font-weight:700">UNKNOWN</div>
          <button type="button" id="manual-fan"
                  style="padding:7px 10px;cursor:pointer">
            Toggle Fan
          </button>
        </div>
      </div>

      <div style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap">
        <button id="mode-auto" type="button"
                style="padding:10px 14px;cursor:pointer">
          AUTO Mode
        </button>
        <button id="mode-manual" type="button"
                style="padding:10px 14px;cursor:pointer">
          MANUAL Mode
        </button>
      </div>

      <p id="device-control-message"
         style="margin-bottom:0;color:#6b7280"></p>
    `;

    section.appendChild(panel);

    for (let i = 1; i <= 6; i++) {
        document.getElementById(`manual-led-${i}`)
            .addEventListener("click", () => toggleManualLed(i - 1));
    }

    document.getElementById("manual-fan")
        .addEventListener("click", toggleManualFan);

    document.getElementById("mode-auto")
        .addEventListener("click", () => setControlMode("AUTO"));

    document.getElementById("mode-manual")
        .addEventListener("click", () => setControlMode("MANUAL"));

    renderDeviceMonitor();
}

function renderDeviceMonitor() {
    for (let i = 0; i < 6; i++) {
        const led = document.getElementById(`monitor-led-${i + 1}`);
        if (!led) continue;

        led.textContent = deviceState.leds[i] ? "ON" : "OFF";
        led.style.color = deviceState.leds[i] ? "#16a34a" : "#6b7280";

        const button = document.getElementById(`manual-led-${i + 1}`);
        if (button) button.disabled = deviceState.mode !== "MANUAL";
    }

    const fan = document.getElementById("monitor-fan");
    if (fan) {
        fan.textContent = deviceState.fan ? "ON" : "OFF";
        fan.style.color = deviceState.fan ? "#16a34a" : "#6b7280";
    }

    const fanButton = document.getElementById("manual-fan");
    if (fanButton) fanButton.disabled = deviceState.mode !== "MANUAL";

    setText("device-connection-status",
        deviceState.lastSeen
            ? "Status last received: " + deviceState.lastSeen.toLocaleTimeString()
            : "Waiting for ESP32 status...");

    setText("device-control-message",
        "Control mode: " + deviceState.mode +
        ". Manual controls are enabled only in MANUAL mode.");

    const autoButton = document.getElementById("mode-auto");
    const manualButton = document.getElementById("mode-manual");

    if (autoButton) autoButton.style.fontWeight =
        deviceState.mode === "AUTO" ? "700" : "400";
    if (manualButton) manualButton.style.fontWeight =
        deviceState.mode === "MANUAL" ? "700" : "400";
}

async function updateDeviceCommand(fields) {
    const message = document.getElementById("device-control-message");
    if (message) message.textContent = "Sending command...";

    const { error } = await supabaseClient
        .from("room_occupancy")
        .update(fields)
        .eq("room_id", room.id);

    if (error) {
        console.error("Device command failed:", error.message);
        if (message) {
            message.textContent = "Command failed: " + error.message;
        }
        return false;
    }

    if (message) {
        message.textContent =
            "Command saved. Waiting for the ESP32 to apply it.";
    }
    return true;
}

async function setControlMode(mode) {
    if (mode !== "AUTO" && mode !== "MANUAL") return;

    const ok = await updateDeviceCommand({ control_mode: mode });
    if (ok) {
        deviceState.mode = mode;
        renderDeviceMonitor();
    }
}

async function toggleManualLed(index) {
    if (deviceState.mode !== "MANUAL") {
        alert("Switch to MANUAL mode first.");
        return;
    }

    const nextValue = !deviceState.manualLeds[index];
    const field = `manual_led_${index + 1}_on`;

    const ok = await updateDeviceCommand({
        control_mode: "MANUAL",
        [field]: nextValue
    });

    if (ok) deviceState.manualLeds[index] = nextValue;
}

async function toggleManualFan() {
    if (deviceState.mode !== "MANUAL") {
        alert("Switch to MANUAL mode first.");
        return;
    }

    const nextValue = !deviceState.manualFan;
    const ok = await updateDeviceCommand({
        control_mode: "MANUAL",
        fan_command_on: nextValue
    });

    if (ok) deviceState.manualFan = nextValue;
}

async function fetchDeviceMonitorState() {
    const { data, error } = await supabaseClient
        .from("room_occupancy")
        .select(`
            control_mode,
            manual_led_1_on, manual_led_2_on, manual_led_3_on,
            manual_led_4_on, manual_led_5_on, manual_led_6_on,
            fan_command_on,
            led_1_on, led_2_on, led_3_on,
            led_4_on, led_5_on, led_6_on,
            fan_on
        `)
        .eq("room_id", room.id)
        .maybeSingle();

    if (error) {
        console.error("Device monitoring read failed:", error.message);
        setText("device-connection-status",
            "Cannot read device status. Check Supabase permissions.");
        return;
    }

    if (!data) return;

    deviceState.mode = data.control_mode || "AUTO";
    deviceState.manualLeds = [
        !!data.manual_led_1_on, !!data.manual_led_2_on,
        !!data.manual_led_3_on, !!data.manual_led_4_on,
        !!data.manual_led_5_on, !!data.manual_led_6_on
    ];
    deviceState.manualFan = !!data.fan_command_on;

    // These are the states reported by the ESP32 firmware.
    deviceState.leds = [
        !!data.led_1_on, !!data.led_2_on, !!data.led_3_on,
        !!data.led_4_on, !!data.led_5_on, !!data.led_6_on
    ];
    deviceState.fan = !!data.fan_on;
    deviceState.lastSeen = new Date();

    renderDeviceMonitor();
}

createDeviceMonitor();
fetchDeviceMonitorState();
setInterval(fetchDeviceMonitorState, 3000);
