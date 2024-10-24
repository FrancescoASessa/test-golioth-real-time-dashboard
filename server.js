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
let deviceData = {};

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

app.get('/device-data', (req, res) => {
  res.json(deviceData);
});

app.post('/telemetry', (req, res) => {
  console.log(req.body);

  const eventData = req.body.data.HUBWATER_EVENT;
  const flowMeterCount = parseFloat(eventData.STAT.FLOW_METER_COUNT);
  const liters = flowMeterCount / 695;
  const timestamp = new Date(); 
  const devId = eventData.DEV_ID;
  const coldWaterTemp = eventData.STAT.COLD_WATER_TEMP;
  const waterType = parseInt(eventData.EROG.WATER_TYPE);

  // Aggiorna i contatori sul server
  totalFlowMeterCount += liters;
  if (waterTypeCounts.hasOwnProperty(waterType)) {
    waterTypeCounts[waterType] += liters;
  }

  flowData.push({ timestamp: timestamp, totalFlowMeterCount });

  if (!deviceData[devId]) {
    deviceData[devId] = { totalFlow: 0, lastColdWaterTemp: 0 };
  }
  deviceData[devId].totalFlow += liters;
  deviceData[devId].lastColdWaterTemp = coldWaterTemp;


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
