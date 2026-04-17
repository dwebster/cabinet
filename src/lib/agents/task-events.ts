import { EventEmitter } from "events";
import type { TaskEvent } from "../../types/tasks";

class TaskEventBus extends EventEmitter {
  emitTaskEvent(event: TaskEvent): void {
    this.emit("event", event);
    this.emit(`task:${event.taskId}`, event);
  }

  subscribe(taskId: string | undefined, listener: (event: TaskEvent) => void): () => void {
    const channel = taskId ? `task:${taskId}` : "event";
    this.on(channel, listener);
    return () => {
      this.off(channel, listener);
    };
  }
}

const globalKey = "__cabinetTaskEventBus__";
const globalScope = globalThis as unknown as { [globalKey]?: TaskEventBus };

export const taskEvents: TaskEventBus =
  globalScope[globalKey] ??
  (() => {
    const instance = new TaskEventBus();
    instance.setMaxListeners(200);
    globalScope[globalKey] = instance;
    return instance;
  })();

export function publishTaskEvent(event: Omit<TaskEvent, "ts"> & { ts?: string }): void {
  taskEvents.emitTaskEvent({
    ...event,
    ts: event.ts ?? new Date().toISOString(),
  });
}
