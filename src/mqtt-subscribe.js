/*
Gustavo Sanches Vieira 602183
Iago Eduardo Gonzales Valderramas 555231
Igor Vinicius Medes Cuellar 6070622
Lucas Vela Moreno Dalan 604194
Miguel Francisco Bossoni Barreto 603945
*/

const mqtt = require('mqtt');
const amqp = require('amqplib/callback_api');

// Configurações do RabbitMQ
const rabbitMQUrl = 'amqp://localhost'; 
const queueName = 'localizacaoQueue'; 

// Conectando ao broker MQTT
const client = mqtt.connect(process.env.MQTT_BROKER);

// Conectando ao RabbitMQ e criando a fila
amqp.connect(rabbitMQUrl, (error, connection) => {
  if (error) {
    throw error;
  }

  connection.createChannel((channelError, channel) => {
    if (channelError) {
      throw channelError;
    }

    // Declarar a fila
    channel.assertQueue(queueName, {
      durable: true
    });

    // Lógica para lidar com mensagens MQTT
    client.on('connect', () => {
      console.log('Conectado ao broker MQTT');
      client.subscribe(process.env.MQTT_TOPIC);
    });

    client.on('message', (topic, message) => {
      // Convertendo a mensagem do formato JSON
      const data = JSON.parse(message.toString());

      // Enviando dados para a fila RabbitMQ
      channel.sendToQueue(queueName, Buffer.from(JSON.stringify({
        id: data.id,
        latitude: data.latitude,
        longitude: data.longitude
      })));

      console.log('Dados enviados com sucesso para a fila RabbitMQ:', data);
    });

    // Lidando com erros MQTT
    client.on('error', (error) => {
      console.error('Erro de conexão MQTT:', error);
    });
  });
});