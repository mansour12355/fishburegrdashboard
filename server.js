const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});
const PORT = 3000;

app.use(cors());
app.use(express.json());

// --- 1. MONGODB CONNECTION ---
// REPLACE THIS STRING WITH YOUR OWN MONGO URL
const MONGO_URI = 'mongodb://127.0.0.1:27017/resto_dashboard';

console.log('⏳ Attempting to connect to MongoDB at:', MONGO_URI);

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch(err => {
        console.error('❌ MongoDB Connection Error:', err.message);
        console.log('   (Hint: Is MongoDB installed and running on your computer?)');
    });

// Additional Event Listeners for Debugging
mongoose.connection.on('disconnected', () => {
    console.log('⚠️ MongoDB Disconnected');
});
mongoose.connection.on('error', (err) => {
    console.error('❌ Runtime MongoDB Error:', err);
});

// --- 2. SCHEMAS & MODELS ---
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true },
    password: { type: String, required: true },
    role: { type: String, default: 'worker' }
});

const ShiftSchema = new mongoose.Schema({
    id: Number, // Keeping 'id' to match your frontend logic
    name: String,
    role: String,
    time: String,
    status: { type: String, default: 'Scheduled' }
});

const DeliverySchema = new mongoose.Schema({
    id: Number,
    label: String,
    items: String,
    address: String,
    status: String
});

const TrainingSchema = new mongoose.Schema({
    id: Number,
    topic: String,
    trainer: String,
    time: String,
    attendees: Number
});

const AppointmentSchema = new mongoose.Schema({
    id: Number,
    with: String,
    purpose: String,
    time: String,
    location: String
});

const User = mongoose.model('User', UserSchema);
const Shift = mongoose.model('Shift', ShiftSchema);
const Delivery = mongoose.model('Delivery', DeliverySchema);
const Training = mongoose.model('Training', TrainingSchema);
const Appointment = mongoose.model('Appointment', AppointmentSchema);

// --- 3. HELPER: FETCH ALL DATA ---
async function getAllData() {
    return {
        shifts: await Shift.find(),
        deliveries: await Delivery.find(),
        training: await Training.find(),
        appointments: await Appointment.find()
    };
}

// --- 4. SEED DATA (Only runs if DB is empty) ---
async function seedDatabase() {
    try {
        // Wait for connection to be ready before querying
        if (mongoose.connection.readyState !== 1) {
            // 0: disconnected, 1: connected, 2: connecting, 3: disconnecting
            if (mongoose.connection.readyState === 0) return;
            // If connecting, we wait; usually the .then() block handles this, 
            // but safe coding prevents race conditions in seeds.
        }

        const adminExists = await User.findOne({ username: 'admin' });
        if (!adminExists) {
            console.log("🌱 Seeding Database with Admin...");
            await new User({ username: 'admin', password: '123', role: 'admin' }).save();
            await new Shift({ id: 1, name: "Sarah Connor", role: "Head Chef", time: "10:00 - 18:00", status: "On Duty" }).save();
            await new Delivery({ id: 992, label: "#ORD-992", items: "2x Burgers", address: "12 Main St", status: "Cooking" }).save();
        }
    } catch (error) {
        console.error("Seed Error (Database might not be ready):", error.message);
    }
}
// Run seed after a short delay to ensure connection
setTimeout(seedDatabase, 2000);

// --- 5. ROUTES ---

// Login Route
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username, password });
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

    // Send DB data to client immediately on connection
    // We wrap this in a try/catch in case DB isn't ready
    try {
        socket.emit('init', await getAllData());
    } catch (e) {
        console.log("Database not ready yet for new connection");
    }

    // ADMIN: Add Worker
    socket.on('addWorker', async (data) => {
        try {
            // Create User Login
            await new User({ username: data.name, password: '123', role: 'worker' }).save();

            // Create Shift Entry
            await new Shift({
                id: Date.now(),
                name: data.name,
                role: data.role,
                time: data.time,
                status: 'Scheduled'
            }).save();

            // Broadcast updates
            io.emit('init', await getAllData());
        } catch (e) {
            console.error("Error adding worker:", e);
        }
    });

    // ADMIN: General Update (Edit Pencils)
    socket.on('updateEntry', async ({ category, id, field, value }) => {
        try {
            // Map category string to Mongoose Model
            const Models = {
                'shifts': Shift,
                'deliveries': Delivery,
                'training': Training,
                'appointments': Appointment
            };

            if (Models[category]) {
                await Models[category].findOneAndUpdate({ id: parseInt(id) }, { [field]: value });
                io.emit('init', await getAllData());
            }
        } catch (e) {
            console.error("Update error:", e);
        }
    });

    // WORKER: Toggle Status
    socket.on('workerToggleStatus', async ({ name }) => {
        try {
            const shift = await Shift.findOne({ name: name });
            if (shift) {
                shift.status = shift.status === 'On Duty' ? 'Off Duty' : 'On Duty';
                await shift.save();
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