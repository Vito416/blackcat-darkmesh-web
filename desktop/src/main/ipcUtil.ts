import { ipcMain, IpcMainInvokeEvent } from "electron";
import { z, ZodTypeAny } from "zod";
import { InvokeChannel, isTrustedRendererOrigin } from "../shared/ipc";

type Handler<Schema extends ZodTypeAny, Result> = (
  parsed: z.infer<Schema>,
  event: IpcMainInvokeEvent,
) => Promise<Result> | Result;

export const noArgs = z.tuple([]);

export const safeHandle = <Schema extends ZodTypeAny, Result>(
  channel: InvokeChannel,
  schema: Schema,
  handler: Handler<Schema, Result>,
): void => {
  ipcMain.handle(channel, async (event, ...args: unknown[]) => {
    if (!isTrustedRendererOrigin(event.senderFrame?.url)) {
      throw new Error(`Blocked IPC from untrusted origin for ${channel}`);
    }

    const parsed = schema.parse(args);
    return handler(parsed, event);
  });
};
