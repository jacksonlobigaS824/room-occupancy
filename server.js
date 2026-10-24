const { SerialPort } = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");

const express = require("express");
const path = require("path");

const app = express();

const PORT = 3000;

// ==========================================
// ESP32 USB SERIAL CONNECTION
// ==========================================

// Change this to your ESP32 COM port later.
// Example: COM3, COM4, COM5
const ESP32_COM_PORT = process.env.ESP32_COM_PORT;

const ESP32_BAUD_RATE = 115200;

let esp32Serial = null;

function connectESP32Serial() {
    if (!ESP32_COM_PORT) {
        console.log(
            "[ESP32] COM port not configured yet."
        );
        return;
    }

    esp32Serial = new SerialPort({
        path: ESP32_COM_PORT,
        baudRate: ESP32_BAUD_RATE,
        autoOpen: false
    });

    const parser = esp32Serial.pipe(
        new ReadlineParser({
            delimiter: "\n"
        })
    );

    esp32Serial.open((error) => {
        if (error) {
            console.error(
                "[ESP32] Could not open serial port:",
                error.message
            );
            return;
        }

        console.log(
            `[ESP32] Connected to ${ESP32_COM_PORT}`
        );
    });

    parser.on("data", (line) => {
        try {
            const data = JSON.parse(line.trim());

            if (
                data.roomId !== 1 ||
                !Number.isInteger(data.occupants) ||
                data.occupants < 0 ||
                data.occupants > room.capacity
            ) {
                console.log(
                    "[ESP32] Invalid data:",
                    line
                );
                return;
            }

            room.occupants = data.occupants;
            room.lastUpdated = new Date();

            console.log(
                `[ESP32] Room 101: ${room.occupants}/${room.capacity}`
            );
        } catch (error) {
            console.log(
                "[ESP32] Ignored invalid serial line:",
                line
            );
        }
    });

    esp32Serial.on("error", (error) => {
        console.error(
            "[ESP32] Serial error:",
            error.message
        );
    });

    esp32Serial.on("close", () => {
        console.log("[ESP32] Serial port closed.");
    });
}

// ==========================================
// MIDDLEWARE
// ==========================================

// Allow server to receive JSON data

app.use(express.json());


// Serve frontend files

app.use(
    express.static(
        path.join(
            __dirname,
            "public"
        )
    )
);


// ==========================================
// TEST ROUTE
// ==========================================

app.get(
    "/api/test",
    (req, res) => {

        res.json({

            success: true,

            message:
                "Smart Classroom API is working!"

        });

    }
);


// ==========================================
// ROOM DATA
// ONLY ONE ROOM
// ==========================================

let room = {

    id: 1,

    name: "Room 101",

    occupants: 0,

    capacity: 30,

    device: "ESP32-ROOM-101",

    lastUpdated: new Date()

};


// ==========================================
// GET ROOM DATA
// ==========================================

app.get(
    "/api/room",
    (req, res) => {

        const availableSeats =
            room.capacity -
            room.occupants;


        const occupancyPercentage =
            room.capacity > 0
                ? Math.round(
                    (
                        room.occupants /
                        room.capacity
                    ) * 100
                )
                : 0;


        res.json({

            id: room.id,

            name: room.name,

            occupants:
                room.occupants,

            capacity:
                room.capacity,

            availableSeats:
                availableSeats,

            occupancyPercentage:
                occupancyPercentage,

            device:
                room.device,

            lastUpdated:
                room.lastUpdated

        });

    }
);


// ==========================================
// GET ROOM DATA BY ID
// ==========================================

app.get(
    "/api/rooms/:id",
    (req, res) => {


        const roomId =
            parseInt(
                req.params.id
            );


        if (roomId !== room.id) {

            return res.status(404).json({

                success: false,

                message:
                    "Room not found"

            });

        }


        const availableSeats =
            room.capacity -
            room.occupants;


        const occupancyPercentage =
            room.capacity > 0
                ? Math.round(
                    (
                        room.occupants /
                        room.capacity
                    ) * 100
                )
                : 0;


        res.json({

            id: room.id,

            name: room.name,

            occupants:
                room.occupants,

            capacity:
                room.capacity,

            availableSeats:
                availableSeats,

            occupancyPercentage:
                occupancyPercentage,

            device:
                room.device,

            lastUpdated:
                room.lastUpdated

        });

    }
);


// ==========================================
// ESP32 SENDS OCCUPANCY DATA
// ==========================================

app.post(
    "/api/occupancy",
    (req, res) => {


        const {
            roomId,
            occupants
        } = req.body;


        // ======================================
        // VALIDATE REQUIRED DATA
        // ======================================

        if (
            roomId === undefined ||
            occupants === undefined
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "roomId and occupants are required"

            });

        }


        // ======================================
        // CHECK ROOM
        // ======================================

        if (
            parseInt(roomId) !== room.id
        ) {

            return res.status(404).json({

                success: false,

                message:
                    "Room not found"

            });

        }


        // Convert occupant value to number

        const occupantCount =
            parseInt(
                occupants
            );


        // ======================================
        // VALIDATE OCCUPANT COUNT
        // ======================================

        if (
            isNaN(occupantCount) ||
            occupantCount < 0 ||
            occupantCount > room.capacity
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Invalid occupant count"

            });

        }


        // ======================================
        // UPDATE ROOM
        // ======================================

        room.occupants =
            occupantCount;


        room.lastUpdated =
            new Date();


        // Calculate available seats

        const availableSeats =
            room.capacity -
            room.occupants;


        // Calculate percentage

        const occupancyPercentage =
            Math.round(
                (
                    room.occupants /
                    room.capacity
                ) * 100
            );


        // ======================================
        // SERVER LOG
        // ======================================

        console.log(
            `[ESP32] ${room.name}: ${room.occupants} occupied | ${availableSeats} available`
        );


        // ======================================
        // RESPONSE
        // ======================================

        res.json({

            success: true,

            message:
                "Occupancy data updated successfully",

            room: {

                id:
                    room.id,

                name:
                    room.name,

                occupants:
                    room.occupants,

                availableSeats:
                    availableSeats,

                capacity:
                    room.capacity,

                occupancyPercentage:
                    occupancyPercentage,

                device:
                    room.device,

                lastUpdated:
                    room.lastUpdated

            }

        });

    }
);


// ==========================================
// START SERVER
// ==========================================

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `Smart Classroom Server running on port ${PORT}`
        );

        console.log(
            `Dashboard: http://localhost:${PORT}`
        );

       // connectESP32Serial();

    }
);