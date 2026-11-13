import { z } from 'zod';

/** Convert integer cents to a dollar number for API responses. */
export const toDollars = (cents) => Math.round(cents) / 100;

/**
 * Zod schema accepting a dollar amount (number or numeric string) with at most
 * two decimals and converting it to integer cents.
 */
export const dollarsToCents = (label) =>
  z
    .union([z.number(), z.string().trim().min(1)])
    .transform((v, ctx) => {
      const n = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(n)) {
        ctx.addIssue({ code: 'custom', message: `${label} must be a number.` });
        return z.NEVER;
      }
      if (n < 0) {
        ctx.addIssue({ code: 'custom', message: `${label} cannot be negative.` });
        return z.NEVER;
      }
      const cents = Math.round(n * 100);
      if (Math.abs(n * 100 - cents) > 1e-6) {
        ctx.addIssue({ code: 'custom', message: `${label} can have at most two decimal places.` });
        return z.NEVER;
      }
      if (cents > 100_000_000_00) {
        ctx.addIssue({ code: 'custom', message: `${label} is too large.` });
        return z.NEVER;
      }
      return cents;
    });
