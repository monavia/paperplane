import { TaskQueue } from '../../worker/TaskQueue.js';
import AIDJInstance from '../engine/AIDJ.js';
import AIEngine from '../engine/AIEngine.js';
import Logger from '../../core/utils/Logger.js';

const AI_QUEUE_CONCURRENCY = parseInt(process.env.AI_QUEUE_CONCURRENCY || '4');
const AI_QUEUE_TIMEOUT = parseInt(process.env.AI_QUEUE_TIMEOUT || '30000');

let aiQueue: TaskQueue | null = null;
let interpretImpl: (userId: string, input: string) => Promise<any> = (userId, input) => new AIDJInstance().interpret(userId, input);
let askImpl: (userId: string, input: string, sysPrompt: string, opts?: any) => Promise<any> =
  (userId, input, sysPrompt, opts) => AIEngine.ask(userId, input, sysPrompt, opts);

function getAIQueue(): TaskQueue {
  if (!aiQueue) {
    aiQueue = new TaskQueue({
      maxConcurrent: AI_QUEUE_CONCURRENCY,
      maxRetries: 1,
      defaultTimeout: AI_QUEUE_TIMEOUT,
    });
    aiQueue.setProcessor(async (task: any) => {
      if (task.type === 'ai:interpret') return await interpretImpl(task.data.userId, task.data.input);
      if (task.type === 'ai:ask') return await askImpl(task.data.userId, task.data.input, task.data.sysPrompt, task.data.opts);
      throw new Error(`Unknown AI task type: ${task.type}`);
    });
    aiQueue.on('task:failed', (t: any) =>
      Logger.error(`[AITaskQueue] ${t.type} failed: ${t.error}`)
    );
    aiQueue.on('task:completed', () => {});
  }
  return aiQueue;
}

async function runQueued(type: string, data: any): Promise<any> {
  const queue = getAIQueue();
  return await queue.addAndWait({
    id: `ai-${type}-${Date.now()}`,
    type,
    data,
    priority: 'normal',
    timeout: AI_QUEUE_TIMEOUT,
  });
}

export async function runAIInterpret(userId: string, input: string): Promise<any> {
  try {
    return await runQueued('ai:interpret', { userId, input });
  } catch (err) {
    Logger.warn(`[AITaskQueue] interpret queue failed, direct fallback: ${err}`);
    return await interpretImpl(userId, input);
  }
}

export async function runAIAsk(userId: string, input: string, sysPrompt: string, opts?: any): Promise<any> {
  try {
    return await runQueued('ai:ask', { userId, input, sysPrompt, opts });
  } catch (err) {
    Logger.warn(`[AITaskQueue] ask queue failed, direct fallback: ${err}`);
    return await askImpl(userId, input, sysPrompt, opts);
  }
}
