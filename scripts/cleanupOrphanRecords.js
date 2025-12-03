require("dotenv").config();
const mysql = require("mysql2/promise");

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  const [result] = await conn.execute(
    `DELETE FROM item_images WHERE file_path LIKE '%uploads/items/%'`
  );

  console.log(
    "Deleted",
    result.affectedRows,
    "orphan records from item_images"
  );
  await conn.end();
})();
