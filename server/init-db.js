// Crea la base (si hace falta) y aplica server/schema.sql.
// Se ejecuta con: npm run db:init

import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const database = process.env.DB_NAME ?? 'timer_app';

// El nombre de la base se interpola en SQL, así que solo permitimos
// letras, números y guion bajo.
if (!/^[A-Za-z0-9_]+$/.test(database)) {
  throw new Error(`Nombre de base inválido: ${database}`);
}

const connectionOptions = {
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 3307),
  user: process.env.DB_USER ?? 'timer',
  password: process.env.DB_PASSWORD ?? 'timer',
  multipleStatements: true,
};

const schemaPath = fileURLToPath(new URL('./schema.sql', import.meta.url));

let connection;

try {
  // Primer intento: conectar directamente a la base.
  connection = await mysql.createConnection({
    ...connectionOptions,
    database,
  });
} catch (error) {
  if (error.code !== 'ER_BAD_DB_ERROR') throw error;

  // Si la base no existe, se crea desde una conexión sin base.
  console.log(`La base "${database}" no existe; creándola...`);
  const admin = await mysql.createConnection(connectionOptions);

  try {
    await admin.query(
      `CREATE DATABASE IF NOT EXISTS \`${database}\`
       CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  } finally {
    await admin.end();
  }

  connection = await mysql.createConnection({
    ...connectionOptions,
    database,
  });
}

try {
  const schema = await readFile(schemaPath, 'utf8');
  await connection.query(schema);
  console.log(`Esquema aplicado en "${database}" (${connectionOptions.host}:${connectionOptions.port}).`);
} finally {
  await connection.end();
}
