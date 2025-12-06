#!/usr/bin/env node
// cleanup_db_non_messages.js
// Usage:
//   node cleanup_db_non_messages.js --preview
//   node cleanup_db_non_messages.js --backup --yes
// Environment variables (if not set defaults will be used):
//   MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DB

const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

const argv = require("minimist")(process.argv.slice(2));

const MYSQL_HOST =
  process.env.MYSQL_HOST ||
  process.env.DATABASE_HOST ||
  "rm-2zeah3p38pm2zu3n06o.mysql.rds.aliyuncs.com";
const MYSQL_PORT = process.env.MYSQL_PORT || 3306;
const MYSQL_USER =
  process.env.MYSQL_USER || process.env.DATABASE_USER || "root";
const MYSQL_PASSWORD =
  process.env.MYSQL_PASSWORD || process.env.DATABASE_PASSWORD || "";
const MYSQL_DB =
  process.env.MYSQL_DB || process.env.DATABASE_NAME || "chatroom";

async function main() {
  console.log(
    "[cleanup] connecting to",
    MYSQL_HOST,
    MYSQL_PORT,
    "db:",
    MYSQL_DB,
    "user:",
    MYSQL_USER
  );
  const pool = mysql.createPool({
    host: MYSQL_HOST,
    port: MYSQL_PORT,
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    database: MYSQL_DB,
    waitForConnections: true,
    connectionLimit: 4,
    queueLimit: 0,
    charset: "utf8mb4",
  });

  try {
    const [countRows] = await pool.execute(
      "SELECT COUNT(*) AS cnt FROM chat_messages WHERE msg_type <> 'message'"
    );
    const toDelete =
      countRows && countRows[0] && countRows[0].cnt ? countRows[0].cnt : 0;
    console.log(
      "[cleanup] found",
      toDelete,
      "rows where msg_type <> 'message'"
    );

    if (toDelete === 0) {
      console.log("[cleanup] nothing to do");
      await pool.end();
      return;
    }

    // Preview sample rows
    const [samples] = await pool.execute(
      "SELECT id, ts, username, msg_type, LEFT(content, 200) AS preview FROM chat_messages WHERE msg_type <> 'message' ORDER BY ts DESC LIMIT 20"
    );
    console.log("[cleanup] sample rows (up to 20):");
    console.table(samples);

    if (argv.preview && !argv.yes) {
      console.log(
        "\nPreview mode: run with --yes to perform deletion, add --backup to save a JSON backup before deleting."
      );
      await pool.end();
      return;
    }

    if (argv.backup) {
      console.log("[cleanup] backing up rows to backup file");
      const [allRows] = await pool.execute(
        "SELECT * FROM chat_messages WHERE msg_type <> 'message'"
      );
      const backupPath = path.join(
        __dirname,
        `chat_messages_non_message_backup_${Date.now()}.json`
      );
      fs.writeFileSync(backupPath, JSON.stringify(allRows, null, 2), "utf8");
      console.log("[cleanup] backup saved to", backupPath);
    }

    if (!argv.yes) {
      console.log(
        "\nNo --yes flag provided. Aborting. Use --yes to perform deletion."
      );
      await pool.end();
      return;
    }

    console.log("[cleanup] Deleting rows...");
    const [res] = await pool.execute(
      "DELETE FROM chat_messages WHERE msg_type <> 'message'"
    );
    console.log("[cleanup] Deleted rows:", res.affectedRows);
    await pool.end();
    console.log("[cleanup] Done");
  } catch (e) {
    console.error("[cleanup] error:", e.message || e);
    try {
      await pool.end();
    } catch (err) {}
    process.exit(1);
  }
}

main();
