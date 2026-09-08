import { cronJobs } from "convex/server";
import { api } from "./_generated/api";

const crons = cronJobs();

crons.interval("refresh CPSC recalls daily", { hours: 24 }, api.recallsActions.refreshRecalls, {});

export default crons;
