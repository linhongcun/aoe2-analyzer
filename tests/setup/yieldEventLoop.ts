// CI 稳定（#145 A）：vitest 在同一文件的同步用例之间只走微任务，不回到事件循环。
// 像 formatTime.test.ts 这种几百个纯同步用例的文件，会让 worker 的事件循环连续阻塞几十秒，
// 主进程对 onTaskUpdate 的回复排在 IPC 队列里处理不到；birpc 的 60s 计时器先到期，
// 就报「[vitest-worker]: Timeout calling "onTaskUpdate"」，npm test 退出码变 1（用例本身全过）。
// 每个用例结束后让出一次宏任务（setImmediate 在 poll 之后执行，IPC 回复会先被处理），
// 事件循环阻塞时长就只取决于单个用例，而不是整个文件。
import { afterEach } from 'vitest';

afterEach(() => new Promise<void>((resolve) => setImmediate(resolve)));
