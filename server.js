const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const compression = require('compression');
const redis = require('redis');

app.use(express.json());
app.use(compression());

const redisClient = redis.createClient();
redisClient.on('error', (err) => {
  console.error('Error connecting to Redis:', err);
});
redisClient.connect();

const incrementRedisCounter = async (key, incrementBy) => {
  await redisClient.incrByFloat(key, incrementBy);
};

const getRedisData = async (key) => {
  const data = await redisClient.get(key);
  return data ? JSON.parse(data) : null;
};

const updateFlowData = async (newEntry) => {
  const flowData = JSON.parse(await redisClient.get('flowData')) || [];
  flowData.push(newEntry);
  await redisClient.set('flowData', JSON.stringify(flowData));
};

let totalFlowMeterCount = 0;
let waterTypeCounts = { 0: 0, 1: 0, 2: 0 };
let flowData = [];
let deviceData = {};

// Route per ottenere i valori correnti
app.get('/current-state', async (req, res) => {
  const totalFlowMeterCount = await redisClient.get('totalFlowMeterCount') || 0;
  const waterTypeCounts = JSON.parse(await redisClient.get('waterTypeCounts')) || { 0: 0, 1: 0, 2: 0 };

  res.json({
    totalFlowMeterCount: parseFloat(totalFlowMeterCount),
    waterTypeCounts: waterTypeCounts
  });
});

app.get('/flow-data', async (req, res) => {
  const flowData = JSON.parse(await redisClient.get('flowData')) || [];
  res.json(flowData);
});

app.get('/device-data', async (req, res) => {
  const deviceData = JSON.parse(await redisClient.get('deviceData')) || {};
  res.json(deviceData);
});

app.post('/telemetry', async (req, res) => {
  const { data } = req.body;

  if (!data || !data.HUBWATER_EVENT || !data.HUBWATER_EVENT.STAT) {
    return res.status(400).send('Invalid telemetry data');
  }

  try {
    const eventData = data.HUBWATER_EVENT;
    const flowMeterCount = parseFloat(eventData.STAT.FLOW_METER_COUNT);
    if (isNaN(flowMeterCount)) {
      throw new Error('Invalid flow meter count');
    }

    const liters = flowMeterCount / 695;
    const timestamp = new Date();
    const devId = eventData.DEV_ID;
    const coldWaterTemp = eventData.STAT.COLD_WATER_TEMP;
    const waterType = parseInt(eventData.EROG.WATER_TYPE);

    // Aggiorna i contatori su Redis
    await incrementRedisCounter('totalFlowMeterCount', liters);

    const waterTypeCounts = JSON.parse(await redisClient.get('waterTypeCounts')) || { 0: 0, 1: 0, 2: 0 };
    waterTypeCounts[waterType] += liters;
    await redisClient.set('waterTypeCounts', JSON.stringify(waterTypeCounts));

    // Aggiorna flowData
    await updateFlowData({ timestamp, totalFlowMeterCount: liters });

    // Aggiorna deviceData
    let deviceData = JSON.parse(await redisClient.get('deviceData')) || {};
    if (!deviceData[devId]) {
      deviceData[devId] = { totalFlow: 0, lastColdWaterTemp: 0 };
    }
    deviceData[devId].totalFlow += liters;
    deviceData[devId].lastColdWaterTemp = coldWaterTemp;
    await redisClient.set('deviceData', JSON.stringify(deviceData));

    // Emitti i dati aggiornati ai client
    io.emit('telemetry update', req.body);

    res.status(200).send('Telemetry received');
  } catch (err) {
    return res.status(500).send('Error processing telemetry data');
  }
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
