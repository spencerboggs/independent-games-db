const quiet = () => process.env.DB_QUIET === "1" || process.env.VITEST === "true";

export const log = {
  info(message: string): void {
    if (!quiet()) console.log(message);
  },
  step(message: string): void {
    if (!quiet()) console.log(`\n== ${message}`);
  },
  warn(message: string): void {
    if (!quiet()) console.warn(`warning: ${message}`);
  },
  error(message: string): void {
    console.error(`error: ${message}`);
  },
};
