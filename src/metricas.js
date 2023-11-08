/*
Gustavo Sanches Vieira 602183
Iago Eduardo Gonzales Valderramas 555231
Igor Vinicius Medes Cuellar 6070622
Lucas Vela Moreno Dalan 604194
Miguel Francisco Bossoni Barreto 603945
*/

const grpc = require('grpc');
const protoLoader = require('@grpc/proto-loader');
const { Pool } = require('pg');
const moment = require('moment');
const dotenv = require('dotenv');

dotenv.config(); 

const PROTO_PATH = './metrics.proto';
const packageDefinition = protoLoader.loadSync(PROTO_PATH);
const metricsProto = grpc.loadPackageDefinition(packageDefinition).metrics;

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

const server = new grpc.Server();

server.addService(metricsProto.MetricsService.service, {
  AdicionarLocalizacao: (call, callback) => {
    const { idDispositivo, marca, novaLocalizacao } = call.request;

    // Consultar a última localização no banco de dados para o dispositivo
    const consultaUltimaLocalizacao = {
      text: 'SELECT * FROM localizacao WHERE id_dispositivo = $1 ORDER BY created_at DESC LIMIT 1',
      values: [idDispositivo],
    };

    pgClient.query(consultaUltimaLocalizacao, (queryError, resultadoConsulta) => {
      if (queryError) {
        callback(queryError, null);
        return;
      }

      // Calcular a distância entre as coordenadas atuais e as coordenadas anteriores (se disponíveis)
      let distancia = 0;
      if (resultadoConsulta.rows.length > 0) {
        const ultimaLocalizacao = resultadoConsulta.rows[0];
        distancia = calcularDistancia(
          ultimaLocalizacao.latitude, ultimaLocalizacao.longitude,
          novaLocalizacao.latitude, novaLocalizacao.longitude
        );
      }

      // Incrementar o número de posições
      const incrementoPosicoes = 1;

      // Salvar as informações no banco de dados
      const salvarLocalizacao = {
        text: 'INSERT INTO localizacao(id, id_dispositivo, latitude, longitude, distancia, created_at) VALUES($1, $2, $3, $4, $5, $6)',
        values: [uuidv4(), idDispositivo, novaLocalizacao.latitude, novaLocalizacao.longitude, distancia, moment().format('YYYY-MM-DD')],
      };

      pgClient.query(salvarLocalizacao, (insertError, insertResult) => {
        if (insertError) {
          callback(insertError, null);
        } else {
          // Atualizar o número de posições e a distância total do dispositivo
          const atualizarDispositivo = {
            text: 'UPDATE dispositivo SET quantidade_posicao = quantidade_posicao + $1, total_km = total_km + $2 WHERE id = $3',
            values: [incrementoPosicoes, distancia, idDispositivo],
          };

          pgClient.query(atualizarDispositivo, (updateError, updateResult) => {
            if (updateError) {
              callback(updateError, null);
            } else {
              callback(null, { status: 'Localização adicionada com sucesso.' });
            }
          });
        }
      });
    });
  },
});

// Função para calcular a distância em quilômetros entre duas coordenadas geográficas usando a fórmula de Haversine
function calcularDistancia(lat1, lon1, lat2, lon2) {
  const raioTerra = 6371; // Raio médio da Terra em quilômetros

  // Converter graus para radianos
  const radianosLat1 = grausParaRadianos(lat1);
  const radianosLon1 = grausParaRadianos(lon1);
  const radianosLat2 = grausParaRadianos(lat2);
  const radianosLon2 = grausParaRadianos(lon2);

  // Diferença de coordenadas em radianos
  const diferencaLat = radianosLat2 - radianosLat1;
  const diferencaLon = radianosLon2 - radianosLon1;

  // Fórmula de Haversine para calcular a distância entre dois pontos na superfície da Terra
  const a = Math.sin(diferencaLat / 2) ** 2 +
            Math.cos(radianosLat1) * Math.cos(radianosLat2) *
            Math.sin(diferencaLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  // Distância em quilômetros
  const distancia = raioTerra * c;

  return distancia;
}

// Função auxiliar para converter graus para radianos
function grausParaRadianos(graus) {
  return graus * (Math.PI / 180);
}


const PORT = '50051';
server.bind(`0.0.0.0:${PORT}`, grpc.ServerCredentials.createInsecure());
console.log(`Servidor gRPC está ouvindo na porta ${PORT}`);
server.start();

const typeDefs = gql`
  type DispositivoMetrics {
    idDispositivo: ID!
    marca: String!
    quantidadePosicao: Int!
    totalKm: Float!
  }

  type MarcaMetrics {
    quantidadeDispositivo: Int!
    marca: String!
    quantidadePosicao: Int!
    totalKm: Float!
  }

  type GeralMetrics {
    quantidadeDispositivo: Int!
    quantidadePosicao: Int!
    totalKm: Float!
  }

  type Query {
    consultaDispositivo(idDispositivo: ID!, dia: String!): DispositivoMetrics
    consultaMarca(marca: String!, dia: String!): MarcaMetrics
    consultaGeral(dia: String!): GeralMetrics
  }
`;

const resolvers = {
  Query: {
    consultaDispositivo: async (_, { idDispositivo, dia }) => {
      const dataInicio = moment(dia).startOf('day').format();
      const dataFim = moment(dia).endOf('day').format();

      const consultaBanco = `
        SELECT
          dispositivos.id AS idDispositivo,
          dispositivos.marca,
          COUNT(localizacoes.id) AS quantidadePosicao,
          SUM(localizacoes.distancia) AS totalKm
        FROM
          dispositivos
        LEFT JOIN
          localizacoes ON dispositivos.id = localizacoes.id_dispositivo
        WHERE
          dispositivos.id = $1
          AND localizacoes.created_at BETWEEN $2 AND $3
        GROUP BY
          dispositivos.id, dispositivos.marca
      `;

      const { rows } = await pool.query(consultaBanco, [idDispositivo, dataInicio, dataFim]);

      return rows[0];
    },
    consultaMarca: async (_, { marca, dia }) => {
      const dataInicio = moment(dia).startOf('day').format();
      const dataFim = moment(dia).endOf('day').format();

      const consultaBanco = `
        SELECT
          COUNT(dispositivos.id) AS quantidadeDispositivo,
          dispositivos.marca,
          COUNT(localizacoes.id) AS quantidadePosicao,
          SUM(localizacoes.distancia) AS totalKm
        FROM
          dispositivos
        LEFT JOIN
          localizacoes ON dispositivos.id = localizacoes.id_dispositivo
        WHERE
          dispositivos.marca = $1
          AND localizacoes.created_at BETWEEN $2 AND $3
        GROUP BY
          dispositivos.marca
      `;

      const { rows } = await pool.query(consultaBanco, [marca, dataInicio, dataFim]);

      return rows[0];
    },
    consultaGeral: async (_, { dia }) => {
      const dataInicio = moment(dia).startOf('day').format();
      const dataFim = moment(dia).endOf('day').format();

      const consultaBanco = `
        SELECT
          COUNT(DISTINCT dispositivos.id) AS quantidadeDispositivo,
          COUNT(localizacoes.id) AS quantidadePosicao,
          SUM(localizacoes.distancia) AS totalKm
        FROM
          dispositivos
        LEFT JOIN
          localizacoes ON dispositivos.id = localizacoes.id_dispositivo
        WHERE
          localizacoes.created_at BETWEEN $1 AND $2
      `;

      const { rows } = await pool.query(consultaBanco, [dataInicio, dataFim]);

      return rows[0];
    },
  },
};


const serverGraph = new ApolloServer({ typeDefs, resolvers });

const app = express();
serverGraph.applyMiddleware({ app });

const PORTGraph = 4000;
app.listen(PORTGraph, () => {
  console.log(`Servidor GraphQL está ouvindo na porta ${PORTGraph}`);
});