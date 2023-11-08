/*
Gustavo Sanches Vieira 602183
Iago Eduardo Gonzales Valderramas 555231
Igor Vinicius Medes Cuellar 6070622
Lucas Vela Moreno Dalan 604194
Miguel Francisco Bossoni Barreto 603945
*/

const mqtt = require('mqtt');
const uuid = require('uuid');

// Função para gerar dados de localização aleatórios com ID único usando UUID
function gerarDadosLocalizacao() {
  const id = uuid.v4(); // Gera um ID único usando UUID v4
  const latitude = (Math.random() * 180) - 90; // Latitude aleatória entre -90 e 90
  const longitude = (Math.random() * 360) - 180; // Longitude aleatória entre -180 e 180
  return { id, latitude, longitude };
}

// Conectar ao broker MQTT
var client = mqtt.connect(process.env.MQTT_BROKER);

// Publicar dados de localização a cada 5 segundos
setInterval(() => {
  const dadosLocalizacao = gerarDadosLocalizacao();
  client.publish(process.env.MQTT_TOPIC, JSON.stringify(dadosLocalizacao));
  console.log('Dados de localização publicados:', dadosLocalizacao);
}, 5000); // Publica a cada 5 segundos (5000 milissegundos)

// Lidar com eventos de conexão MQTT
client.on('connect', () => {
  console.log('Conectado ao broker MQTT');
});

client.on('error', (error) => {
  console.error('Erro de conexão MQTT:', error);
});
