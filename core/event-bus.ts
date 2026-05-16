import { EventEmitter } from "node:events";

export type EventHandler<T = unknown> = (payload: T) => void;

/**
 * Thin, typed wrapper around Node.js {@link EventEmitter}.
 *
 * Handlers passed to {@link unsubscribe} must be the same function reference
 * that was passed to {@link subscribe}.
 */
export class EventBus {
  private readonly emitter = new EventEmitter();

  emit<T>(event: string, payload: T): boolean {
    return this.emitter.emit(event, payload);
  }

  subscribe<T>(event: string, handler: EventHandler<T>): void {
    this.emitter.on(event, handler);
  }

  unsubscribe<T>(event: string, handler: EventHandler<T>): void {
    this.emitter.off(event, handler);
  }
}
