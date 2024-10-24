const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

app.use(express.json());


let totalFlowMeterCount = 0;
let waterTypeCounts = { 0: 0, 1: 0, 2: 0 };
let flowData = [];

// Route per ottenere i valori correnti
app.get('/current-state', (req, res) => {
  res.json({
    totalFlowMeterCount: totalFlowMeterCount,
    waterTypeCounts: waterTypeCounts
  });
});

app.get('/flow-data', (req, res) => {
  res.json(flowData);
});

app.post('/telemetry', (req, res) => {
  console.log(req.body);

  const eventData = req.body.HUBWATER_EVENT;
  const flowMeterCount = parseFloat(eventData.STAT.FLOW_METER_COUNT);
  const liters = flowMeterCount / 695;
  const timestamp = new Date(); 
  const waterType = parseInt(eventData.EROG.WATER_TYPE);

  // Aggiorna i contatori sul server
  totalFlowMeterCount += liters;
  if (waterTypeCounts.hasOwnProperty(waterType)) {
    waterTypeCounts[waterType] += liters;
  }

  flowData.push({ timestamp: timestamp, totalFlowMeterCount });

  // Emitti i dati aggiornati ai client
  io.emit('telemetry update', req.body);

  res.status(200).send('Telemetry received');
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

io.on('connection', (socket) => {
  console.log('a user connected');
  socket.on('disconnect', () => {
    console.log('user disconnected');
  });
});

server.listen(3000, () => {
  console.log('listening on *:3000');
});
