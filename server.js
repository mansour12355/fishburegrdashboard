const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { Sequelize, DataTypes } = require('sequelize');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});
const PORT = 3000;

app.use(cors());
app.use(express.json());

// --- 1. SQLITE CONNECTION ---
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: './database.sqlite',
    logging: false // Set to console.log to see SQL queries
});

console.log('⏳ Attempting to connect to SQLite...');

// --- 2. MODELS ---
const User = sequelize.define('User', {
    username: { type: DataTypes.STRING, allowNull: false, unique: true },
    password: { type: DataTypes.STRING, allowNull: false },
    role: { type: DataTypes.STRING, defaultValue: 'worker' }
});

const Shift = sequelize.define('Shift', {
    // Sequelize adds 'id' (Integer, Primary Key, Auto-increment) by default
    name: DataTypes.STRING,
    role: DataTypes.STRING,
    time: DataTypes.STRING,
    status: { type: DataTypes.STRING, defaultValue: 'Scheduled' }
});

const Delivery = sequelize.define('Delivery', {
    label: DataTypes.STRING,
    items: DataTypes.STRING,
    address: DataTypes.STRING,
    status: DataTypes.STRING
});

const Training = sequelize.define('Training', {
    topic: DataTypes.STRING,
    trainer: DataTypes.STRING,
    time: DataTypes.STRING,
    attendees: DataTypes.INTEGER
});

const Appointment = sequelize.define('Appointment', {
    with: DataTypes.STRING,
    purpose: DataTypes.STRING,
    time: DataTypes.STRING,
    location: DataTypes.STRING
});

// --- 3. HELPER: FETCH ALL DATA ---
async function getAllData() {
    return {
        shifts: await Shift.findAll(),
        deliveries: await Delivery.findAll(),
        training: await Training.findAll(),
        appointments: await Appointment.findAll()
    };
}

// --- 4. SEED DATA ---
async function seedDatabase() {
    try {
        await sequelize.sync(); // Create tables if they don't exist
        console.log('✅ Connected to SQLite & Synced Models');

        const adminExists = await User.findOne({ where: { username: 'admin' } });
        if (!adminExists) {
            console.log("🌱 Seeding Database with Admin...");
            await User.create({ username: 'admin', password: '123', role: 'admin' });

            // Seed initial data
            await Shift.create({ name: "Sarah Connor", role: "Head Chef", time: "10:00 - 18:00", status: "On Duty" });

            // For Delivery, we want to match the specific ID if possible, or just let it auto-increment.
            // Sequelize allows forcing ID if we pass it.
            await Delivery.create({ id: 992, label: "#ORD-992", items: "2x Burgers", address: "12 Main St", status: "Cooking" });
        }
    } catch (error) {
        console.error("Seed Error:", error.message);
    }
}

// Initialize DB
seedDatabase();

// --- 5. ROUTES ---

// Login Route
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ where: { username, password } });
        if (user) {
            res.json({ success: true, role: user.role, name: user.username });
        } else {
            res.status(401).json({ success: false, message: "Invalid credentials" });
        }
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// --- 6. SOCKET LOGIC ---
io.on('connection', async (socket) => {
    console.log('User connected:', socket.id);

    try {
        socket.emit('init', await getAllData());
    } catch (e) {
        console.log("Error sending init data:", e);
    }

    // ADMIN: Add Worker
    socket.on('addWorker', async (data) => {
        try {
            await User.create({ username: data.name, password: '123', role: 'worker' });

            await Shift.create({
                name: data.name,
                role: data.role,
                time: data.time,
                status: 'Scheduled'
            });

            io.emit('init', await getAllData());
        } catch (e) {
            console.error("Error adding worker:", e);
        }
    });

    // ADMIN: General Update
    socket.on('updateEntry', async ({ category, id, field, value }) => {
        try {
            const Models = {
                'shifts': Shift,
                'deliveries': Delivery,
                'training': Training,
                'appointments': Appointment
            };

            if (Models[category]) {
                await Models[category].update(
                    { [field]: value },
                    { where: { id: parseInt(id) } }
                );
                io.emit('init', await getAllData());
            }
        } catch (e) {
            console.error("Update error:", e);
        }
    });

    // WORKER: Toggle Status
    socket.on('workerToggleStatus', async ({ name }) => {
        try {
            const shift = await Shift.findOne({ where: { name: name } });
            if (shift) {
                const newStatus = shift.status === 'On Duty' ? 'Off Duty' : 'On Duty';
                await shift.update({ status: newStatus });
                io.emit('init', await getAllData());
            }
        } catch (e) {
            console.error("Toggle error:", e);
        }
    });
});

httpServer.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});