/*
Gustavo Sanches Vieira 602183
Iago Eduardo Gonzales Valderramas 555231
Igor Vinicius Medes Cuellar 6070622
Lucas Vela Moreno Dalan 604194
Miguel Francisco Bossoni Barreto 603945
*/

const express = require('express');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const { Client } = require('pg');
const amqp = require('amqplib/callback_api');
const socketIo = require('socket.io');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const port = process.env.PORT ||3000;

const dbConfig = {
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
};

const cache = {}; // Cache para armazenar dados do dia

app.use(bodyParser.json());

// Conectar ao PostgreSQL
const pgClient = new Client(dbConfig);
pgClient.connect();

// Conectar ao RabbitMQ e consumir mensagens da fila
amqp.connect(process.env.RABBITMQ_URL, (error, connection) => {
  if (error) {
    throw error;
  }

  connection.createChannel((channelError, channel) => {
    if (channelError) {
      throw channelError;
    }

    const queueName = 'localizacaoQueue';
    channel.assertQueue(queueName, {
      durable: true
    });

    console.log(`Consumidor está esperando por mensagens na fila ${queueName}.`);

    // Consumir mensagens da fila
    channel.consume(queueName, (message) => {
      if (message !== null) {
        const data = JSON.parse(message.content.toString());
        const { id_dispositivo, latitude, longitude } = data;

        // Verificar se o dispositivo existe e está ativo no banco de dados
        const dispositivoQuery = {
          text: 'SELECT * FROM dispositivo WHERE id = $1 AND ativo = true',
          values: [id_dispositivo]
        };

        pgClient.query(dispositivoQuery, (queryError, dispositivoResult) => {
          if (queryError) {
            throw queryError;
          }

          if (dispositivoResult.rows.length > 0) {
            // Salvar no banco de dados
            const localizacaoQuery = {
              text: 'INSERT INTO localizacao(id, id_dispositivo, latitude, longitude, created_at) VALUES($1, $2, $3, $4, $5)',
              values: [uuidv4(), id_dispositivo, latitude, longitude, moment().format()]
            };

            pgClient.query(localizacaoQuery, (insertError, insertResult) => {
              if (insertError) {
                throw insertError;
              }
              console.log('Dados de localização salvos no banco de dados.');

              // Salvar na cache (limpar cache no próximo dia)
              const dataAtual = moment().format('YYYY-MM-DD');
              if (!cache[dataAtual]) {
                cache[dataAtual] = [];
              }
              cache[dataAtual].push({ id_dispositivo, latitude, longitude });
            });
          } else {
            console.log('Dispositivo não encontrado ou inativo.');
          }
        });

        // Acknowledge a mensagem para removê-la da fila
        channel.ack(message);
      }
    });
  });
});

// API REST para rastreio
app.post('/localizacao', (req, res) => {
  const { id_dispositivo, latitude, longitude } = req.body;

  // Verificar se o dispositivo existe e está ativo no banco de dados
  const dispositivoQuery = {
    text: 'SELECT * FROM dispositivo WHERE id = $1 AND ativo = true',
    values: [id_dispositivo]
  };

  pgClient.query(dispositivoQuery, (queryError, dispositivoResult) => {
    if (queryError) {
      throw queryError;
    }

    if (dispositivoResult.rows.length > 0) {
      // Salvar no banco de dados
      const localizacaoQuery = {
        text: 'INSERT INTO localizacao(id, id_dispositivo, latitude, longitude, created_at) VALUES($1, $2, $3, $4, $5)',
        values: [uuidv4(), id_dispositivo, latitude, longitude, moment().format()]
      };

      pgClient.query(localizacaoQuery, (insertError, insertResult) => {
        if (insertError) {
          throw insertError;
        }
        console.log('Dados de localização salvos no banco de dados.');

        // Salvar na cache (limpar cache no próximo dia)
        const dataAtual = moment().format('YYYY-MM-DD');
        if (!cache[dataAtual]) {
          cache[dataAtual] = [];
        }
        cache[dataAtual].push({ id_dispositivo, latitude, longitude });

        res.status(200).send('Dados de localização salvos no banco de dados e na cache.');
      });
    } else {
      res.status(404).send('Dispositivo não encontrado ou inativo.');
    }
  });
});

// Consulta do histórico de localização do dispositivo
app.get('/localizacao/:id_dispositivo', (req, res) => {
  const { id_dispositivo } = req.params;

  // Consultar no banco de dados e na cache
  const dataAtual = moment().format('YYYY-MM-DD');
  const historico = [...(cache[dataAtual] || []), ...(cache[req.query.data] || [])];

  const localizacaoQuery = {
    text: 'SELECT * FROM localizacao WHERE id_dispositivo = $1',
    values: [id_dispositivo]
  };

  pgClient.query(localizacaoQuery, (queryError, queryResult) => {
    if (queryError) {
      throw queryError;
    }

    const resultadoBanco = queryResult.rows.map(row => {
      return {
        id: row.id,
        id_dispositivo: row.id_dispositivo,
        latitude: row.latitude,
        longitude: row.longitude,
        created_at: row.created_at
      };
    });

    res.status(200).json({
      historico,
      resultadoBanco
    });
  });
});

// WebSocket para fornecer a última localização
const server = app.listen(port, () => {
  console.log(`API de rastreio está ouvindo na porta ${port}.`);
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
});

process.on('SIGINT', () => {
  pgClient.end();
  process.exit();
});
