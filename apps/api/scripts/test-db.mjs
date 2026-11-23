import postgres from 'postgres';

const url = process.env.DATABASE_URL ?? 'postgresql://bayadrent:bayadrent@127.0.0.1:5432/bayadrent';
const sql = postgres(url, { max: 1 });

try {
  const rows = await sql`select 1 as ok`;
  console.log('ok', rows);
} catch (error) {
  console.error('fail', error);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
