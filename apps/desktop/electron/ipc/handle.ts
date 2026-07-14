import { ipcMain, type IpcMainInvokeEvent } from 'electron';

import type { IpcInvokeArgs, IpcInvokeChannel, IpcInvokeResult } from '../ipc-contract.js';

/** Register one handler against the shared serializable invoke contract. */
export const handleIpc = <Channel extends IpcInvokeChannel>(
  channel: Channel,
  handler: (
    event: IpcMainInvokeEvent,
    ...args: IpcInvokeArgs<Channel>
  ) => IpcInvokeResult<Channel> | Promise<IpcInvokeResult<Channel>>,
): void => {
  ipcMain.handle(channel, handler);
};
