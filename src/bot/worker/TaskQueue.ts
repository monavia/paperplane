import { EventEmitter } from 'events';
import Logger from '../core/utils/Logger.js';

export interface QueuedTask {
  id: string;
  type: string;
  data: any;
  priority: 'low' | 'normal' | 'high';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'retrying';
  retries: number;
  maxRetries: number;
  timeout: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  result?: any;
  settled?: boolean;
}

export class TaskQueue extends EventEmitter {
  private tasks = new Map<string, QueuedTask>();
  private order: string[] = [];
  private maxConcurrent: number;
  private maxRetries: number;
  private defaultTimeout: number;
  private retryDelay: number;
  private activeCount = 0;
  private processor: ((task: QueuedTask) => Promise<void>) | null = null;

  constructor(options: {
    maxConcurrent?: number;
    maxRetries?: number;
    defaultTimeout?: number;
    retryDelay?: number;
  } = {}) {
    super();
    this.maxConcurrent = options.maxConcurrent || 5;
    this.maxRetries = options.maxRetries || 3;
    this.defaultTimeout = options.defaultTimeout || 30000;
    this.retryDelay = options.retryDelay || 5000;
  }

  setProcessor(fn: (task: QueuedTask) => Promise<void>): void {
    this.processor = fn;
  }

  addAndWait(task: Partial<QueuedTask>): Promise<any> {
    return new Promise((resolve, reject) => {
      const t: QueuedTask = {
        id: task.id || `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: task.type || 'generic',
        data: task.data || {},
        priority: task.priority || 'normal',
        status: 'pending',
        retries: 0,
        maxRetries: task.maxRetries ?? this.maxRetries,
        timeout: task.timeout ?? this.defaultTimeout,
        createdAt: Date.now(),
        settled: false,
      };
      const cleanup = () => {
        this.off('task:completed', onComplete);
        this.off('task:failed', onFailed);
      };
      const onComplete = (done: QueuedTask) => {
        if (done.id === t.id) {
          cleanup();
          resolve(done.result);
        }
      };
      const onFailed = (done: QueuedTask) => {
        if (done.id === t.id) {
          cleanup();
          reject(new Error(done.error || 'Task failed'));
        }
      };
      this.on('task:completed', onComplete);
      this.on('task:failed', onFailed);
      this.tasks.set(t.id, t);
      this.order.push(t.id);
      this.processNext();
    });
  }

  private processNext(): void {
    if (!this.processor || this.activeCount >= this.maxConcurrent) return;
    const id = this.nextPending();
    if (!id) return;
    const task = this.tasks.get(id);
    if (!task) return;
    task.status = 'running';
    task.startedAt = Date.now();
    task.settled = false;
    this.activeCount++;
    this.order = this.order.filter((x) => x !== id);
    const timer = setTimeout(() => this.handleTimeout(task), task.timeout);
    this.processor(task)
      .then((result) => this.finish(task, 'completed', undefined, result, timer))
      .catch((err) => {
        clearTimeout(timer);
        task.retries++;
        if (task.retries <= task.maxRetries) {
          task.status = 'retrying';
          task.error = err?.message;
          this.activeCount--;
          this.emit('task:retrying', task);
          setTimeout(() => {
            task.status = 'pending';
            this.order.push(task.id);
            this.processNext();
          }, this.retryDelay);
        } else {
          this.finish(task, 'failed', err?.message, undefined, timer);
        }
      });
  }

  private finish(task: QueuedTask, status: 'completed' | 'failed', error: string | undefined, result?: any, timer?: any): void {
    if (task.settled) return;
    task.settled = true;
    if (timer) clearTimeout(timer);
    this.activeCount--;
    task.status = status;
    if (error) task.error = error;
    if (result !== undefined) task.result = result;
    task.completedAt = Date.now();
    this.tasks.delete(task.id);
    this.emit(status === 'completed' ? 'task:completed' : 'task:failed', task);
    this.processNext();
  }

  private handleTimeout(task: QueuedTask): void {
    this.finish(task, 'failed', 'Timeout');
  }

  private nextPending(): string | null {
    const priorityOrder = ['high', 'normal', 'low'];
    for (const p of priorityOrder) {
      const id = this.order.find((x) => {
        const t = this.tasks.get(x);
        return t && t.status === 'pending' && t.priority === p;
      });
      if (id) return id;
    }
    return null;
  }

  getQueueLength(): number {
    return this.order.length;
  }

  getActiveCount(): number {
    return this.activeCount;
  }
}
