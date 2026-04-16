// MongoDB → PostgreSQL migration shim
// All consumers of this module continue to work unchanged.
export { db, ObjectId } from "./pgClient";
