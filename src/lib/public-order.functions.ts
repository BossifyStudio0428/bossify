import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { loadPublicOrderForm, createPublicOrder } from "./public-order.server";

const CODE_RE = /^[a-z0-9_-]{4,32}$/i;

export const getPublicOrderForm = createServerFn({ method: "GET" })
  .inputValidator((input: { code: string }) => {
    return z.object({ code: z.string().regex(CODE_RE) }).parse(input);
  })
  .handler(async ({ data }) => {
    return loadPublicOrderForm(data.code);
  });

export const submitPublicOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input)
  .handler(async ({ data }) => {
    return createPublicOrder(data);
  });