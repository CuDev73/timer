// Conexión a MySQL/MariaDB mediante un pool de mysql2.
// Las fechas DATE se devuelven como strings 'YYYY-MM-DD' para que el núcleo
// reciba exactamente el mismo formato que en las pruebas.

import 'dotenv/config';
import mysql from 'mysql2/promise';

export const pool = mysql.createPool({
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 3307),
  user: process.env.DB_USER ?? 'timer',
  password: process.env.DB_PASSWORD ?? 'timer',
  database: process.env.DB_NAME ?? 'timer_app',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true,
  charset: 'utf8mb4_unicode_ci',
});

/**
 * Ejecuta una función dentro de una transacción.
 * Si algo falla, hace rollback y vuelve a lanzar el error.
 */
export async function withTransaction(callback) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
