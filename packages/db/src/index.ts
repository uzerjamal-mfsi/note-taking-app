// Prisma is initialized (schema + datasource) but has no models yet, so
// `prisma generate` cannot produce a client (it refuses with zero models).
// Once the first model/migration lands, export a `PrismaClient` singleton
// from here for `apps/api` to import.
export {};
