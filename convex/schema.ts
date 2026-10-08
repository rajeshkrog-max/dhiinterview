// The database tables. Empty on purpose: the data model is its own decision (scope row 2, spec to come),
// and each slice adds the tables it needs. Nothing here may be renamed or removed in the same release
// as the code that stops using it (spec 0001, deploys and environments).
import { defineSchema } from "convex/server";

export default defineSchema({});
