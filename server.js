require("dotenv").config()

const express = require("express")
const mongoose = require("mongoose")
const QRCode = require("qrcode")
const cors = require("cors")

const app = express()
app.use(cors())
app.use(express.json())

/* =======================
   🔗 MONGODB CONNECTION
======================= */
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => {
    console.error("❌ MongoDB connection error:", err)
    process.exit(1)
  })

/* =======================
   🎟️ TICKET COUNTERS
======================= */
const counterSchema = new mongoose.Schema(
  {
    ticketA: { type: Number, default: 0 },
    ticketB: { type: Number, default: 0 },
    ticketC: { type: Number, default: 0 }
  },
  { collection: "ticketCounters" }
)

const Counter = mongoose.model("Counter", counterSchema)

/* Auto-init counters */
async function initCounter() {
  const exists = await Counter.findOne()
  if (!exists) {
    await Counter.create({ ticketA: 0, ticketB: 0, ticketC: 0 })
    console.log("✅ Counter initialized")
  }
}

mongoose.connection.once("open", initCounter)

/* =======================
   💸 PAYMENTS COLLECTION
======================= */
const paymentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },

  dept: {
    type: String,
    required: true
  },

  studentId: {
    type: String,
    required: true
  },

  phone: {
    type: String,
    required: true,
    match: [/^[6-9]\d{9}$/, "Invalid phone number"]
  },

  ticketType: {
    type: String,
    required: true
  },

  price: {
    type: Number,
    required: true
  },

  utr: {
    type: String
  },

  status: {
    type: String,
    enum: ["PENDING", "CONFIRMED"],
    default: "PENDING"
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
})

const Payment = mongoose.model("Payment", paymentSchema)

/* =======================
   🎫 BUY TICKET + QR
======================= */
app.post("/buy-ticket", async (req, res) => {
  try {
    const { ticketType, name, dept, studentId, phone } = req.body

    if (!ticketType || !name || !dept || !studentId || !phone) {
      return res.status(400).json({ error: "Missing user details" })
    }

    if (!/^[6-9]\d{9}$/.test(phone)) {
      return res.status(400).json({ error: "Invalid phone number" })
    }

    const counter = await Counter.findOne()
    if (!counter) {
      return res.status(500).json({ error: "Counter not initialized" })
    }

    let price
    let update

    /* 🎟️ Pricing logic */
    if (ticketType === "A") {
      if (counter.ticketA < 20) price = 500
      else if (counter.ticketA < 160) price = 600
      else return res.status(400).json({ error: "Ticket A Sold Out" })

      update = { $inc: { ticketA: 1 } }
    }

    if (ticketType === "B") {
      if (counter.ticketB >= 600)
        return res.status(400).json({ error: "Ticket B Sold Out" })

      price = 400
      update = { $inc: { ticketB: 1 } }
    }

    if (ticketType === "C") {
      if (counter.ticketC >= 210)
        return res.status(400).json({ error: "Ticket C Sold Out" })

      price = 300
      update = { $inc: { ticketC: 1 } }
    }

    if (!price || !update) {
      return res.status(400).json({ error: "Invalid ticket type" })
    }

    await Counter.updateOne({}, update)

    const payment = await Payment.create({
      name,
      dept,
      studentId,
      phone,
      ticketType,
      price
    })

    /* Generate UPI QR */
    const upi = "ruthirockstar2218@okhdfcbank"
    const upiLink =
      `upi://pay?pa=${upi}` +
      `&pn=TEDxSairam` +
      `&am=${price}` +
      `&cu=INR` +
      `&tn=TEDx Ticket`

    const qr = await QRCode.toDataURL(upiLink)

    res.json({
      price,
      qr,
      paymentId: payment._id
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "Server error" })
  }
})

/* =======================
   🧾 CONFIRM PAYMENT
======================= */
app.post("/confirm-payment", async (req, res) => {
  try {
    const { paymentId, utr } = req.body

    if (!paymentId || !utr) {
      return res.status(400).json({ error: "Missing payment details" })
    }

    await Payment.findByIdAndUpdate(paymentId, {
      utr,
      status: "PENDING"
    })

    res.json({ message: "Payment submitted for verification" })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "Server error" })
  }
})

/* =======================
   🚀 SERVER START
======================= */
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`)
})
