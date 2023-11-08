const express = require('express');
const app = express();
const mqttClient = require('./mqtt-publish');
const mqttClientsubscribe = require('./mqtt-subscribe');
const rastreioRoutes = require('./rastreio');
const metricasRoutes = require('./metricas');
const path = require('path');
const socketIo = require('socket.io');

app.use(express.static(path.join(__dirname, '../public')));
app.use('/rastreio', rastreioRoutes);
app.use('/metricas', metricasRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor está ouvindo na porta ${PORT}`);
});

const io = socketIo(server);

io.on('connection', (socket) => {
  console.log('Cliente conectado via WebSocket.');

  socket.on('disconnect', () => {
    console.log('Cliente desconectado do WebSocket.');
  });
});

// Enviar última localização para o cliente via WebSocket
setInterval(() => {
  const dataAtual = moment().format('YYYY-MM-DD');
  const ultimaLocalizacao = (cache[dataAtual] || []).slice(-1)[0] || null;
  io.emit('ultimaLocalizacao', ultimaLocalizacao);
}, 5000); // Enviar a cada 5 segundos (5000 milissegundos)

// Middleware para lidar com erros
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Ocorreu um erro no servidor.');
});

process.on('exit', () => {
  pgClient.end();
  mqttClient.end(); // Fecha a conexão MQTT ao encerrar o processo
});

process.on('SIGINT', () => {
  pgClient.end();
  mqttClient.end(); // Fecha a conexão MQTT ao receber o sinal SIGINT (por exemplo, quando você pressiona Ctrl + C)
  process.exit();
});