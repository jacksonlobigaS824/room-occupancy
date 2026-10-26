const { SerialPort } = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");
const { createClient } = require("@supabase/supabase-js");

const express = require("express");
const path = require("path");

const app = express();
const PORT = 3000;

// ==========================================
// SUPABASE CONFIGURATION
// ==========================================
const SUPABASE_URL = "https://onaisgndygjgydioaeej.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9uYWlzZ25keWdqZ3lkaW9hZWVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4NDMxNzAsImV4cCI6MjEwODQxOTE3MH0.roIKdNM2B0KKSWn4sexSE5fslHTJ0uwA0bw_kDZUUco";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ==========================================
// ESP32 USB SERIAL CONNECTION
// ==========================================
const ESP32_COM_PORT = process.env.ESP32_COM_PORT; // e.g., "COM3"
const ESP32_BAUD_RATE = 115200;

let esp32Serial = null;

function connectESP32Serial() {
    if (!ESP32_COM_PORT) {
        console.log("[ESP32] COM port not configured yet. Set process.env.ESP32_COM_PORT if using USB serial.");
        return;
    }

    esp32Serial = new SerialPort({
        path: ESP32_COM_PORT,
        baudRate: ESP32_BAUD_RATE,
        autoOpen: false
    });

    const parser = esp32Serial.pipe(
        new ReadlineParser({ delimiter: "\n" })
    );

    esp32Serial.open((error) => {
        if (error) {
            console.error("[ESP32] Could not open serial port:", error.message);
            return;
        }
        console.log(`[ESP32] Connected to ${ESP32_COM_PORT}`);
    });

    parser.on("data", async (line) => {
        try {
            const data = JSON.parse(line.trim());
            if (data.roomId !== 1 || !Number.isInteger(data.occupants) || data.occupants < 0) {
                return;
            }

            // Update Supabase directly from serial data
            await updateRoomInSupabase(data.occupants);

        } catch (error) {
            // Ignored non-JSON console logs from ESP32
        }
    });
}

// Helper to update Supabase database
async function updateRoomInSupabase(occupants) {
    const { data, error } = await supabase
        .from('room_occupancy')
        .update({ 
            occupants: occupants, 
            last_updated: new Date() 
        })
        .eq('room_id', 1)
        .select();

    if (error) {
        console.error("[Supabase] Error updating occupancy:", error.message);
    } else {
        console.log(`[Supabase] Room 101 updated: ${occupants} occupants`);
    }
}

// ==========================================
// MIDDLEWARE
// ==========================================
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ==========================================
// API ROUTES
// ==========================================

app.get("/api/test", (req, res) => {
    res.json({ success: true, message: "Smart Classroom Supabase API is working!" });
});

// GET Room Data from Supabase
app.get("/api/room", async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('room_occupancy')
            .select('*')
            .eq('room_id', 1)
            .single();

        if (error || !data) {
            return res.status(404).json({ success: false, message: "Room not found" });
        }

        const availableSeats = data.capacity - data.occupants;
        const occupancyPercentage = data.capacity > 0 ? Math.round((data.occupants / data.capacity) * 100) : 0;

        res.json({
            id: data.room_id,
            name: data.room_name,
            occupants: data.occupants,
            capacity: data.capacity,
            availableSeats: availableSeats,
            occupancyPercentage: occupancyPercentage,
            device: data.device,
            lastUpdated: data.last_updated
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST Occupancy Data (Called by ESP32 via Wi-Fi or local bridge)
app.post("/api/occupancy", async (req, res) => {
    const { roomId, occupants } = req.body;

    if (roomId === undefined || occupants === undefined) {
        return res.status(400).json({ success: false, message: "roomId and occupants are required" });
    }

    const occupantCount = parseInt(occupants);
    if (isNaN(occupantCount) || occupantCount < 0) {
        return res.status(400).json({ success: false, message: "Invalid occupant count" });
    }

    await updateRoomInSupabase(occupantCount);

    res.json({
        success: true,
        message: "Occupancy data updated successfully in Supabase"
    });
});

// ==========================================
// START SERVER
// ==========================================
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Smart Classroom Server running on port ${PORT}`);
    console.log(`Dashboard: http://localhost:${PORT}`);
    
    // Uncomment if connecting via USB Serial
    // connectESP32Serial();
});