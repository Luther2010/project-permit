/**
 * Quick script to check which DATABASE_URL is being used
 */

const dbUrl = process.env.DATABASE_URL || "";

console.log("Current DATABASE_URL:");
console.log(dbUrl ? dbUrl.replace(/:[^:@]+@/, ":****@") : "(not set)");
console.log("");

if (dbUrl.includes("localhost") || dbUrl.includes("127.0.0.1")) {
  console.log("📍 Database: LOCAL/DEV");
} else if (dbUrl.includes("dev")) {
  console.log("📍 Database: DEVELOPMENT");
} else if (dbUrl.includes("neon") || dbUrl.includes("postgres")) {
  console.log("📍 Database: PRODUCTION (or shared Neon)");
} else {
  console.log("📍 Database: UNKNOWN");
}

